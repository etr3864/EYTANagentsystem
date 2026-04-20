import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.core.config import settings

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

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE scheduled_followups ADD COLUMN responded_at TIMESTAMP;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_messages_conv_created
        ON messages (conversation_id, created_at);
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_conversations_agent_created
        ON conversations (agent_id, created_at);
    """))

    conn.execute(text("""
        DO $$ BEGIN
            CREATE TABLE IF NOT EXISTS agent_usage_daily (
                id SERIAL PRIMARY KEY,
                agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                model VARCHAR(50) NOT NULL,
                source VARCHAR(30) NOT NULL,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                cache_read_tokens INTEGER NOT NULL DEFAULT 0,
                cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
                CONSTRAINT uq_usage_daily UNIQUE (agent_id, date, model, source)
            );
        EXCEPTION WHEN duplicate_table THEN null;
        END $$;
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_usage_daily_agent_date
        ON agent_usage_daily (agent_id, date);
    """))

    conn.execute(text("""
        DO $$ BEGIN
            CREATE TABLE IF NOT EXISTS pricing_config (
                key VARCHAR(100) PRIMARY KEY,
                value NUMERIC(18, 6) NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        EXCEPTION WHEN duplicate_table THEN null;
        END $$;
    """))

    conn.execute(text("""
        ALTER TABLE pricing_config ALTER COLUMN updated_at SET DEFAULT NOW();
    """))

    from backend.models.pricing_config import PRICING_DEFAULTS
    for key, value in PRICING_DEFAULTS.items():
        conn.execute(
            text("INSERT INTO pricing_config (key, value, updated_at) VALUES (:key, :value, NOW()) ON CONFLICT (key) DO NOTHING"),
            {"key": key, "value": value},
        )

    # ── Phase 1: Multichannel platform foundation ──────────────────────────────

    # agent_channels — one row per channel per agent (WaSender, WA Meta, IG, MS)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_channels (
            id                    SERIAL PRIMARY KEY,
            agent_id              INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            channel_type          VARCHAR(30) NOT NULL,
            external_account_id   VARCHAR(100) NOT NULL,
            page_id               VARCHAR(100),
            waba_id               VARCHAR(100),
            credentials_encrypted BYTEA NOT NULL,
            verify_token          VARCHAR(100),
            is_active             BOOLEAN NOT NULL DEFAULT TRUE,
            last_health_check_at  TIMESTAMP,
            health_status         VARCHAR(20) DEFAULT 'unknown',
            created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_agent_channel_type UNIQUE (agent_id, channel_type),
            CONSTRAINT uq_channel_account UNIQUE (channel_type, external_account_id)
        );
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_agent_channels_agent_active
        ON agent_channels(agent_id) WHERE is_active;
    """))

    # channel_users — channel-specific user identities (BSUID ready)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS channel_users (
            id              SERIAL PRIMARY KEY,
            channel_id      INT NOT NULL REFERENCES agent_channels(id) ON DELETE CASCADE,
            external_id     VARCHAR(200) NOT NULL,
            bsuid           VARCHAR(200),
            display_name    VARCHAR(200),
            profile_pic_url TEXT,
            metadata        JSONB,
            created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_channel_user UNIQUE (channel_id, external_id)
        );
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_channel_users_bsuid
        ON channel_users(channel_id, bsuid) WHERE bsuid IS NOT NULL;
    """))

    # conversations: add channel_id, channel_user_id, channel_type_snapshot (nullable)
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations
                ADD COLUMN channel_id INT REFERENCES agent_channels(id) ON DELETE RESTRICT;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations
                ADD COLUMN channel_user_id INT REFERENCES channel_users(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations ADD COLUMN channel_type_snapshot VARCHAR(30);
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_conv_channel
        ON conversations(channel_id) WHERE channel_id IS NOT NULL;
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_conv_channel_user
        ON conversations(channel_id, channel_user_id) WHERE channel_id IS NOT NULL;
    """))

    # agent_usage_daily: add channel_type column
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agent_usage_daily ADD COLUMN channel_type VARCHAR(30);
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_usage_daily_channel
        ON agent_usage_daily(agent_id, channel_type, date);
    """))

    # agents: add business_assistant_mode flag (compliance toggle)
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN business_assistant_mode BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    # agent_channels: add account_name (IG username / Page name)
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agent_channels ADD COLUMN account_name VARCHAR(200);
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
