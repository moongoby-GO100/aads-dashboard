"""aads-server 목업 검토 라우트를 그대로 흉내 내는 엄격 모의 API + 채팅 부팅 픽스처.

서버 정본(읽기 전용 참조): aads-server app/api/mockup_reviews.py, app/models/mockup_review.py,
app/services/mockup_review_service.py. 같은 메서드·경로·본문 검증·상태기계·오류코드를 따른다.
- 모든 쓰기는 generation 을 올린다. expected_generation 이 다르면 409.
- ChangeIntake 에는 base_revision_id 가 없다(서버가 최신 판을 정한다). 클라이언트가 보내면 테스트가 실패한다.
- manifest_hash 는 매니페스트(JSON 정본 직렬화)의 실제 sha256 이다.
이 모듈은 네트워크를 열지 않는다. Playwright route 가 handle() 로 요청을 넘겨준다.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import struct
import time
import uuid
import zlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

PROJECT = "AADS"
WS_ID = "22222222-2222-4333-8444-555555555555"
SID_A = "3f9d6a52-0c1e-4c2b-9d0a-5b6f7a8c9d01"
SID_B = "3f9d6a52-0c1e-4c2b-9d0a-5b6f7a8c9d02"
REVIEW_1 = "aaaaaaaa-0000-4000-8000-0000000000a1"   # 세션 A 로그인 화면
REVIEW_2 = "aaaaaaaa-0000-4000-8000-0000000000a2"   # 세션 A 결제 화면 (후보 둘 이상)
REVIEW_3 = "bbbbbbbb-0000-4000-8000-0000000000b3"   # 세션 B 관리자 화면
ART_1 = "cccccccc-0000-4000-8000-0000000000c1"
ART_2 = "cccccccc-0000-4000-8000-0000000000c2"
ART_3 = "cccccccc-0000-4000-8000-0000000000c3"      # 목업이 아닌 html_preview (sandbox/CSP 확인용)
ART_B = "cccccccc-0000-4000-8000-0000000000c4"
DOC_KEY = "rdoc-mockup-chat-spec"
NAMESPACE = uuid.UUID("12345678-1234-5678-1234-567812345678")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{8,64}$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
ACTIVE_STATES = ("review_ready", "changes_requested", "revising", "approved")
NOW = datetime(2026, 11, 5, 0, 0, 0, tzinfo=timezone.utc)

HTML_PREVIEW_SOURCE = "<h1>PREVIEW-BODY</h1><script>window.__leak=1</script>"


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(data: bytes | str) -> str:
    return hashlib.sha256(data.encode("utf-8") if isinstance(data, str) else data).hexdigest()


def request_hash(action: str, payload: dict) -> str:
    return sha256_hex(canonical_json({"action": action, "payload": payload}))


def det_uuid(*parts: object) -> str:
    return str(uuid.uuid5(NAMESPACE, ":".join(str(p) for p in parts)))


def png(color: tuple[int, int, int], w: int = 48, h: int = 32) -> bytes:
    raw = b"".join(b"\x00" + bytes(color) * w for _ in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class HttpError(Exception):
    def __init__(self, status: int, code: str, /, **extra: Any):
        self.status, self.code, self.extra = status, code, extra


def fail(status: int, code: str, /, **extra: Any) -> None:
    raise HttpError(status, code, **extra)


@dataclass
class Revision:
    id: str
    number: int
    parent: str | None
    manifest: dict
    manifest_hash: str
    doc_refs: list[dict]
    pointer_applied: bool = True
    created_at: str = ""


@dataclass
class Head:
    id: str
    title: str
    session_id: str | None
    status: str = "draft"
    generation: int = 0
    pointer_generation: int = 0
    latest: str | None = None
    approved: str | None = None
    revisions: list[Revision] = field(default_factory=list)
    changes: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    updated_at: str = ""


COLORS = {1: (200, 60, 60), 2: (60, 160, 90), 3: (60, 90, 200), 4: (200, 160, 40)}


def make_manifest(review_id: str, number: int) -> tuple[dict, dict[str, bytes]]:
    """판마다 서로 다른 PNG(그래서 서로 다른 sha256)를 가진 매니페스트."""
    blobs: dict[str, bytes] = {}
    assets = []
    for key, phase, viewport, color in (
        ("before_desktop", "before", "desktop", (120, 120, 120)),
        ("mockup_desktop", "mockup", "desktop", COLORS[number % 4 or 4]),
        ("mockup_mobile", "mockup", "mobile", COLORS[(number + 1) % 4 or 4]),
    ):
        aid = f"{key}_v{number}"
        data = png(color)
        blobs[aid] = data
        assets.append({"asset_id": aid, "role": "primary", "mime": "image/png", "uri": f"store://{review_id}/{aid}.png",
                       "sha256": sha256_hex(data), "byte_size": len(data), "screen_id": "login", "phase": phase,
                       "viewport": viewport, "state": "default", "filename": f"{aid}.png"})
    html = f"<html><body>mockup v{number}</body></html>".encode()
    blobs[f"page_v{number}"] = html
    assets.append({"asset_id": f"page_v{number}", "role": "primary", "mime": "text/html", "uri": f"store://{review_id}/page_v{number}.html",
                   "sha256": sha256_hex(html), "byte_size": len(html), "screen_id": "login", "phase": "mockup",
                   "viewport": "desktop", "state": "default", "filename": f"page_v{number}.html"})
    manifest = {"screens": [{"screen_id": "login", "title": "로그인", "route": "/login"}],
                "assets": sorted(assets, key=lambda a: a["asset_id"]), "evidence": [],
                "design_tokens_version": "dt-1", "source_sha": "0" * 40}
    return manifest, blobs


class StrictMock:
    def __init__(self) -> None:
        self.reset()

    # ------------------------------------------------------------------ state
    def reset(self) -> None:
        self.t0 = time.monotonic()
        self.log: list[dict] = []          # 모든 요청 (method, path, query, status, t)
        self.writes: list[dict] = []       # 쓰기 요청만 (본문 포함)
        self.failed_writes: list[dict] = []  # 주입한 실패/유실로 처리되지 않은 쓰기 시도(본문 포함)
        self.violations: list[str] = []
        self.unmocked_gets: list[str] = []
        self.doc_reads: list[dict] = []
        self.blobs: dict[tuple[str, str], bytes] = {}
        self.delays: list[dict] = []
        self.fail_next: list[dict] = []
        self.counter = 0
        self.heads: dict[str, Head] = {}
        self.sessions: dict[str, dict] = {}
        self.messages: dict[str, list[dict]] = {SID_A: [], SID_B: []}
        self.artifacts: dict[str, list[dict]] = {SID_A: [], SID_B: []}
        self.docs: list[dict] = []
        self.idem: dict[tuple[str, str], tuple[str, dict]] = {}
        self._seed()

    def stamp(self, seconds: int = 0) -> str:
        return (NOW + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")

    def _seed(self) -> None:
        for sid, title in ((SID_A, "목업 검토 대화 A"), (SID_B, "목업 검토 대화 B")):
            self.sessions[sid] = {"id": sid, "workspace_id": WS_ID, "title": title, "current_model": "mixture",
                                  "created_at": self.stamp(), "updated_at": self.stamp(), "pinned": False, "tags": [],
                                  "message_count": 0, "role_key": "CTO"}
        # 문서: r1..r4. 판 vN 은 문서 rN 을 고정(pin)하고, 문서의 최신은 r4 다.
        for n in range(1, 5):
            self.docs.append({"id": det_uuid("doc", n), "revision": n, "content": f"# 명세서\n{'PINNED' if n < 4 else 'LATEST'}-R{n} 본문"})
        self._add_head(REVIEW_1, "로그인 화면 목업", SID_A, versions=2, status="review_ready")
        self._add_head(REVIEW_2, "결제 화면 목업", SID_A, versions=1, status="review_ready")
        self._add_head(REVIEW_3, "관리자 화면 목업", SID_B, versions=1, status="review_ready")
        long_text = "목업 검토 보고입니다. " * 90
        self.artifacts[SID_A] = [
            self._artifact(ART_1, SID_A, "report", "로그인 화면 목업 카드", {"mockup_review_id": REVIEW_1, "mockup_project": PROJECT,
                           "mockup_revision_id": self.heads[REVIEW_1].latest}, 30),
            self._artifact(ART_2, SID_A, "report", "결제 화면 목업 카드", {"mockup_review_id": REVIEW_2, "mockup_project": PROJECT,
                           "mockup_revision_id": self.heads[REVIEW_2].latest}, 20),
            self._artifact(ART_3, SID_A, "html_preview", "정적 HTML 미리보기", {}, 10, content=HTML_PREVIEW_SOURCE),
        ]
        self.artifacts[SID_B] = [
            self._artifact(ART_B, SID_B, "report", "관리자 화면 목업 카드", {"mockup_review_id": REVIEW_3, "mockup_project": PROJECT,
                           "mockup_revision_id": self.heads[REVIEW_3].latest}, 30),
        ]
        self.messages[SID_A] = [
            self._msg(det_uuid("m", "a", 1), SID_A, "user", "로그인 화면 목업을 만들어 줘", 1),
            self._msg(det_uuid("m", "a", 2), SID_A, "assistant", long_text, 2, artifact_id=ART_1),
            self._msg(det_uuid("m", "a", 3), SID_A, "assistant", long_text + " 결제 화면입니다.", 3, artifact_id=ART_2),
            self._msg(det_uuid("m", "a", 4), SID_A, "user", "확인해 볼게", 4),
            self._msg(det_uuid("m", "a", 5), SID_A, "assistant", "두 목업 모두 검토 대기 상태입니다.", 5),
        ]
        self.messages[SID_B] = [
            self._msg(det_uuid("m", "b", 1), SID_B, "user", "관리자 화면 목업을 만들어 줘", 1),
            self._msg(det_uuid("m", "b", 2), SID_B, "assistant", long_text, 2, artifact_id=ART_B),
            self._msg(det_uuid("m", "b", 3), SID_B, "assistant", "관리자 목업은 검토 대기입니다.", 3),
        ]
        for sid in self.sessions:
            self.sessions[sid]["message_count"] = len(self.messages[sid])

    def _artifact(self, aid: str, sid: str, kind: str, title: str, metadata: dict, seconds: int, content: str = "") -> dict:
        return {"id": aid, "session_id": sid, "workspace_id": WS_ID, "artifact_type": kind, "title": title,
                "content": content or f"{title} 본문", "metadata": metadata, "created_at": self.stamp(seconds)}

    def _msg(self, mid: str, sid: str, role: str, content: str, seconds: int, **extra: Any) -> dict:
        return {"id": mid, "session_id": sid, "role": role, "content": content, "created_at": self.stamp(seconds),
                "model_used": "mixture" if role == "assistant" else None, **extra}

    def _add_head(self, rid: str, title: str, sid: str | None, versions: int, status: str) -> None:
        head = Head(id=rid, title=title, session_id=sid, updated_at=self.stamp())
        self.heads[rid] = head
        for n in range(1, versions + 1):
            self._append_revision(head, n)
        # v1..v(n-1) 는 이미 지나간 판이다. 현재 포인터는 마지막 판.
        head.status = status
        head.generation = head.pointer_generation = 4 + versions
        for event in ("submitted",):
            head.events.append({"action": event, "generation_after": head.generation})

    def _append_revision(self, head: Head, number: int) -> Revision:
        manifest, blobs = make_manifest(head.id, number)
        doc = next(d for d in self.docs if d["revision"] == min(number, 4))
        rev = Revision(id=det_uuid("rev", head.id, number), number=number, parent=head.latest, manifest=manifest,
                       manifest_hash=sha256_hex(canonical_json(manifest)),
                       doc_refs=[{"role": "spec", "document_key": DOC_KEY, "revision_id": doc["id"],
                                  "content_hash": sha256_hex(doc["content"]), "exempt_reason": None, "exempt_policy_ref": None}],
                       created_at=self.stamp(number))
        head.revisions.append(rev)
        head.latest = rev.id
        for aid, data in blobs.items():
            self.blobs[(rev.id, aid)] = data
        return rev

    # --------------------------------------------------- 테스트가 직접 쓰는 "에이전트/타 사용자" 변이
    def agent_reports_new_revision(self, review_id: str, *, resolves_outcome: str = "applied") -> dict:
        """서버 start_revising → create_revision(resolves) → submit 를 그대로 재현한다(브라우저 요청 아님)."""
        head = self.heads[review_id]
        if head.status == "changes_requested":
            for c in head.changes:
                if c["status"] == "open":
                    c["status"] = "in_revision"
            head.generation += 1
            head.status = "revising"
        rev = self._append_revision(head, len(head.revisions) + 1)
        for c in head.changes:
            if c["status"] != "resolved":
                c.update(status="resolved", outcome=resolves_outcome, outcome_reason="요청 반영", resolved_revision_id=rev.id,
                         resolved_at=self.stamp(100))
        head.generation += 1
        head.pointer_generation = head.generation
        head.status = "draft"
        head.generation += 1
        head.status = "review_ready"
        head.updated_at = self.stamp(200)
        return {"revision_id": rev.id, "revision": rev.number, "generation": head.generation, "manifest_hash": rev.manifest_hash}

    def other_actor_writes(self, review_id: str) -> int:
        """다른 사용자가 같은 판에 수정 요청을 넣은 것과 같은 효과: generation 만 오른다."""
        head = self.heads[review_id]
        head.generation += 1
        head.status = "changes_requested"
        return head.generation

    def add_delay(self, pattern: str, seconds: float, *, method: str = "GET", once: bool = True) -> None:
        self.delays.append({"re": re.compile(pattern), "seconds": seconds, "method": method, "once": once, "hits": 0})

    def add_failure(self, method: str, pattern: str, status: int | str | None, *, times: int = 1, code: str = "service_unavailable") -> None:
        """status=None 이면 응답 없이 연결을 끊는다(네트워크 단절)."""
        self.fail_next.append({"method": method, "re": re.compile(pattern), "status": status, "times": times, "code": code})

    # ------------------------------------------------------------------ views
    def revision_ref(self, head: Head, rid: str | None) -> dict | None:
        rev = next((r for r in head.revisions if r.id == rid), None) if rid else None
        if not rev:
            return None
        return {"revision_id": rev.id, "revision": rev.number, "manifest_hash": rev.manifest_hash,
                "pointer_applied": rev.pointer_applied, "created_by": "agent", "created_at": rev.created_at}

    def rev_status(self, head: Head, rev: Revision) -> str:
        if rev.id != head.latest:
            return "archived_stale" if rev.id != head.approved else "approved"
        return {"draft": "draft", "review_ready": "review_ready", "approved": "approved", "changes_requested": "changes_requested",
                "revising": "revising", "revoked": "revoked"}[head.status]

    def head_view(self, head: Head) -> dict:
        approved = self.revision_ref(head, head.approved)
        if approved:
            approved["approval_id"] = 1
        return {"review_id": head.id, "project": PROJECT, "title": head.title, "change_type": "ui", "goal_id": None,
                "session_id": head.session_id, "status": head.status, "generation": head.generation,
                "pointer_generation": head.pointer_generation, "latest_revision": self.revision_ref(head, head.latest),
                "approved_revision": approved,
                "pending_change_requests": sum(1 for c in head.changes if c["status"] != "resolved"),
                "created_at": self.stamp(), "updated_at": head.updated_at}

    def rev_row(self, head: Head, rev: Revision) -> dict:
        return {"revision_id": rev.id, "revision": rev.number, "status": self.rev_status(head, rev), "parent_revision_id": rev.parent,
                "manifest_hash": rev.manifest_hash, "pointer_applied": rev.pointer_applied, "is_latest": rev.id == head.latest,
                "is_approved": rev.id == head.approved, "created_by": "agent", "created_at": rev.created_at,
                "url": f"/api/v1/projects/{PROJECT}/mockup-reviews/{head.id}/revisions/{rev.id}"}

    def change_row(self, c: dict) -> dict:
        return {k: v for k, v in c.items() if k not in ("idempotency_key", "request_hash")}

    def review_view(self, head: Head) -> dict:
        changes = [self.change_row(c) for c in head.changes]
        return {**self.head_view(head), "revisions": [self.rev_row(head, r) for r in sorted(head.revisions, key=lambda r: -r.number)],
                "change_requests": changes, "unresolved_change_requests": [c for c in changes if c["status"] != "resolved"],
                "events": list(reversed(head.events))}

    # --------------------------------------------------------------- HTTP core
    async def handle(self, method: str, url: str, headers: dict[str, str], body: bytes | None) -> dict:
        """-> {status, content_type, body(bytes) | stream(list[bytes]), abort(bool)}"""
        sp = urlsplit(url)
        path = sp.path
        query = parse_qs(sp.query, keep_blank_values=True)
        entry = {"method": method, "path": path, "query": sp.query, "t": round(time.monotonic() - self.t0, 3), "status": None}
        self.log.append(entry)
        for d in self.delays:
            if d["method"] == method and d["re"].search(path + ("?" + sp.query if sp.query else "")) and not (d["once"] and d["hits"]):
                d["hits"] += 1
                entry["delayed"] = d["seconds"]
                await asyncio.sleep(d["seconds"])
        lose_response = False
        for f in self.fail_next:
            if f["times"] > 0 and f["method"] == method and f["re"].search(path):
                f["times"] -= 1
                entry["injected"] = True
                if method not in ("GET", "HEAD"):
                    try:
                        self.failed_writes.append({"method": method, "path": path, "status": f["status"], "body": json.loads(body or b"{}")})
                    except ValueError:
                        self.failed_writes.append({"method": method, "path": path, "status": f["status"], "body": None})
                if f["status"] == "lose":
                    lose_response = True      # 서버는 처리하지만 응답이 사라진다(응답 유실)
                    break
                entry["status"] = f["status"] if f["status"] is not None else "aborted"
                if f["status"] is None:
                    return {"abort": True}
                return self._json(f["status"], {"detail": {"code": f["code"]}})
        try:
            data = None
            if method not in ("GET", "HEAD"):
                try:
                    data = json.loads(body or b"{}")
                except ValueError:
                    fail(422, "invalid_json")
                self.writes.append({"method": method, "path": path, "body": data, "t": entry["t"], "seq": len(self.writes)})
            result = await self._route(method, path, query, data, headers)
        except HttpError as exc:
            entry["status"] = exc.status
            if self.writes and self.writes[-1]["path"] == path and method != "GET":
                self.writes[-1]["status"] = exc.status
                self.writes[-1]["error"] = {"code": exc.code, **exc.extra}
            return self._json(exc.status, {"detail": {"code": exc.code, **exc.extra}})
        entry["status"] = result.get("status", 200)
        if lose_response:
            entry["status"] = "response_lost"
            if self.writes and self.writes[-1]["path"] == path:
                self.writes[-1]["status"] = "response_lost"
                if "json" in result:
                    self.writes[-1]["response"] = result["json"]
            return {"abort": True}
        if method != "GET" and self.writes and self.writes[-1]["path"] == path:
            self.writes[-1]["status"] = result.get("status", 200)
            if "json" in result:
                self.writes[-1]["response"] = result["json"]
        if "json" in result:
            return self._json(result.get("status", 200), result["json"])
        return result

    @staticmethod
    def _json(status: int, payload: Any) -> dict:
        return {"status": status, "content_type": "application/json", "body": json.dumps(payload, ensure_ascii=False).encode()}

    async def _route(self, method: str, path: str, q: dict[str, list[str]], data: dict | None, headers: dict[str, str]) -> dict:
        p = path
        if p.startswith("/api/v1"):
            p = p[len("/api/v1"):]
        one = lambda k, default=None: (q.get(k) or [default])[0]  # noqa: E731

        # ---- mockup review routes (서버와 같은 메서드·경로)
        m = re.fullmatch(rf"/projects/{PROJECT}/mockup-reviews", p)
        if m and method == "GET":
            return {"json": self.list_reviews(one("status"), one("session_id"), int(one("limit", 50)), int(one("offset", 0)))}
        if p == f"/projects/{PROJECT}/mockup-reviews/change-intake" and method == "POST":
            return {"json": self.intake_change(data or {})}
        if p == f"/projects/{PROJECT}/mockup-reviews/notifications" and method == "GET":
            return {"json": {"items": [], "unread": 0}}
        m = re.fullmatch(rf"/projects/{PROJECT}/mockup-reviews/([0-9a-f-]{{36}})", p)
        if m and method == "GET":
            return {"json": self.review_view(self.head(m.group(1)))}
        m = re.fullmatch(rf"/projects/{PROJECT}/mockup-reviews/([0-9a-f-]{{36}})/revisions/([0-9a-f-]{{36}})", p)
        if m and method == "GET":
            return {"json": self.get_revision(m.group(1), m.group(2))}
        m = re.fullmatch(rf"/projects/{PROJECT}/mockup-reviews/([0-9a-f-]{{36}})/revisions/([0-9a-f-]{{36}})/assets/([A-Za-z0-9_.-]+)", p)
        if m and method == "GET":
            data_bytes = self.blobs.get((m.group(2), m.group(3)))
            if data_bytes is None:
                fail(404, "asset_not_found")
            mime = "image/png" if data_bytes.startswith(b"\x89PNG") else "text/html"
            return {"status": 200, "content_type": mime, "body": data_bytes}
        m = re.fullmatch(rf"/projects/{PROJECT}/mockup-reviews/([0-9a-f-]{{36}})/change-report", p)
        if m and method == "GET":
            return {"json": self.change_report(self.head(m.group(1)))}
        m = re.fullmatch(rf"/projects/{PROJECT}/mockup-reviews/([0-9a-f-]{{36}})/approve", p)
        if m and method == "POST":
            return {"json": self.approve(m.group(1), data or {})}
        m = re.fullmatch(rf"/projects/{PROJECT}/mockup-reviews/([0-9a-f-]{{36}})/changes", p)
        if m and method == "POST":
            fail(405, "not_used_by_chat_client")

        # ---- 정본 문서 이력/본문 (고정 판본 열람)
        m = re.fullmatch(rf"/projects/{PROJECT}/documents/({DOC_KEY})/history", p)
        if m and method == "GET":
            return {"json": {"project": PROJECT, "document_key": DOC_KEY,
                             "revisions": [{"id": d["id"], "revision": d["revision"], "title": "명세서"} for d in reversed(self.docs)]}}
        m = re.fullmatch(rf"/projects/{PROJECT}/documents/({DOC_KEY})/content", p)
        if m and method == "GET":
            wanted = one("revision")
            doc = next((d for d in self.docs if str(d["revision"]) == wanted), None) if wanted else self.docs[-1]
            self.doc_reads.append({"revision_query": wanted, "served": doc["revision"] if doc else None})
            if not doc:
                fail(404, "revision_not_found")
            return {"json": {"project": PROJECT, "document_key": DOC_KEY, "content": doc["content"], "mime_type": "text/markdown",
                             "format": "markdown", "canonical": {"document_key": DOC_KEY, "revision": doc["revision"],
                                                                 "revision_id": doc["id"], "title": "명세서", "authoritative": True}}}

        # ---- 채팅 (실제 /chat 부팅과 전송)
        return await self._chat(method, p, q, data, headers)

    def head(self, rid: str) -> Head:
        if rid not in self.heads:
            fail(404, "review_not_found")
        return self.heads[rid]

    # ----------------------------------------------------------- review routes
    def list_reviews(self, status: str | None, session_id: str | None, limit: int, offset: int) -> dict:
        rows = [h for h in self.heads.values() if (not status or h.status == status) and (not session_id or h.session_id == session_id)]
        rows.sort(key=lambda h: (h.updated_at, h.id), reverse=True)
        items = []
        for h in rows[offset:offset + limit]:
            latest = next((r for r in h.revisions if r.id == h.latest), None)
            items.append({"review_id": h.id, "title": h.title, "status": h.status, "change_type": "ui", "goal_id": None,
                          "session_id": h.session_id, "latest_revision_id": h.latest, "approved_revision_id": h.approved,
                          "latest_revision": latest.number if latest else None,
                          "asset_count": len(latest.manifest["assets"]) if latest else 0, "created_at": self.stamp(),
                          "updated_at": h.updated_at,
                          "link": f"/chat?mockup_review={h.id}&mockup_project={PROJECT}&mockup_revision={h.latest}"})
        return {"items": items, "total": len(rows)}

    def get_revision(self, rid: str, revision_id: str) -> dict:
        head = self.head(rid)
        rev = next((r for r in head.revisions if r.id == revision_id), None)
        if not rev:
            fail(404, "revision_not_found")
        manifest = json.loads(json.dumps(rev.manifest))
        base = f"/api/v1/projects/{PROJECT}/mockup-reviews/{rid}/revisions/{rev.id}"
        for asset in manifest["assets"]:
            asset["url"] = f"{base}/assets/{asset['asset_id']}"
        return {**self.rev_row(head, rev), "manifest": manifest, "doc_refs": rev.doc_refs,
                "design_tokens_version": manifest["design_tokens_version"], "source_sha": manifest["source_sha"]}

    def change_report(self, head: Head) -> dict:
        numbers = {r.id: r.number for r in head.revisions}
        items = []
        for seq, c in enumerate(head.changes, 1):
            resolved = c.get("resolved_revision_id")
            items.append({"change_request_id": c["change_request_id"], "sequence": seq, "source_message_id": c["source_message_id"],
                          "requested_by": "ceo", "requested_at": c["created_at"], "screen_id": c["screen_id"], "queued": c["queued"],
                          "original_text": c["comment"], "status": c["status"],
                          "base_revision": {"revision_id": c["base_revision_id"], "revision": numbers.get(c["base_revision_id"])},
                          "new_revision": {"revision_id": resolved, "revision": numbers.get(resolved)} if resolved else None,
                          "outcome": c.get("outcome"), "outcome_reason": c.get("outcome_reason"), "resolved_at": c.get("resolved_at")})
        return {"review_id": head.id, "status": head.status, "generation": head.generation, "change_requests": items,
                "revisions": [self.rev_row(head, r) for r in head.revisions], "markdown": ""}

    def replay(self, head: Head, key: str, rhash: str) -> dict | None:
        row = self.idem.get((head.id, key))
        if not row:
            return None
        if row[0] != rhash:
            fail(409, "idempotency_key_conflict")
        return {**row[1], "idempotent": True}

    def stale(self, head: Head, code: str) -> None:
        latest = next((r for r in head.revisions if r.id == head.latest), None)
        fail(409, code, latest_revision_id=head.latest, latest_revision=latest.number if latest else None,
             manifest_hash=latest.manifest_hash if latest else None, generation=head.generation, status=head.status)

    def approve(self, rid: str, body: dict) -> dict:
        head = self.head(rid)
        allowed = {"idempotency_key", "expected_generation", "revision_id", "manifest_hash", "confirm"}
        self._validate(body, required=allowed, allowed=allowed)
        if body["confirm"] is not True:
            fail(422, "confirm_required")
        if not SHA256_RE.fullmatch(str(body["manifest_hash"])):
            fail(422, "manifest_hash must be 64 lowercase hex chars")
        if not UUID_RE.fullmatch(str(body["revision_id"])):
            fail(422, "revision_id must be uuid")
        rhash = request_hash("approve", body)
        replayed = self.replay(head, body["idempotency_key"], rhash)
        if replayed:
            return replayed
        latest = next((r for r in head.revisions if r.id == head.latest), None)
        if (latest is None or latest.id != body["revision_id"] or latest.manifest_hash != body["manifest_hash"]
                or body["expected_generation"] != head.generation):
            self.stale(head, "stale_revision")
        if head.status != "review_ready":
            fail(409, "invalid_state", status=head.status, required="review_ready")
        head.generation += 1
        head.status = "approved"
        head.approved = latest.id
        head.updated_at = self.stamp(300)
        head.events.append({"action": "approved", "generation_after": head.generation, "revision_id": latest.id})
        response = {"review_id": head.id, "approval_id": len(head.events), "revision_id": latest.id, "revision": latest.number,
                    "manifest_hash": latest.manifest_hash, "status": "approved", "generation": head.generation,
                    "approved_by": "ceo", "bindings_held": 0, "idempotent": False}
        self.idem[(head.id, body["idempotency_key"])] = (rhash, response)
        return response

    def _validate(self, body: dict, *, required: set[str], allowed: set[str]) -> None:
        missing = sorted(required - body.keys())
        if missing:
            fail(422, "validation_error", missing=missing)
        if not KEY_RE.fullmatch(str(body.get("idempotency_key", ""))):
            fail(422, "idempotency_key must be 8-64 chars of [A-Za-z0-9._:-]")
        gen = body.get("expected_generation")
        if gen is not None and (not isinstance(gen, int) or isinstance(gen, bool) or gen < 0):
            fail(422, "expected_generation must be int >= 0")

    def intake_change(self, body: dict) -> dict:
        # ChangeIntake(IdempotentWrite): base_revision_id 는 모델에 없다. 서버는 알려지지 않은 필드를 무시하지만
        # 이 모의는 클라이언트가 그런 필드를 보내면 위반으로 기록한다(서버 계약 밖의 본문을 몰래 통과시키지 않는다).
        allowed = {"idempotency_key", "expected_generation", "change_request_id", "session_id", "source_message_id", "comment",
                   "reply_to_id", "artifact_id", "review_id", "screen_id"}
        extra = sorted(set(body) - allowed)
        if extra:
            self.violations.append(f"change-intake 본문에 서버 모델에 없는 필드: {extra}")
        self._validate(body, required={"idempotency_key", "change_request_id", "session_id", "source_message_id", "comment"}, allowed=allowed)
        for key in ("change_request_id", "session_id", "source_message_id"):
            if not UUID_RE.fullmatch(str(body[key])):
                fail(422, "validation_error", field=key)
        for key in ("reply_to_id", "artifact_id", "review_id"):
            if body.get(key) is not None and not UUID_RE.fullmatch(str(body[key])):
                fail(422, "validation_error", field=key)
        if len(str(body["comment"])) > 4000:
            fail(422, "comment too long")
        session = body["session_id"]
        if session not in self.sessions:
            fail(404, "session_not_found")
        source = self.find_message(body["source_message_id"])
        if source is None:
            fail(404, "source_message_not_found")
        if source["session_id"] != session:
            fail(422, "source_message_session_mismatch")
        head = self.resolve_target(body)
        if not head.latest:
            fail(409, "invalid_state", status=head.status, required="submitted revision")
        expected = body.get("expected_generation")
        expected = head.generation if expected is None else expected
        client_hash = request_hash("changes", {k: body.get(k) for k in
                                               ("idempotency_key", "expected_generation", "change_request_id", "source_message_id", "comment", "screen_id")})
        comment = str(body["comment"])
        if not comment.strip():
            fail(422, "empty_comment")
        replayed = self.replay(head, body["idempotency_key"], client_hash)
        if replayed:
            return {**replayed, "target": {"review_id": head.id, "revision_id": replayed.get("base_revision_id"), "resolved_by": "server"},
                    "next": "revise_then_resubmit", "approved": False, "implementation_command": False}
        existing = next((c for c in head.changes if c["change_request_id"] == body["change_request_id"]), None)
        if existing:
            if (existing["comment"], existing["source_message_id"], existing["base_revision_id"], existing["screen_id"]) != (
                    comment.strip() if False else comment, body["source_message_id"], head.latest, body.get("screen_id")):
                fail(409, "change_request_conflict")
            return {"review_id": head.id, "change_request_id": body["change_request_id"], "status": existing["status"],
                    "generation": head.generation, "idempotent": True,
                    "target": {"review_id": head.id, "revision_id": existing["base_revision_id"], "resolved_by": "server"},
                    "next": "revise_then_resubmit", "approved": False, "implementation_command": False}
        if head.status not in ACTIVE_STATES:
            fail(409, "invalid_state", status=head.status, required="submitted revision")
        if not head.pointer_generation <= expected <= head.generation:
            self.stale(head, "stale_revision")
        if body.get("screen_id") and body["screen_id"] not in {s["screen_id"] for r in head.revisions if r.id == head.latest for s in r.manifest["screens"]}:
            fail(422, "unknown_screen", screen_id=body["screen_id"])
        if source["role"] != "user":
            fail(422, "source_message_not_user_message")
        queued = head.status == "revising"
        status = head.status
        if head.status in ("review_ready", "approved"):
            head.generation += 1
            head.status = status = "changes_requested"
            head.updated_at = self.stamp(150)
        self.counter += 1
        change = {"change_request_id": body["change_request_id"], "source_message_id": body["source_message_id"],
                  "session_id": session, "base_revision_id": head.latest, "screen_id": body.get("screen_id"), "comment": comment,
                  "status": "open", "queued": queued, "created_at": self.stamp(150 + self.counter), "outcome": None, "outcome_reason": None,
                  "resolved_revision_id": None, "resolved_at": None, "requested_by": "ceo"}
        head.changes.append(change)
        head.events.append({"action": "changes_requested", "generation_after": head.generation, "revision_id": head.latest})
        response = {"review_id": head.id, "change_request_id": body["change_request_id"], "source_message_id": body["source_message_id"],
                    "base_revision_id": head.latest, "status": status, "request_status": "open", "queued": queued,
                    "pending_change_requests": sum(1 for c in head.changes if c["status"] != "resolved"),
                    "generation": head.generation, "approved": False, "implementation_command": False, "bindings_held": 0,
                    "idempotent": False}
        self.idem[(head.id, body["idempotency_key"])] = (client_hash, response)
        return {**response, "target": {"review_id": head.id, "revision_id": head.latest, "resolved_by": "server"},
                "next": "revise_then_resubmit"}

    def find_message(self, mid: str) -> dict | None:
        for rows in self.messages.values():
            for m in rows:
                if m["id"] == mid:
                    return m
        return None

    def resolve_target(self, body: dict) -> Head:
        session = body["session_id"]
        artifact_id = body.get("artifact_id")
        if body.get("reply_to_id"):
            replied = self.find_message(body["reply_to_id"])
            if not replied:
                fail(404, "reply_target_not_found")
            if replied["session_id"] != session:
                fail(422, "reply_target_session_mismatch")
            if artifact_id and replied.get("artifact_id") and replied["artifact_id"] != artifact_id:
                fail(422, "review_target_conflict", reason="artifact_vs_reply")
            artifact_id = artifact_id or replied.get("artifact_id")
        hinted: set[str] = set()
        if artifact_id:
            art = next((a for rows in self.artifacts.values() for a in rows if a["id"] == artifact_id), None)
            if not art or art["session_id"] != session:
                fail(404, "artifact_not_found")
            raw = art["metadata"].get("mockup_review_id")
            if raw:
                hinted.add(raw)
            elif body.get("artifact_id"):
                fail(422, "artifact_not_a_mockup")
        if body.get("review_id"):
            if hinted and body["review_id"] not in hinted:
                fail(422, "review_target_conflict", reason="review_vs_artifact")
            hinted = {body["review_id"]}
        if hinted:
            head = self.heads.get(next(iter(hinted)))
            if not head:
                fail(404, "review_not_found")
        else:
            rows = [h for h in self.heads.values() if h.session_id == session and h.status in ACTIVE_STATES]
            if not rows:
                fail(404, "review_target_not_found")
            if len(rows) > 1:
                fail(409, "ambiguous_review_target", candidates=[h.id for h in rows])
            head = rows[0]
        if head.session_id and head.session_id != session:
            fail(422, "review_session_mismatch")
        return head

    # -------------------------------------------------------------------- chat
    async def _chat(self, method: str, p: str, q: dict[str, list[str]], data: dict | None, headers: dict[str, str]) -> dict:
        one = lambda k, default=None: (q.get(k) or [default])[0]  # noqa: E731
        if method == "GET":
            if p == "/auth/me":
                return {"json": {"user_id": "fixture-user", "email": "fixture@example.invalid", "is_admin": True,
                                 "is_internal_admin": True, "tenant_id": "fixture-tenant", "tenant_role": "owner"}}
            if p == "/ops/version":
                return {"json": {"version": "fixture-stable"}}
            if p == "/chat/workspaces":
                return {"json": [{"id": WS_ID, "name": "[AADS] 목업 검증", "project_key": PROJECT, "icon": "A", "color": "#2563eb", "settings": {}}]}
            if p == "/chat/sessions":
                return {"json": list(self.sessions.values())}
            m = re.fullmatch(r"/chat/sessions/([0-9a-f-]{36})", p)
            if m:
                return {"json": self.sessions[m.group(1)]}
            if p == "/chat/messages":
                sid = one("session_id")
                rows = list(self.messages.get(sid, []))
                if one("sort") == "desc":
                    return {"json": rows[::-1]}
                return {"json": {"messages": rows, "has_more": False, "next_cursor": None}}
            if p == "/chat/artifacts":
                return {"json": list(self.artifacts.get(one("session_id"), []))}
            if p.endswith("/streaming-status"):
                return {"json": {"is_streaming": False, "execution_id": None, "execution_status": "completed",
                                 "stream_status": "completed", "final_message_ready": False, "completed": True, "partial_content": ""}}
            if p.endswith("/last-response"):
                return {"json": {"message": None}}
            if p.endswith("/todos"):
                return {"json": {"items": []}}
            if p.endswith("/directive-drafts"):
                return {"json": {"items": []}}
            if p.endswith("/roles"):
                return {"json": {"roles": []}}
            if p == "/approvals/pending":
                return {"json": {"pending": []}}
            if p in ("/goals", "/agenda/"):
                return {"json": {"items": []}}
            if p == "/chat/templates":
                return {"json": []}
            if p == "/llm-models":
                return {"json": {"models": [{"provider": "anthropic", "model_id": "claude-sonnet", "display_name": "Claude Sonnet",
                                             "input_cost": 3, "output_cost": 15, "is_active": True, "is_selectable": True,
                                             "is_executable": True, "metadata": {}}]}}
            if p == "/llm-models/chat-preferences":
                return {"json": {"preferences": []}}
            if p.endswith("/documents") and p.startswith("/projects/"):
                return {"json": {"items": [], "documents": [], "canonical_documents": []}}
            if p.startswith("/goals/for-session/"):
                return {"json": {"goals": [], "items": []}}
            if p.endswith("/session-attention") or p == "/chat/session-attention":
                return {"json": {"items": [], "sessions": [], "working_count": 0, "completed_unread_count": 0}}
            if p.startswith("/design/intake/by-chat/"):
                return {"json": {"session_id": None, "questions": [], "round": 1, "brief": {}, "brief_confirmed": False}}
            if p == "/health/relay-capacity":
                return {"json": {"available": True, "status": "ok", "active_leases": {}, "limits": {}, "queue_depth": 0}}
            self.unmocked_gets.append(p + ("?" + "&".join(f"{k}={v[0]}" for k, v in q.items()) if q else ""))
            return {"status": 200, "json": {}}
        if method == "POST" and p == "/chat/messages/send":
            return self.send_message(data or {})
        fail(405, "unexpected_write", method=method, path=p)

    def send_message(self, body: dict) -> dict:
        sid = body.get("session_id")
        if sid not in self.sessions or not str(body.get("content", "")).strip():
            fail(422, "validation_error")
        self.counter += 1
        saved = self._msg(det_uuid("sent", sid, self.counter), sid, "user", body["content"], 1000 + self.counter,
                          idempotency_key=body.get("idempotency_key"), intent="chat")
        saved["created_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self.messages[sid].append(saved)
        reply = self._msg(det_uuid("reply", sid, self.counter), sid, "assistant", "수정 요청을 받았습니다. 확인 후 새 판으로 보고하겠습니다.", 1000 + self.counter)
        reply["created_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self.messages[sid].append(reply)
        self.sessions[sid]["message_count"] = len(self.messages[sid])
        events = [{"type": "stream_start", "execution_id": det_uuid("exec", sid, self.counter), "stream_id": "fixture"},
                  {"type": "delta", "content": reply["content"]},
                  {"type": "done", "model": "mixture", "intent": "chat", "message_id": reply["id"]}]
        return {"status": 200, "content_type": "text/event-stream",
                "body": "".join("data: " + json.dumps(e, ensure_ascii=False) + "\n\n" for e in events).encode()}
