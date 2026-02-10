from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.core.config import settings

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
        
        # Create UserRole enum if not exists - check first to avoid race condition
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
    """Run any pending schema migrations."""
    with engine.connect() as conn:
        # Add owner_id to agents if not exists
        conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE agents ADD COLUMN owner_id INTEGER REFERENCES auth_users(id) ON DELETE RESTRICT;
            EXCEPTION
                WHEN duplicate_column THEN null;
            END $$;
        """))
        
        # Create index if not exists
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_agents_owner_id ON agents(owner_id);
        """))
        
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
