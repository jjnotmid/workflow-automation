#!/usr/bin/env python3
"""
Free-tier proxy for Claude Code -> OpenRouter.

Why this exists: Claude Code validates the model NAME client-side and rejects
anything that isn't a recognized Claude id. OpenRouter's free models are named
things like `nvidia/nemotron-3-super-120b-a12b:free`, so Claude Code refuses
them outright even though the API handles them fine.

This proxy sits in between. Claude Code talks to it using a normal Claude model
name; the proxy swaps in a real free OpenRouter model, and on a 429 (free pools
are shared and rate-limit constantly) it transparently fails over to the next
model in the list. Streaming passes straight through.

HARD RULE: only model ids ending in `:free` are ever forwarded. There is no
code path that can bill the account.

Run:  python3 free_proxy.py [--port 8787]
"""

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# python.org builds ship without a CA bundle, so urlopen fails TLS verification.
# Fall back to macOS's system bundle rather than disabling verification.
def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    for path in ("/etc/ssl/cert.pem", "/usr/local/etc/openssl/cert.pem"):
        if os.path.exists(path):
            return ssl.create_default_context(cafile=path)
    return ssl.create_default_context()


SSL_CTX = _ssl_context()

UPSTREAM = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

DEFAULT_FREE = (
    "nvidia/nemotron-3-super-120b-a12b:free "
    "z-ai/glm-5.2:free "
    "nvidia/nemotron-3-ultra-550b-a55b:free "
    "poolside/laguna-s-2.1:free "
    "thinkingmachines/inkling:free "
    "google/gemma-4-31b-it:free "
    "nvidia/nemotron-3-nano-30b-a3b:free"
)

FREE_MODELS = [
    m for m in os.environ.get("OPENROUTER_FREE_MODELS", DEFAULT_FREE).split()
    if m.endswith(":free")
]

# Claude Code asks for a small/fast model for cheap background work. Point that
# at the smallest free model so the big one is reserved for real turns.
SMALL_MODELS = [m for m in FREE_MODELS if "nano" in m or "gemma" in m] or FREE_MODELS


def log(msg):
    print(f"[free-proxy] {msg}", file=sys.stderr, flush=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass  # silence default access logging

    def _fail(self, code, msg):
        body = json.dumps(
            {"type": "error", "error": {"type": "api_error", "message": msg}}
        ).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Health probe so `router-status` can check the proxy is alive.
        if self.path.rstrip("/").endswith("/health"):
            body = json.dumps({"ok": True, "models": FREE_MODELS}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self._fail(404, "not found")

    def do_POST(self):
        if not API_KEY:
            return self._fail(500, "OPENROUTER_API_KEY not set in proxy environment")

        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
        except Exception:
            return self._fail(400, "invalid JSON body")

        requested = str(payload.get("model", ""))
        # Claude Code sends its small/fast model for trivial work — route it cheap.
        is_small = "haiku" in requested.lower()
        candidates = SMALL_MODELS if is_small else FREE_MODELS
        if not candidates:
            return self._fail(500, "no :free models configured")

        streaming = bool(payload.get("stream"))
        last_err = "no candidates tried"

        for model in candidates:
            payload["model"] = model  # guaranteed :free by construction
            body = json.dumps(payload).encode()
            req = urllib.request.Request(
                f"{UPSTREAM}/messages",
                data=body,
                method="POST",
                headers={
                    "content-type": "application/json",
                    "x-api-key": API_KEY,
                    "authorization": f"Bearer {API_KEY}",
                    "anthropic-version": self.headers.get(
                        "anthropic-version", "2023-06-01"
                    ),
                    "http-referer": "https://github.com/local/workflow-automation",
                    "x-title": "Workflow Automation",
                },
            )
            try:
                upstream = urllib.request.urlopen(req, timeout=600, context=SSL_CTX)
            except urllib.error.HTTPError as e:
                detail = e.read()[:400].decode(errors="replace")
                last_err = f"{model} -> HTTP {e.code}: {detail}"
                # 429/5xx mean this free pool is busy; try the next model.
                if e.code in (402, 408, 429, 500, 502, 503, 504):
                    log(f"failover: {model} returned {e.code}")
                    continue
                return self._fail(e.code, last_err)
            except Exception as e:
                last_err = f"{model} -> {e}"
                log(f"failover: {model} errored: {e}")
                continue

            log(f"serving via {model}{' (stream)' if streaming else ''}")
            self.send_response(200)
            ctype = upstream.headers.get(
                "content-type",
                "text/event-stream" if streaming else "application/json",
            )
            self.send_header("content-type", ctype)
            self.send_header("transfer-encoding", "chunked")
            self.end_headers()

            try:
                while True:
                    chunk = upstream.read(8192)
                    if not chunk:
                        break
                    self.wfile.write(f"{len(chunk):X}\r\n".encode())
                    self.wfile.write(chunk)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass  # client hung up mid-stream; nothing to clean up
            return

        log(f"all free models exhausted: {last_err}")
        self._fail(503, f"All free models unavailable. Last error: {last_err}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()

    if not FREE_MODELS:
        log("FATAL: no :free models configured")
        sys.exit(1)

    log(f"listening on http://127.0.0.1:{args.port}")
    log(f"free pool ({len(FREE_MODELS)}): {', '.join(FREE_MODELS)}")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
