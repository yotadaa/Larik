from __future__ import annotations

import json
import logging
import mimetypes
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from src.applications.use_cases.preview_queries import PreviewQueries
from src.infrastructures.database.repository import SQLiteStoryRepository

logger = logging.getLogger(__name__)

_NOVEL_RE = re.compile(r"^/api/novel/([^/]+)$")
_CHAPTER_RE = re.compile(r"^/api/novel/([^/]+)/chapter/(\d+)$")
_ATLAS_RE = re.compile(r"^/api/novel/([^/]+)/atlas$")


class PreviewHandler(BaseHTTPRequestHandler):
    database_path: Path
    static_root: Path | None = None

    def log_message(self, fmt: str, *args) -> None:
        logger.debug("HTTP %s - %s", self.address_string(), fmt % args)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        lang_id = (query.get("lang") or ["id"])[0]
        logger.debug("Preview request path=%s lang=%s", path, lang_id)

        try:
            if path == "/api/health":
                self._json({"ok": True, "database": str(self.database_path)})
                return
            if path == "/api/overview":
                self._with_queries(lambda q: self._json(q.overview()))
                return

            match = _CHAPTER_RE.match(path)
            if match:
                novel_id = unquote(match.group(1))
                chapter_number = int(match.group(2))
                def chapter_response(q: PreviewQueries) -> None:
                    data = q.chapter(novel_id, lang_id, chapter_number)
                    if data is None:
                        self._json({"error": "chapter not found"}, status=HTTPStatus.NOT_FOUND)
                    else:
                        self._json(data)
                self._with_queries(chapter_response)
                return

            match = _ATLAS_RE.match(path)
            if match:
                novel_id = unquote(match.group(1))
                self._with_queries(lambda q: self._json(q.atlas(novel_id, lang_id)))
                return

            match = _NOVEL_RE.match(path)
            if match:
                novel_id = unquote(match.group(1))
                self._with_queries(lambda q: self._json(q.novel(novel_id, lang_id)))
                return

            if path.startswith("/api/"):
                self._json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)
                return

            self._serve_static(path)
        except Exception as exc:
            logger.exception("Preview request failed path=%s: %s", path, exc)
            self._json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.end_headers()

    def _with_queries(self, callback) -> None:
        repo = SQLiteStoryRepository(self.database_path)
        try:
            callback(PreviewQueries(repo))
        finally:
            repo.close()

    def _json(self, payload, *, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _serve_static(self, request_path: str) -> None:
        if not self.static_root or not self.static_root.is_dir():
            body = (
                "<!doctype html><meta charset='utf-8'><title>Larik Preview API</title>"
                "<style>body{font:16px system-ui;margin:40px;max-width:760px}code{background:#f3f4f6;padding:.2em .4em;border-radius:6px}</style>"
                "<h1>Larik preview API is running</h1>"
                "<p>Build the React preview with <code>cd web && npm install && npm run build</code>, "
                "or run <code>npm run dev</code> for Vite HMR.</p>"
            ).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        relative = request_path.lstrip("/") or "index.html"
        candidate = (self.static_root / relative).resolve()
        if self.static_root.resolve() not in candidate.parents and candidate != self.static_root.resolve():
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if candidate.is_file():
            self._file(candidate)
            return

        # SPA fallback for React Router client-side routes.
        index = self.static_root / "index.html"
        if index.is_file():
            self._file(index)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def _file(self, path: Path) -> None:
        body = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_preview_server(database_path: Path, *, host: str, port: int, static_root: Path | None = None) -> None:
    class BoundHandler(PreviewHandler):
        pass

    BoundHandler.database_path = database_path
    BoundHandler.static_root = static_root
    server = ThreadingHTTPServer((host, port), BoundHandler)
    logger.info("Preview server listening http://%s:%d database=%s static=%s", host, port, database_path, static_root)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Preview server stopped")
    finally:
        server.server_close()
