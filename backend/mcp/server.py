import inspect
from contextlib import asynccontextmanager, AsyncExitStack

from fastmcp import FastMCP
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.auth import mcp_tokens
from backend.core.database import SessionLocal
from backend.mcp.tools import INSTRUCTIONS, register


def _pat_ok(token: str) -> bool:
    if not token or not token.startswith(mcp_tokens.TOKEN_PREFIX):
        return False
    db = SessionLocal()
    try:
        return mcp_tokens.authenticate(db, token) is not None
    finally:
        db.close()


def _build_mcp() -> FastMCP:
    # Streamable HTTP, one request = one JSON body. SSE stays open and
    # mcp-remote (Claude Desktop) hangs on large tools/call payloads.
    common = {"name": "Optive", "instructions": INSTRUCTIONS}
    for extra in (
        {"stateless_http": True, "json_response": True},
        {"stateless_http": True},
        {},
    ):
        try:
            return FastMCP(**common, **extra)
        except TypeError:
            continue
    return FastMCP(name="Optive", instructions=INSTRUCTIONS)


mcp = _build_mcp()
register(mcp)


class _RequireMcpToken:
    """Reject unauthenticated MCP HTTP before FastMCP. OPTIONS stays open for CORS."""

    def __init__(self, app: ASGIApp):
        self.app = app
        self.lifespan = getattr(app, "lifespan", None)
        self.routes = getattr(app, "routes", [])

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("method") != "OPTIONS":
            headers = {
                k.decode("latin1").lower(): v.decode("latin1")
                for k, v in scope.get("headers", [])
            }
            raw = headers.get("authorization", "")
            token = raw[7:].strip() if raw.lower().startswith("bearer ") else ""
            if not _pat_ok(token):
                # No WWW-Authenticate: Bearer — that makes mcp-remote start
                # OAuth discovery against routes we do not serve.
                response = JSONResponse(
                    {"error": "invalid_mcp_token"},
                    status_code=401,
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


def _http_app():
    kwargs = {}
    try:
        params = inspect.signature(mcp.http_app).parameters
    except (TypeError, ValueError):
        params = {}
    if "path" in params:
        kwargs["path"] = "/"
    if "stateless_http" in params:
        kwargs["stateless_http"] = True
    if "json_response" in params:
        kwargs["json_response"] = True
    if "host_origin_protection" in params:
        kwargs["host_origin_protection"] = False
    return mcp.http_app(**kwargs)


_raw_mcp_app = _http_app()
mcp_http_app = _RequireMcpToken(_raw_mcp_app)


class McpSlashRewrite:
    """Starlette redirects /mcp → /mcp/ with Location: http:// behind TLS proxies.

    mcp-remote treats that as a failed Streamable HTTP probe, then invents an
    OAuth registration URL and dies on FastAPI's {"detail":"Not Found"}.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path") == "/mcp":
            scope = dict(scope)
            scope["path"] = "/mcp/"
            raw = scope.get("raw_path") or b"/mcp"
            if not raw.endswith(b"/"):
                scope["raw_path"] = raw + b"/"
        await self.app(scope, receive, send)


def _combine_lifespans(*lifespans):
    try:
        from fastmcp.utilities.lifespan import combine_lifespans
        return combine_lifespans(*lifespans)
    except ImportError:
        @asynccontextmanager
        async def combined(app):
            async with AsyncExitStack() as stack:
                for ls in lifespans:
                    await stack.enter_async_context(ls(app))
                yield
        return combined


def combine_with_mcp(app_lifespan):
    mcp_lifespan = getattr(_raw_mcp_app, "lifespan", None)
    if mcp_lifespan is None:
        return app_lifespan
    return _combine_lifespans(app_lifespan, mcp_lifespan)
