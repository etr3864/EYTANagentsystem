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


try:
    mcp = FastMCP(
        name="Optive",
        instructions=INSTRUCTIONS,
        stateless_http=True,
    )
except TypeError:
    mcp = FastMCP(name="Optive", instructions=INSTRUCTIONS)
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
                response = JSONResponse(
                    {"error": "invalid_mcp_token"},
                    status_code=401,
                    headers={"WWW-Authenticate": "Bearer"},
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
    if "host_origin_protection" in params:
        kwargs["host_origin_protection"] = False
    return mcp.http_app(**kwargs)


_raw_mcp_app = _http_app()
mcp_http_app = _RequireMcpToken(_raw_mcp_app)


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
