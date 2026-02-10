import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from backend.core.database import engine, Base, init_extensions, SessionLocal
from backend.core.logger import log, log_error
from backend.api.routers import agents_router, users_router, conversations_router, database_router, webhook_router, knowledge_router, webhook_wasender_router, calendar_router, summaries_router, media_router
from backend.services import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_extensions()
    Base.metadata.create_all(bind=engine)
    
    # Start the reminder scheduler as a background task
    scheduler_task = asyncio.create_task(scheduler.start_scheduler())
    
    log("SERVER_UP", port=8000)
    yield
    
    # Stop the scheduler gracefully
    await scheduler.stop_scheduler()
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    
    log("SERVER_DOWN")


app = FastAPI(title="WhatsApp AI Agents", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions - log details but return safe response."""
    log_error("unhandled", f"{type(exc).__name__}: {str(exc)[:100]}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# CORS - configurable via environment
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(agents_router, prefix="/api/agents")
app.include_router(users_router, prefix="/api/users")
app.include_router(conversations_router, prefix="/api/conversations")
app.include_router(database_router, prefix="/api/db")
app.include_router(webhook_router)
app.include_router(webhook_wasender_router)
app.include_router(knowledge_router, prefix="/api")
app.include_router(calendar_router, prefix="/api")
app.include_router(summaries_router, prefix="/api")
app.include_router(media_router, prefix="/api")


@app.get("/health")
async def health():
    """Health check endpoint - verifies DB connection."""
    checks = {"status": "ok", "database": "ok"}
    
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        checks["database"] = f"error: {str(e)[:50]}"
        checks["status"] = "degraded"
    
    return checks


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True, log_level="warning")
