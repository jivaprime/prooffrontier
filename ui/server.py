#!/usr/bin/env python3
"""ProofFrontier UI server.

Endpoints:
* GET  /            static UI
* GET  /api/health  {ok, lakeProject}
* POST /api/parse   {source} -> static analysis (kernel axis = unchecked)
* POST /api/verify  {source, filename} -> authenticated exact-source frontend
                    inspection, exact direct edges and axiom closures

The UI never parses Lean itself: both endpoints run the same Python
parser, so CLI and UI classification can never diverge.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

UI_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = UI_ROOT.parent
sys.path.insert(0, str(PROJECT_ROOT))

from prooffrontier.analyze import analyze  # noqa: E402
from prooffrontier.runner import find_project_root  # noqa: E402

MAX_SOURCE_BYTES = 5 * 1024 * 1024
WORKSPACE = PROJECT_ROOT
TIMEOUT = 180
ALLOW_REMOTE = False


def is_loopback_name(hostname: str | None) -> bool:
    if hostname is None:
        return False
    if hostname.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def request_origin_allowed(
    host_header: str,
    origin: str | None,
    server_port: int,
    allow_remote: bool,
) -> bool:
    """Reject browser requests that did not originate from this server."""
    try:
        request_url = urlsplit(f"//{host_header}")
        request_host = request_url.hostname
        request_port = request_url.port or server_port
    except ValueError:
        return False

    if not allow_remote and not is_loopback_name(request_host):
        return False
    if not origin:
        return True

    try:
        origin_url = urlsplit(origin)
        origin_port = origin_url.port or (
            443 if origin_url.scheme == "https" else 80
        )
    except ValueError:
        return False
    return (
        origin_url.scheme in {"http", "https"}
        and origin_url.hostname == request_host
        and origin_port == request_port
    )


def public(analysis: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in analysis.items() if not k.startswith("_")}


class Handler(SimpleHTTPRequestHandler):
    server_version = "ProofFrontier/0.1.0"
    sys_version = ""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                         "script-src 'self'; img-src 'self' data:; "
                         "connect-src 'self'; object-src 'none'; base-uri 'none'; "
                         "frame-ancestors 'none'")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self.send_json({
                "ok": True,
                "lakeProject": find_project_root(WORKSPACE) is not None,
            })
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path not in ("/api/parse", "/api/verify"):
            self.send_error(404)
            return
        if not request_origin_allowed(
            self.headers.get("Host", ""),
            self.headers.get("Origin"),
            self.server.server_port,
            ALLOW_REMOTE,
        ):
            self.send_json({"error": "Request origin is not allowed."}, status=403)
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(
                {"error": "Content-Type must be application/json."},
                status=415,
            )
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_SOURCE_BYTES:
            self.send_error(413, "Lean source is too large")
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            source = str(payload.get("source", ""))
            filename = str(payload.get("filename", "Input.lean"))
            run_lean = self.path == "/api/verify"
            analysis = analyze(
                source, filename=filename, workspace=WORKSPACE,
                run_lean=run_lean, probe_axioms=run_lean, timeout=TIMEOUT,
            )
            self.send_json(public(analysis))
        except Exception as exc:  # keep the UI alive, surface the failure
            self.send_json({"error": str(exc)}, status=500)

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    global WORKSPACE, TIMEOUT, ALLOW_REMOTE
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--workspace", default=str(PROJECT_ROOT),
                        help="directory whose Lake project should be used for verification")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument(
        "--allow-remote", action="store_true",
        help="allow non-loopback Host values (unsafe without an external sandbox)",
    )
    args = parser.parse_args()
    if not args.allow_remote and not is_loopback_name(args.host):
        parser.error("non-loopback --host requires explicit --allow-remote")
    WORKSPACE = Path(args.workspace)
    TIMEOUT = args.timeout
    ALLOW_REMOTE = args.allow_remote

    def factory(*a: Any, **kw: Any) -> Handler:
        return Handler(*a, directory=str(UI_ROOT), **kw)

    server = ThreadingHTTPServer((args.host, args.port), factory)
    server.daemon_threads = True
    print(f"ProofFrontier UI: http://{args.host}:{args.port}/")
    print(f"Workspace: {WORKSPACE}")
    if ALLOW_REMOTE:
        print("WARNING: remote access is enabled; verify only trusted Lean source.")
    server.serve_forever()


if __name__ == "__main__":
    main()
