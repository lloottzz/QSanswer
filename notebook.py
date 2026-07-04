"""错题本存储层 — MySQL 连接管理、CRUD、统计"""

import os
import io
import csv
import json
from datetime import datetime, timezone, timedelta
import pymysql

TZ = timezone(timedelta(hours=8))

def _now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")

_SQL_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS notebook (
    id              INTEGER PRIMARY KEY AUTO_INCREMENT,
    session_id      VARCHAR(32)  NOT NULL DEFAULT '',
    created_at      VARCHAR(25)  NOT NULL DEFAULT '',
    subject         VARCHAR(20)  DEFAULT '',
    question        TEXT         NOT NULL,
    correct_answer  TEXT         NOT NULL,
    wrong_answer    TEXT,
    analysis        TEXT,
    knowledge_tags  TEXT,
    practice_question  TEXT,
    practice_answer    TEXT,
    practice_result    VARCHAR(10) DEFAULT 'pending',
    source_url      TEXT,
    INDEX idx_created_at (created_at),
    INDEX idx_practice_result (practice_result),
    INDEX idx_subject (subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


class NotebookStore:
    """MySQL 错题本存储"""

    def __init__(self, host=None, port=None, user=None, password=None, database=None):
        self.host = host or os.environ.get("MYSQL_HOST", "127.0.0.1")
        self.port = int(port or os.environ.get("MYSQL_PORT", "3306"))
        self.user = user or os.environ.get("MYSQL_USER", "root")
        self.password = password or os.environ.get("MYSQL_PASSWORD", "")
        self.database = database or os.environ.get("MYSQL_DATABASE", "qsanswer")
        self._conn = None

    def _ensure_conn(self):
        """确保数据库和表存在，返回连接"""
        try:
            # 先连接不指定数据库以创建库
            conn = pymysql.connect(
                host=self.host, port=self.port,
                user=self.user, password=self.password,
                charset="utf8mb4"
            )
            with conn.cursor() as cur:
                cur.execute(
                    f"CREATE DATABASE IF NOT EXISTS `{self.database}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            conn.close()

            # 连接指定数据库
            conn = pymysql.connect(
                host=self.host, port=self.port,
                user=self.user, password=self.password,
                database=self.database, charset="utf8mb4",
                autocommit=True
            )
            with conn.cursor() as cur:
                cur.execute(_SQL_CREATE_TABLE)
            return conn
        except pymysql.Error as e:
            raise RuntimeError(f"MySQL 连接失败: {e}")

    def _get_conn(self):
        if self._conn is None or not self._conn.open:
            self._conn = self._ensure_conn()
        return self._conn

    def add_entry(self, session_id="", question="", correct_answer="",
                  wrong_answer="", analysis="", knowledge_tags=None,
                  practice_question="", practice_answer="", source_url="", subject=""):
        conn = self._get_conn()
        tags_json = json.dumps(knowledge_tags or [], ensure_ascii=False)
        created_at = _now_iso()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO notebook (session_id, created_at, subject, question, correct_answer, "
                "wrong_answer, analysis, knowledge_tags, practice_question, "
                "practice_answer, practice_result, source_url) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s)",
                (session_id, created_at, subject, question, correct_answer,
                 wrong_answer, analysis, tags_json,
                 practice_question, practice_answer, source_url)
            )
            return cur.lastrowid

    def update_practice_result(self, entry_id, result):
        conn = self._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE notebook SET practice_result=%s WHERE id=%s",
                (result, entry_id)
            )

    def get_entry(self, entry_id):
        conn = self._get_conn()
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT * FROM notebook WHERE id=%s", (entry_id,))
            row = cur.fetchone()
            if row and row.get("knowledge_tags"):
                try:
                    row["knowledge_tags"] = json.loads(row["knowledge_tags"])
                except json.JSONDecodeError:
                    row["knowledge_tags"] = []
            return row

    def list_entries(self, page=1, per_page=20, tag=None, result=None, subject=None):
        conn = self._get_conn()
        where = []
        params = []
        if tag:
            where.append("knowledge_tags LIKE %s")
            params.append(f"%{tag}%")
        if result:
            where.append("practice_result=%s")
            params.append(result)
        if subject:
            where.append("subject=%s")
            params.append(subject)

        where_clause = ("WHERE " + " AND ".join(where)) if where else ""
        page = max(1, page)
        per_page = min(max(1, per_page), 100)
        offset = (page - 1) * per_page

        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute(f"SELECT COUNT(*) as cnt FROM notebook {where_clause}", params)
            total = cur.fetchone()["cnt"]

            cur.execute(
                f"SELECT id, created_at, subject, question, correct_answer, wrong_answer, "
                f"knowledge_tags, practice_result, source_url "
                f"FROM notebook {where_clause} ORDER BY id DESC LIMIT %s OFFSET %s",
                params + [per_page, offset]
            )
            rows = cur.fetchall()
            for row in rows:
                if row.get("knowledge_tags"):
                    try:
                        row["knowledge_tags"] = json.loads(row["knowledge_tags"])
                    except json.JSONDecodeError:
                        row["knowledge_tags"] = []

        return {"entries": rows, "total": total, "page": page}

    def delete_entry(self, entry_id):
        conn = self._get_conn()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM notebook WHERE id=%s", (entry_id,))
            return cur.rowcount > 0

    def get_stats(self):
        conn = self._get_conn()
        stats = {"total": 0, "corrected": 0, "tags": [], "subjects": []}
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM notebook")
            stats["total"] = cur.fetchone()["cnt"]

            cur.execute("SELECT COUNT(*) as cnt FROM notebook WHERE practice_result='correct'")
            stats["corrected"] = cur.fetchone()["cnt"]

            cur.execute("SELECT knowledge_tags FROM notebook")
            tag_counter = {}
            for row in cur.fetchall():
                try:
                    tags = json.loads(row["knowledge_tags"])
                except (json.JSONDecodeError, TypeError):
                    continue
                for t in tags:
                    tag_counter[t] = tag_counter.get(t, 0) + 1
            stats["tags"] = [
                {"name": k, "count": v}
                for k, v in sorted(tag_counter.items(), key=lambda x: -x[1])
            ]

            # 按学科统计
            cur.execute("SELECT subject, COUNT(*) as cnt FROM notebook WHERE subject != '' GROUP BY subject ORDER BY cnt DESC")
            stats["subjects"] = [{"name": r["subject"], "count": r["cnt"]} for r in cur.fetchall()]

        return stats

    def get_subjects(self):
        """获取所有已有的学科列表"""
        conn = self._get_conn()
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT DISTINCT subject FROM notebook WHERE subject != '' ORDER BY subject")
            return [r["subject"] for r in cur.fetchall()]

    # ===== 新增：编辑 / 合并 / 导出 / 批量 / 图谱 =====

    # 学科颜色映射（与前端保持一致）
    SUBJECT_COLORS = {
        "数学": "#5252b3",
        "语文": "#dc2626",
        "英语": "#16a34a",
        "物理": "#d97706",
        "化学": "#7c3aed",
        "生物": "#0891b2",
        "历史": "#be185d",
        "地理": "#15803d",
        "政治": "#b45309",
    }

    def _subject_color(self, name):
        return self.SUBJECT_COLORS.get(name, "#71717a")

    def update_entry(self, entry_id, fields):
        """编辑错题字段，fields 为允许更新的字段字典"""
        # 白名单字段，防止 SQL 注入
        allowed = {
            "question", "correct_answer", "wrong_answer", "analysis",
            "knowledge_tags", "practice_question", "practice_answer",
            "practice_result", "source_url", "subject",
        }
        # practice_result 单独校验
        if "practice_result" in fields:
            pr = fields["practice_result"]
            if pr not in ("pending", "correct", "wrong"):
                fields = {k: v for k, v in fields.items() if k != "practice_result"}

        updates = []
        params = []
        for k, v in fields.items():
            if k not in allowed:
                continue
            if k == "knowledge_tags":
                # 标签存为 JSON 数组
                if isinstance(v, str):
                    try:
                        v = json.loads(v) if v.strip() else []
                    except json.JSONDecodeError:
                        v = [t.strip() for t in v.split(",") if t.strip()]
                v = json.dumps(v or [], ensure_ascii=False)
            updates.append(f"{k}=%s")
            params.append(v)

        if not updates:
            return False

        params.append(entry_id)
        conn = self._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE notebook SET {', '.join(updates)} WHERE id=%s",
                params
            )
            return cur.rowcount > 0

    def merge_entries(self, target_id, source_ids):
        """合并多条错题到 target_id，合并后删除 source_ids"""
        if not source_ids:
            return False
        # 去重并排除 target 自身
        source_ids = [int(sid) for sid in source_ids if int(sid) != int(target_id)]
        if not source_ids:
            return False

        conn = self._get_conn()
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT * FROM notebook WHERE id=%s", (target_id,))
            target = cur.fetchone()
            if not target:
                return False

            placeholders = ",".join(["%s"] * len(source_ids))
            cur.execute(f"SELECT * FROM notebook WHERE id IN ({placeholders})", source_ids)
            sources = cur.fetchall()

            if not sources:
                return False

            # 合并字段
            merged_question = target["question"] or ""
            merged_wrong = target["wrong_answer"] or ""
            merged_analysis = target["analysis"] or ""
            merged_tags = set()
            try:
                merged_tags.update(json.loads(target["knowledge_tags"] or "[]"))
            except (json.JSONDecodeError, TypeError):
                pass
            merged_practice_q = target["practice_question"] or ""
            merged_practice_a = target["practice_answer"] or ""
            merged_subject = target["subject"] or ""

            for src in sources:
                if src["question"]:
                    merged_question += "\n\n———\n\n" + src["question"]
                if src["wrong_answer"]:
                    merged_wrong += "\n\n———\n\n" + src["wrong_answer"]
                if src["analysis"]:
                    merged_analysis += "\n\n———\n\n" + src["analysis"]
                try:
                    merged_tags.update(json.loads(src["knowledge_tags"] or "[]"))
                except (json.JSONDecodeError, TypeError):
                    pass
                if src["practice_question"] and not merged_practice_q:
                    merged_practice_q = src["practice_question"]
                if src["practice_answer"] and not merged_practice_a:
                    merged_practice_a = src["practice_answer"]
                if src["subject"] and not merged_subject:
                    merged_subject = src["subject"]

            tags_json = json.dumps(sorted(merged_tags), ensure_ascii=False)
            cur.execute(
                "UPDATE notebook SET question=%s, wrong_answer=%s, analysis=%s, "
                "knowledge_tags=%s, practice_question=%s, practice_answer=%s, subject=%s "
                "WHERE id=%s",
                (merged_question, merged_wrong, merged_analysis, tags_json,
                 merged_practice_q, merged_practice_a, merged_subject, target_id)
            )

            # 删除源记录
            cur.execute(f"DELETE FROM notebook WHERE id IN ({placeholders})", source_ids)

            return True

    def batch_delete(self, entry_ids):
        """批量删除错题"""
        if not entry_ids:
            return 0
        entry_ids = [int(i) for i in entry_ids]
        conn = self._get_conn()
        placeholders = ",".join(["%s"] * len(entry_ids))
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM notebook WHERE id IN ({placeholders})", entry_ids)
            return cur.rowcount

    def batch_get(self, entry_ids):
        """批量获取错题详情"""
        if not entry_ids:
            return []
        entry_ids = [int(i) for i in entry_ids]
        conn = self._get_conn()
        placeholders = ",".join(["%s"] * len(entry_ids))
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute(f"SELECT * FROM notebook WHERE id IN ({placeholders})", entry_ids)
            rows = cur.fetchall()
            for row in rows:
                if row.get("knowledge_tags"):
                    try:
                        row["knowledge_tags"] = json.loads(row["knowledge_tags"])
                    except json.JSONDecodeError:
                        row["knowledge_tags"] = []
            return rows

    def export_entries(self, entry_ids=None, fmt="json"):
        """导出错题
        entry_ids: None=全部, list=指定ID
        fmt: json / csv / md
        返回 (content_str, mime_type, file_ext)
        """
        conn = self._get_conn()
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            if entry_ids:
                placeholders = ",".join(["%s"] * len(entry_ids))
                cur.execute(f"SELECT * FROM notebook WHERE id IN ({placeholders}) ORDER BY id DESC", entry_ids)
            else:
                cur.execute("SELECT * FROM notebook ORDER BY id DESC")
            rows = cur.fetchall()

        # 解析 knowledge_tags
        for row in rows:
            if row.get("knowledge_tags"):
                try:
                    row["knowledge_tags"] = json.loads(row["knowledge_tags"])
                except json.JSONDecodeError:
                    row["knowledge_tags"] = []
            else:
                row["knowledge_tags"] = []
            # 移除 None
            for k in list(row.keys()):
                if row[k] is None:
                    row[k] = ""

        if fmt == "json":
            content = json.dumps(rows, ensure_ascii=False, indent=2)
            return content, "application/json", "json"

        if fmt == "csv":
            buf = io.StringIO()
            fieldnames = [
                "id", "created_at", "subject", "question", "correct_answer",
                "wrong_answer", "analysis", "knowledge_tags", "practice_question",
                "practice_answer", "practice_result", "source_url"
            ]
            writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for row in rows:
                row_copy = dict(row)
                row_copy["knowledge_tags"] = " | ".join(row_copy.get("knowledge_tags", []))
                writer.writerow(row_copy)
            return buf.getvalue(), "text/csv", "csv"

        if fmt == "md":
            lines = ["# 错题本导出\n"]
            lines.append(f"导出时间：{_now_iso()}\n")
            lines.append(f"共 {len(rows)} 道错题\n\n---\n\n")
            for i, row in enumerate(rows, 1):
                lines.append(f"## 第 {i} 题 (ID: {row['id']})\n")
                if row.get("subject"):
                    lines.append(f"**学科：** {row['subject']}\n")
                if row.get("created_at"):
                    lines.append(f"**时间：** {row['created_at']}\n")
                if row.get("knowledge_tags"):
                    tags_str = "、".join(row["knowledge_tags"])
                    lines.append(f"**知识点：** {tags_str}\n")
                if row.get("practice_result"):
                    status_map = {"pending": "⏳ 待练习", "correct": "✅ 已掌握", "wrong": "❌ 仍错误"}
                    lines.append(f"**状态：** {status_map.get(row['practice_result'], row['practice_result'])}\n")
                lines.append("\n### 原题\n")
                lines.append(f"```\n{row.get('question', '')}\n```\n")
                if row.get("correct_answer"):
                    lines.append("\n### 正确答案\n")
                    lines.append(f"```\n{row['correct_answer']}\n```\n")
                if row.get("wrong_answer"):
                    lines.append("\n### 我的答案\n")
                    lines.append(f"```\n{row['wrong_answer']}\n```\n")
                if row.get("analysis"):
                    lines.append("\n### 错因诊断\n")
                    lines.append(f"{row['analysis']}\n")
                if row.get("practice_question"):
                    lines.append("\n### 变式巩固题\n")
                    lines.append(f"```\n{row['practice_question']}\n```\n")
                lines.append("\n---\n\n")
            return "".join(lines), "text/markdown", "md"

        raise ValueError(f"不支持的导出格式: {fmt}")

    def get_graph(self):
        """获取知识图谱数据：节点（知识点）+ 边（共现关系）"""
        conn = self._get_conn()
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT knowledge_tags, subject FROM notebook")
            rows = cur.fetchall()

        # 节点：知识点 -> {count, subjects}
        node_map = {}
        # 边：共现对 -> 权重
        edge_map = {}

        for row in rows:
            try:
                tags = json.loads(row["knowledge_tags"] or "[]")
            except (json.JSONDecodeError, TypeError):
                tags = []
            if not tags:
                continue
            subject = row.get("subject") or ""

            for t in tags:
                if t not in node_map:
                    node_map[t] = {"count": 0, "subjects": {}}
                node_map[t]["count"] += 1
                if subject:
                    node_map[t]["subjects"][subject] = node_map[t]["subjects"].get(subject, 0) + 1

            # 共现边：tags 两两组合
            for i in range(len(tags)):
                for j in range(i + 1, len(tags)):
                    pair = tuple(sorted([tags[i], tags[j]]))
                    edge_map[pair] = edge_map.get(pair, 0) + 1

        nodes = []
        for name, info in node_map.items():
            # 主学科：取该知识点出现次数最多的学科
            main_subject = ""
            if info["subjects"]:
                main_subject = max(info["subjects"].items(), key=lambda x: x[1])[0]
            nodes.append({
                "id": name,
                "name": name,
                "count": info["count"],
                "subject": main_subject,
                "color": self._subject_color(main_subject),
            })

        links = []
        for (s, t), w in edge_map.items():
            links.append({"source": s, "target": t, "weight": w})

        # 节点按 count 降序
        nodes.sort(key=lambda x: -x["count"])
        # 边按 weight 降序
        links.sort(key=lambda x: -x["weight"])

        return {"nodes": nodes, "links": links}
