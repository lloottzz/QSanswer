"""AI 答题助手 —— Flask 本地服务"""

import os
import json
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from deepseek_client import DeepSeekClient

load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(BASE_DIR, "history.json")

try:
    client = DeepSeekClient()
    print("[OK] DeepSeek 客户端初始化成功")
except ValueError as e:
    print(f"[ERROR] {e}")
    print("[INFO] 请设置环境变量 DEEPSEEK_API_KEY 或在项目目录创建 .env 文件")
    client = None


def safe_call(fn, *args, **kwargs):
    """安全调用，捕获异常返回 JSON"""
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.route("/api/vision", methods=["POST"])
def api_vision():
    if client is None:
        return jsonify({"success": False, "error": "API Key 未配置"}), 500

    data = request.get_json(silent=True)
    if not data or "image" not in data:
        return jsonify({"success": False, "error": "缺少 image 字段"}), 400

    image = data["image"]
    mode = data.get("mode", "normal")
    if mode not in ("normal", "think", "deep"):
        return jsonify({"success": False, "error": "mode 必须是 normal/think/deep"}), 400

    print(f"[API] /api/vision mode={mode} image_size={len(image)}")
    result = safe_call(client.vision, image, mode)
    return jsonify(result)


@app.route("/api/ask", methods=["POST"])
def api_ask():
    if client is None:
        return jsonify({"success": False, "error": "API Key 未配置"}), 500

    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"success": False, "error": "缺少 text 字段"}), 400

    text = data["text"]
    mode = data.get("mode", "normal")
    if mode not in ("normal", "think", "deep"):
        return jsonify({"success": False, "error": "mode 必须是 normal/think/deep"}), 400

    print(f"[API] /api/ask mode={mode} text_len={len(text)}")
    result = safe_call(client.chat, text, mode)
    return jsonify(result)


@app.route("/api/chat", methods=["POST"])
def api_chat():
    if client is None:
        return jsonify({"success": False, "error": "API Key 未配置"}), 500

    data = request.get_json(silent=True)
    if not data or "session_id" not in data or "message" not in data:
        return jsonify({"success": False, "error": "缺少 session_id 或 message 字段"}), 400

    sid = str(data["session_id"])
    message = str(data["message"])
    print(f"[API] /api/chat session={sid[:8]}... msg_len={len(message)}")
    result = safe_call(client.continue_chat, sid, message)
    return jsonify(result)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if client else "no_api_key",
        "model": "deepseek-v4-pro",
    })


@app.route("/panel")
def panel():
    """答题面板页面"""
    return send_from_directory(BASE_DIR, "panel.html")


# ---- 历史记录（文件存储） ----

def _load_history():
    """从文件读取历史记录"""
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def _save_history(hist):
    """保存历史记录到文件"""
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(hist, f, ensure_ascii=False, indent=2)
    except (IOError, OSError) as e:
        print(f"[WARN] 保存历史记录失败: {e}")


@app.route("/api/history", methods=["GET"])
def api_history_list():
    """获取全部历史记录"""
    return jsonify({"success": True, "history": _load_history()})


@app.route("/api/history", methods=["POST"])
def api_history_add():
    """添加一条历史记录"""
    data = request.get_json(silent=True)
    if not data or "content" not in data:
        return jsonify({"success": False, "error": "缺少 content 字段"}), 400

    hist = _load_history()
    preview = data["content"].replace("\n", " ")[:60]
    hist.insert(0, {
        "id": int(time.time() * 1000),
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "preview": preview,
        "content": data["content"],
    })
    if len(hist) > 50:
        hist = hist[:50]
    _save_history(hist)
    return jsonify({"success": True})


@app.route("/api/history", methods=["DELETE"])
def api_history_clear():
    """清空历史记录"""
    _save_history([])
    return jsonify({"success": True})


if __name__ == "__main__":
    print("=" * 50)
    print("  AI 答题助手服务启动")
    print("  地址: http://127.0.0.1:5000")
    print("  接口: POST /api/vision | /api/ask | /api/chat")
    print("=" * 50)
    app.run(host="127.0.0.1", port=5000, debug=False)
