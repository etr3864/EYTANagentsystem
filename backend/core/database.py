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
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(1)"))
            conn.commit()


def _run_migration_statements(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN owner_id INTEGER REFERENCES auth_users(id) ON DELETE RESTRICT;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_agents_owner_id ON agents(owner_id);
    """))

    for table, constraint in [
        ("appointments", "appointments_agent_id_fkey"),
        ("conversations", "conversations_agent_id_fkey"),
    ]:
        conn.execute(text(f"""
            DO $$ BEGIN
                ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint};
                ALTER TABLE {table} ADD CONSTRAINT {constraint}
                    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
        """))

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations ADD COLUMN last_customer_message_at TIMESTAMP;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN followup_config JSON;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN custom_api_keys JSON;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversation_summaries ADD COLUMN last_message_at TIMESTAMP;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        UPDATE conversation_summaries
        SET last_message_at = created_at
        WHERE last_message_at IS NULL;
    """))
    conn.execute(text("""
        DELETE FROM conversation_summaries
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM conversation_summaries
            GROUP BY conversation_id, last_message_at
        );
    """))
    conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'uq_summary_per_message_window'
            ) THEN
                CREATE UNIQUE INDEX uq_summary_per_message_window
                ON conversation_summaries (conversation_id, last_message_at);
            END IF;
        END $$;
    """))

    conn.execute(text("""
        DO $$
        DECLARE col_exists BOOLEAN;
        BEGIN
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'scheduled_followups' AND column_name = 'step_instruction'
            ) INTO col_exists;

            IF NOT col_exists THEN
                ALTER TABLE scheduled_followups ADD COLUMN step_instruction TEXT;
                DELETE FROM scheduled_followups;
            END IF;
        END $$;
    """))

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN context_summary_config JSON;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
