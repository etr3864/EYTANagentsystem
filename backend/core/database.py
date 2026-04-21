import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from backend.core.config import settings
from backend.core.migrations import run_all as _run_migration_statements

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    pool_size=20,           # Base pool (Render Standard allows 97 total)
    max_overflow=30,        # Allows burst to 50 total connections
    pool_pre_ping=True,     # Check connection health before use
    pool_recycle=300,       # Recycle connections every 5 min (cloud DB best practice)
)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def init_extensions():
    """Initialize required PostgreSQL extensions and types."""
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        
        conn.execute(text("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
                    CREATE TYPE userrole AS ENUM ('super_admin', 'admin', 'employee');
                END IF;
            END $$;
        """))
        
        conn.commit()


def run_migrations():
    """Run any pending schema migrations.

    Uses a PostgreSQL advisory lock so only one worker runs migrations
    when multiple processes start simultaneously (e.g. Render multi-worker deploy).
    """
    with engine.connect() as conn:
        acquired = conn.execute(text("SELECT pg_try_advisory_lock(1)")).scalar()
        if not acquired:
            conn.commit()
            return

        try:
            _run_migration_statements(conn)
        except Exception as e:
            logger.error("Migration failed: %s", e)
            conn.rollback()
            raise
        finally:
            try:
                conn.execute(text("SELECT pg_advisory_unlock(1)"))
                conn.commit()
            except Exception:
                conn.rollback()



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
