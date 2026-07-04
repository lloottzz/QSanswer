"""AI 答题助手 —— Flask 本地服务"""

import os
import json
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from deepseek_client import DeepSeekClient
from notebook import NotebookStore
from analysis_engine import AnalysisEngine

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

# 初始化错题本和分析引擎
try:
    notebook_store = NotebookStore()
    analysis_engine = AnalysisEngine(client)
    print("[OK] 错题本和分析引擎初始化成功")
except Exception as e:
    print(f"[WARN] 错题功能初始化失败: {e}")
    notebook_store = None
    analysis_engine = None


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


# ---- 错题分析 API ----

@app.route("/api/wrong/analyze", methods=["POST"])
def api_wrong_analyze():
    if client is None:
        return jsonify({"success": False, "error": "API Key 未配置"}), 500
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    data = request.get_json(silent=True)
    if not data or "question" not in data or "correct_answer" not in data:
        return jsonify({"success": False, "error": "缺少 question 或 correct_answer"}), 400

    session_id = str(data.get("session_id", ""))
    question = str(data["question"])
    correct_answer = str(data["correct_answer"])
    wrong_answer = str(data.get("wrong_answer", ""))
    source_url = str(data.get("source_url", ""))
    mode = data.get("mode", "normal")

    print(f"[API] /api/wrong/analyze question_len={len(question)}")
    result = safe_call(analysis_engine.analyze, question, correct_answer, wrong_answer, mode)

    if result.get("success"):
        try:
            entry_id = notebook_store.add_entry(
                session_id=session_id,
                question=question,
                correct_answer=correct_answer,
                wrong_answer=wrong_answer,
                analysis=result["analysis"],
                knowledge_tags=result.get("knowledge_tags", []),
                practice_question=result.get("practice_question", ""),
                practice_answer=result.get("practice_answer", ""),
                source_url=source_url,
                subject=result.get("subject", ""),
            )
            result["entry_id"] = entry_id
        except Exception as e:
            result["entry_id"] = 0
            result["db_error"] = str(e)
            print(f"[WARN] 保存错题失败: {e}")

    return jsonify(result)


@app.route("/api/wrong/practice", methods=["POST"])
def api_wrong_practice():
    if client is None:
        return jsonify({"success": False, "error": "API Key 未配置"}), 500
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    data = request.get_json(silent=True)
    if not data or "entry_id" not in data or "user_answer" not in data:
        return jsonify({"success": False, "error": "缺少 entry_id 或 user_answer"}), 400

    entry_id = data["entry_id"]
    user_answer = str(data["user_answer"])

    entry = notebook_store.get_entry(entry_id)
    if not entry:
        return jsonify({"success": False, "error": "错题记录不存在"}), 404

    print(f"[API] /api/wrong/practice entry_id={entry_id}")
    result = safe_call(
        analysis_engine.check_practice,
        entry["practice_question"], entry["practice_answer"], user_answer
    )

    if result.get("success"):
        try:
            notebook_store.update_practice_result(
                entry_id, "correct" if result.get("is_correct") else "wrong"
            )
        except Exception as e:
            print(f"[WARN] 更新练习结果失败: {e}")

    return jsonify(result)


@app.route("/api/wrong/notebook", methods=["GET"])
def api_wrong_notebook_list():
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    tag = request.args.get("tag", None, type=str)
    result_filter = request.args.get("result", None, type=str)
    subject_filter = request.args.get("subject", None, type=str)

    data = notebook_store.list_entries(page=page, per_page=per_page, tag=tag, result=result_filter, subject=subject_filter)
    return jsonify({"success": True, **data})


@app.route("/api/wrong/notebook/<int:entry_id>", methods=["GET"])
def api_wrong_notebook_detail(entry_id):
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    entry = notebook_store.get_entry(entry_id)
    if not entry:
        return jsonify({"success": False, "error": "记录不存在"}), 404
    return jsonify({"success": True, "entry": entry})


@app.route("/api/wrong/notebook/<int:entry_id>", methods=["DELETE"])
def api_wrong_notebook_delete(entry_id):
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    ok = notebook_store.delete_entry(entry_id)
    return jsonify({"success": ok})


@app.route("/api/wrong/stats", methods=["GET"])
def api_wrong_stats():
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    stats = notebook_store.get_stats()
    return jsonify({"success": True, **stats})


@app.route("/api/wrong/graph", methods=["GET"])
def api_wrong_graph():
    """返回知识图谱数据（节点+边）"""
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500
    graph = notebook_store.get_graph()
    return jsonify({"success": True, **graph})


@app.route("/api/wrong/quick-add", methods=["POST"])
def api_wrong_quick_add():
    """快速入册错题（不调用AI分析），用于"做错了"立即保存"""
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    data = request.get_json(silent=True) or {}
    if "question" not in data or "correct_answer" not in data:
        return jsonify({"success": False, "error": "缺少 question 或 correct_answer"}), 400

    session_id = str(data.get("session_id", ""))
    question = str(data["question"])
    correct_answer = str(data["correct_answer"])
    wrong_answer = str(data.get("wrong_answer", ""))
    source_url = str(data.get("source_url", ""))
    subject = str(data.get("subject", ""))

    try:
        entry_id = notebook_store.add_entry(
            session_id=session_id,
            question=question,
            correct_answer=correct_answer,
            wrong_answer=wrong_answer,
            analysis="",  # 待分析
            knowledge_tags=[],
            practice_question="",
            practice_answer="",
            source_url=source_url,
            subject=subject,
        )
        print(f"[API] /api/wrong/quick-add entry_id={entry_id}")
        return jsonify({"success": True, "entry_id": entry_id})
    except Exception as e:
        print(f"[ERROR] quick-add 失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/wrong/notebook/<int:entry_id>", methods=["PUT"])
def api_wrong_notebook_update(entry_id):
    """编辑错题字段"""
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"success": False, "error": "缺少更新字段"}), 400

    try:
        ok = notebook_store.update_entry(entry_id, data)
        return jsonify({"success": ok})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/wrong/notebook/merge", methods=["POST"])
def api_wrong_notebook_merge():
    """合并多条错题为一条
    Body: {target_id: int, source_ids: [int, ...]}
    合并后 source_ids 被删除，target_id 包含合并后内容
    """
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    data = request.get_json(silent=True) or {}
    target_id = data.get("target_id")
    source_ids = data.get("source_ids", [])
    if not target_id or not source_ids:
        return jsonify({"success": False, "error": "缺少 target_id 或 source_ids"}), 400

    try:
        ok = notebook_store.merge_entries(int(target_id), source_ids)
        return jsonify({"success": ok})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/wrong/notebook/batch-delete", methods=["POST"])
def api_wrong_notebook_batch_delete():
    """批量删除错题
    Body: {ids: [int, ...]}
    """
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    data = request.get_json(silent=True) or {}
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"success": False, "error": "缺少 ids"}), 400

    try:
        deleted = notebook_store.batch_delete(ids)
        return jsonify({"success": True, "deleted": deleted})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/wrong/notebook/export", methods=["GET"])
def api_wrong_notebook_export():
    """导出错题本
    Query: format=json|csv|md, ids=1,2,3 (可选, 不传=全部)
    """
    if notebook_store is None:
        return jsonify({"success": False, "error": "数据库未连接"}), 500

    fmt = request.args.get("format", "json").lower()
    if fmt not in ("json", "csv", "md"):
        return jsonify({"success": False, "error": "format 必须是 json/csv/md"}), 400

    ids_str = request.args.get("ids", "")
    entry_ids = None
    if ids_str:
        try:
            entry_ids = [int(x) for x in ids_str.split(",") if x.strip()]
        except ValueError:
            return jsonify({"success": False, "error": "ids 格式错误"}), 400

    try:
        content, mime, ext = notebook_store.export_entries(entry_ids=entry_ids, fmt=fmt)
        from flask import Response
        filename = f"notebook_{int(time.time())}.{ext}"
        # 处理中文文件名
        try:
            from urllib.parse import quote
            quoted = quote(filename)
        except Exception:
            quoted = filename
        resp = Response(content, mimetype=mime + "; charset=utf-8")
        resp.headers["Content-Disposition"] = f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quoted}"
        return resp
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/wrong/batch-analyze", methods=["POST"])
def api_wrong_batch_analyze():
    """批量AI分析错题
    Body: {ids: [int, ...], mode: "normal"|"think"|"deep" (可选, 默认 normal)}
    对每条记录调用 analysis_engine.analyze，更新 analysis/knowledge_tags/practice_question/subject
    同步执行（前端可异步调用），返回每条结果
    """
    if notebook_store is None or analysis_engine is None:
        return jsonify({"success": False, "error": "数据库或AI引擎未连接"}), 500

    data = request.get_json(silent=True) or {}
    ids = data.get("ids", [])
    mode = data.get("mode", "normal")
    if mode not in ("normal", "think", "deep"):
        mode = "normal"
    if not ids:
        return jsonify({"success": False, "error": "缺少 ids"}), 400

    results = []
    success_count = 0
    for entry_id in ids:
        try:
            entry = notebook_store.get_entry(int(entry_id))
            if not entry:
                results.append({"id": int(entry_id), "success": False, "error": "记录不存在"})
                continue

            # 已有分析的跳过？由前端决定，这里强制重新分析
            r = safe_call(
                analysis_engine.analyze,
                entry["question"], entry["correct_answer"],
                entry.get("wrong_answer", "") or "", mode
            )
            if r.get("success"):
                try:
                    notebook_store.update_entry(int(entry_id), {
                        "analysis": r.get("analysis", ""),
                        "knowledge_tags": r.get("knowledge_tags", []),
                        "practice_question": r.get("practice_question", ""),
                        "practice_answer": r.get("practice_answer", ""),
                        "subject": r.get("subject", ""),
                    })
                    results.append({"id": int(entry_id), "success": True})
                    success_count += 1
                except Exception as e:
                    results.append({"id": int(entry_id), "success": False, "error": f"保存失败: {e}"})
            else:
                results.append({"id": int(entry_id), "success": False, "error": r.get("error", "AI分析失败")})
        except Exception as e:
            results.append({"id": int(entry_id), "success": False, "error": str(e)})

    print(f"[API] /api/wrong/batch-analyze total={len(ids)} success={success_count}")
    return jsonify({"success": True, "results": results, "total": len(ids), "success_count": success_count})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if client and notebook_store else ("no_api_key" if not client else "no_db"),
        "model": "deepseek-v4-pro",
    })


@app.route("/panel")
def panel():
    """答题面板页面"""
    return send_from_directory(BASE_DIR, "panel.html")


@app.route("/exam")
def exam():
    """模拟考试页面（用于测试插件）"""
    return send_from_directory(BASE_DIR, "exam.html")


@app.route("/analysis")
def analysis_page():
    """错题分析页面"""
    return send_from_directory(BASE_DIR, "analysis.html")


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
