from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_size=50,           # Increased for high agent count
    max_overflow=100,       # Allows burst to 150 total connections
    pool_pre_ping=True,     # Check connection health before use
    pool_recycle=1800,      # Recycle connections after 30 min
)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def init_extensions():
    """Initialize required PostgreSQL extensions."""
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
