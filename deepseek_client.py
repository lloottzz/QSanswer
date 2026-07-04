"""DeepSeek V4 Pro API 客户端"""

import os
import time
import uuid
from openai import OpenAI

MODE_CONFIG = {
    "normal": {"thinking": None, "label": "普通"},
    "think": {"thinking": {"type": "enabled"}, "label": "深度思考"},
    "deep": {"thinking": {"type": "enabled", "budget_tokens": 4096}, "label": "极限推理"},
}

SYSTEM_PROMPT = """你是一个专业的答题助手。你的任务是：
1. 仔细识别图片/文本中所有题目（选择题、填空题、判断题、问答题）
2. 对每道题给出准确、简洁的答案
3. 选择题只输出选项字母和简短解释
4. 如果题目涉及计算，展示关键步骤
5. 用中文回答，答案放在最前面

输出格式：
【答案】B
【解析】因为xxx..."""


class SessionStore:
    """内存会话存储，带 TTL 自动过期"""

    def __init__(self, ttl: int = 1800):
        self._sessions: dict[str, dict] = {}
        self._ttl = ttl

    def _cleanup(self):
        """清理过期会话"""
        now = time.time()
        expired = [sid for sid, s in self._sessions.items()
                   if now - s["created_at"] > self._ttl]
        for sid in expired:
            del self._sessions[sid]

    def create(self, messages: list, mode: str = "normal") -> str:
        sid = uuid.uuid4().hex[:12]
        self._sessions[sid] = {
            "messages": messages,
            "mode": mode,
            "created_at": time.time(),
        }
        return sid

    def get(self, sid: str) -> dict | None:
        self._cleanup()
        session = self._sessions.get(sid)
        if not session:
            return None
        if time.time() - session["created_at"] > self._ttl:
            del self._sessions[sid]
            return None
        # 续期：每次访问刷新 TTL
        session["created_at"] = time.time()
        return session


class DeepSeekClient:
    """DeepSeek V4 Pro API 封装"""

    def __init__(self, api_key: str = None, base_url: str = "https://api.deepseek.com/v1"):
        self.api_key = api_key or os.environ.get("DEEPSEEK_API_KEY")
        if not self.api_key:
            raise ValueError("请设置环境变量 DEEPSEEK_API_KEY 或传入 api_key 参数")

        self.client = OpenAI(api_key=self.api_key, base_url=base_url, timeout=120.0)
        self.sessions = SessionStore()

    def _build_messages(self, system: str, user_content: list) -> list:
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]

    def _call_api(self, messages: list, mode: str) -> dict:
        config = MODE_CONFIG.get(mode, MODE_CONFIG["normal"])
        try:
            kwargs = {
                "model": "deepseek-v4-pro",
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 10000,
            }
            if config["thinking"]:
                kwargs["extra_body"] = {"thinking": config["thinking"]}

            response = self.client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content
            if content is None:
                content = getattr(response.choices[0].message, 'reasoning_content', '') or '(模型未返回文本内容)'

            return {
                "success": True,
                "answer": content,
                "model": response.model,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def vision(self, image_data_url: str, mode: str = "normal") -> dict:
        user_content = [
            {"type": "image_url", "image_url": {"url": image_data_url}},
            {"type": "text", "text": "请识别并解答图中的所有题目"},
        ]
        messages = self._build_messages(SYSTEM_PROMPT, user_content)
        result = self._call_api(messages, mode)

        if result["success"]:
            messages.append({"role": "assistant", "content": result["answer"]})
            sid = self.sessions.create(messages, mode)
            result["session_id"] = sid

        return result

    def chat(self, text: str, mode: str = "normal") -> dict:
        messages = self._build_messages(SYSTEM_PROMPT, [{"type": "text", "text": text}])
        result = self._call_api(messages, mode)

        if result["success"]:
            messages.append({"role": "assistant", "content": result["answer"]})
            sid = self.sessions.create(messages, mode)
            result["session_id"] = sid

        return result

    def continue_chat(self, session_id: str, text: str) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            return {"success": False, "error": "会话不存在或已过期，请重新答题"}

        session["messages"].append({"role": "user", "content": text})
        result = self._call_api(session["messages"], session["mode"])

        if result["success"]:
            session["messages"].append({"role": "assistant", "content": result["answer"]})

        return result

    def _custom_chat(self, system_prompt: str, user_prompt: str, mode: str = "normal") -> dict:
        """通用自定义对话"""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        return self._call_api(messages, mode)

    def analyze_wrong(self, system_prompt: str, user_prompt: str, mode: str = "normal") -> dict:
        """错题分析：发送自定义 system prompt 和 user prompt"""
        return self._custom_chat(system_prompt, user_prompt, mode)

    def check_practice(self, system_prompt: str, user_prompt: str, mode: str = "normal") -> dict:
        """练习评判"""
        return self._custom_chat(system_prompt, user_prompt, mode)
