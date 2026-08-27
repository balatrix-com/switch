"""Small cache-control API used by the Nest backend after billing mutations."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cache_manager import refresh_cache
from config import API_HOST, API_PORT, CACHE_REFRESH_TOKEN


class Handler(BaseHTTPRequestHandler):
    server_version = "BillingCache/1.0"

    def _write(self, status: int, body: dict) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _authorized(self) -> bool:
        return bool(CACHE_REFRESH_TOKEN) and self.headers.get("X-Auth-Token") == CACHE_REFRESH_TOKEN

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._write(200, {"status": "ok", "service": "billing-cache"})
        else:
            self._write(404, {"message": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/v1/cache/refresh":
            self._write(404, {"message": "Not found"})
            return
        if not self._authorized():
            self._write(401, {"message": "Invalid cache refresh token"})
            return
        try:
            result = refresh_cache()
            self._write(200, {"status": "refreshed", **result})
        except Exception as error:
            self._write(500, {"message": str(error)})

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[BILLING-CACHE] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"[BILLING-CACHE] listening on {API_HOST}:{API_PORT}")
    ThreadingHTTPServer((API_HOST, API_PORT), Handler).serve_forever()

