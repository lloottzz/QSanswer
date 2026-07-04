"""错题分析引擎 — Prompt 组装、API 调用、结果解析"""

import re

ANALYZE_SYSTEM_PROMPT = """你是一位经验丰富的 AI 辅导老师。学生做错了一道题，你需要以三段式结构帮他彻底搞懂：

## 输出格式（严格遵守）

### 🔴 错因诊断
- 指出学生的错误答案错在哪里（如果学生未提供自己的答案，则分析本题最常见的错误思路）
- 指出是概念混淆、计算失误、审题不清、还是方法用错
- 用学生的视角解释"为什么会这样想"

### 🟡 知识点讲解
- 用通俗语言讲解本题涉及的核心知识点
- 给出关键公式/定理/概念
- 举例说明，确保学生真正理解

### 🟢 变式巩固题
- 生成一道与本题知识点相同、但数字/情境变化的同类型题目
- 题目难度与原题一致
- 在题目后单独附上【变式题答案】和【变式题解析】，用 <!--practice_split--> 分隔题目和答案两部分
- 提取 2-4 个知识点关键词，用 <tags>标签1,标签2,标签3</tags> 包裹
- 判断本题所属学科，用 <subject>学科名</subject> 包裹（如：数学、物理、化学、英语、语文、生物、地理、历史、政治、计算机、其他）

## 输入信息
原题：{question}
正确答案：{correct_answer}
学生答案：{wrong_answer}"""

CHECK_SYSTEM_PROMPT = """你是 AI 辅导老师。学生在做你之前生成的变式巩固题。

请判断对错并给予反馈：
- 如果正确：热情表扬学生，简要回顾涉及的知识点
- 如果错误：温和地指出错在哪里，再次用通俗语言讲解关键概念

输出格式：
【结果】正确 / 错误
【反馈】..."""


class AnalysisEngine:
    """错题分析引擎"""

    def __init__(self, client):
        self.client = client

    def analyze(self, question, correct_answer, wrong_answer="", mode="normal"):
        """分析错题，返回三段式诊断 + 变式题"""
        system = ANALYZE_SYSTEM_PROMPT.format(
            question=question,
            correct_answer=correct_answer,
            wrong_answer=wrong_answer or "（学生未提供）"
        )
        user = f"原题：{question}\n正确答案：{correct_answer}\n学生答案：{wrong_answer or '（未提供）'}"

        result = self.client.analyze_wrong(system, user, mode)
        if not result.get("success"):
            return result

        analysis_text = result["answer"]

        # 提取学科
        subject = ""
        subj_match = re.search(r"<subject>(.*?)</subject>", analysis_text, re.DOTALL)
        if subj_match:
            subject = subj_match.group(1).strip()
            analysis_text = re.sub(r"<subject>.*?</subject>", "", analysis_text, flags=re.DOTALL).strip()

        # 提取知识点标签
        tags = []
        tag_match = re.search(r"<tags>(.*?)</tags>", analysis_text, re.DOTALL)
        if tag_match:
            tags = [t.strip() for t in tag_match.group(1).split(",") if t.strip()]
            analysis_text = re.sub(r"<tags>.*?</tags>", "", analysis_text, flags=re.DOTALL).strip()

        # 提取变式题和答案
        practice_question = ""
        practice_answer = ""
        if "<!--practice_split-->" in analysis_text:
            parts = analysis_text.split("<!--practice_split-->", 1)
            before, after = parts[0], parts[1] if len(parts) > 1 else ""
            pq_match = re.search(
                r"### 🟢 变式巩固题\s*\n(.*?)$",
                before, re.DOTALL
            )
            practice_question = pq_match.group(1).strip() if pq_match else before.strip()
            practice_answer = after.strip()
        else:
            pq_match = re.search(
                r"### 🟢 变式巩固题\s*\n(.*?)(?:【变式题答案】|【答案】)",
                analysis_text, re.DOTALL
            )
            if pq_match:
                practice_question = pq_match.group(1).strip()
                pa_match = re.search(
                    r"(?:【变式题答案】|【答案】)\s*\n?(.*?)$",
                    analysis_text[pq_match.end():], re.DOTALL
                )
                if pa_match:
                    practice_answer = pa_match.group(1).strip()

        practice_extracted = bool(practice_question and practice_answer)
        if not practice_extracted:
            print("[WARN] 未能从分析结果中提取变式题和答案")

        return {
            "success": True,
            "analysis": analysis_text,
            "knowledge_tags": tags,
            "subject": subject,
            "practice_question": practice_question,
            "practice_answer": practice_answer,
            "practice_extracted": practice_extracted,
        }

    def check_practice(self, practice_question, practice_answer, user_answer, mode="normal"):
        """评判变式题作答"""
        user = f"变式题：{practice_question}\n标准答案：{practice_answer}\n学生作答：{user_answer}"
        result = self.client.check_practice(CHECK_SYSTEM_PROMPT, user, mode)
        if not result.get("success"):
            return result

        answer_text = result["answer"]
        first_line = answer_text.split("\n")[0] if answer_text else ""
        is_correct = bool(re.match(r"【结果】\s*正确\s*$", first_line.strip()))

        return {
            "success": True,
            "is_correct": is_correct,
            "feedback": answer_text,
        }
