from sqlalchemy import text


def run_all(conn):
    """All idempotent schema migrations, executed in order."""
    _legacy_columns_and_constraints(conn)
    _conversation_summaries(conn)
    _scheduled_followups(conn)
    _indexes(conn)
    _usage_and_pricing(conn)
    _multichannel(conn)
    _structural_improvements(conn)
    _cascade_and_jsonb(conn)
    _vector_indexes(conn)
    _agent_functions(conn)
    _llm_models(conn)
    _internal_triggers(conn)
    _escalation_reasons(conn)
    _knowledge_source(conn)
    _message_inbox_media(conn)
    _message_reply_to(conn)
    conn.commit()


def _legacy_columns_and_constraints(conn):
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
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        """))

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_user_id_fkey;
            ALTER TABLE appointments ADD CONSTRAINT appointments_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null;
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
            ALTER TABLE agents ADD COLUMN context_summary_config JSON;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))


def _conversation_summaries(conn):
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


def _scheduled_followups(conn):
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
            ALTER TABLE scheduled_followups ADD COLUMN responded_at TIMESTAMP;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))


def _indexes(conn):
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_messages_conv_created
        ON messages (conversation_id, created_at);
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_conversations_agent_created
        ON conversations (agent_id, created_at);
    """))


def _usage_and_pricing(conn):
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


def _multichannel(conn):
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

    for col_def in [
        "channel_id INT REFERENCES agent_channels(id) ON DELETE SET NULL",
        "channel_user_id INT REFERENCES channel_users(id) ON DELETE SET NULL",
        "channel_type_snapshot VARCHAR(30)",
    ]:
        col_name = col_def.split()[0]
        conn.execute(text(f"""
            DO $$ BEGIN
                ALTER TABLE conversations ADD COLUMN {col_def};
            EXCEPTION WHEN duplicate_column THEN null;
            END $$;
        """))

    # Upgrade legacy RESTRICT constraint to SET NULL (allow channel deletion)
    conn.execute(text("""
        DO $$
        DECLARE
            constraint_name TEXT;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'conversations'::regclass
              AND contype = 'f'
              AND confdeltype = 'r'
              AND confrelid = 'agent_channels'::regclass
            LIMIT 1;

            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE conversations DROP CONSTRAINT %I', constraint_name);
                ALTER TABLE conversations
                    ADD CONSTRAINT conversations_channel_id_fkey
                    FOREIGN KEY (channel_id) REFERENCES agent_channels(id) ON DELETE SET NULL;
            END IF;
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

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN business_assistant_mode BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agent_channels ADD COLUMN account_name VARCHAR(200);
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    # Ensure timestamp defaults exist on tables possibly created via
    # Base.metadata.create_all before server_default was set on the model.
    for tbl in ("agent_channels", "channel_users"):
        conn.execute(text(
            f"ALTER TABLE {tbl} ALTER COLUMN created_at SET DEFAULT NOW()"
        ))
        conn.execute(text(
            f"ALTER TABLE {tbl} ALTER COLUMN updated_at SET DEFAULT NOW()"
        ))


def _structural_improvements(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))

    # phone_number_id: allow NULL so non-Meta agents (e.g. WaSender) can be
    # created without colliding on the UNIQUE index when multiple have ''.
    conn.execute(text("ALTER TABLE agents ALTER COLUMN phone_number_id DROP NOT NULL"))
    conn.execute(text("UPDATE agents SET phone_number_id = NULL WHERE phone_number_id = ''"))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_document_chunks_document
        ON document_chunks(document_id);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_data_rows_table
        ON data_rows(table_id);
    """))


def _cascade_and_jsonb(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
            ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """))

    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
            ALTER TABLE conversations ADD CONSTRAINT conversations_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """))

    for col in (
        "provider_config", "batching_config", "usage_stats",
        "calendar_config", "summary_config", "followup_config",
        "media_config", "custom_api_keys", "context_summary_config",
    ):
        conn.execute(text(
            f"ALTER TABLE agents ALTER COLUMN {col} TYPE JSONB USING {col}::jsonb"
        ))


def _vector_indexes(conn):
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_doc_chunks_embedding_hnsw
        ON document_chunks USING hnsw (embedding vector_cosine_ops);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_data_rows_embedding_hnsw
        ON data_rows USING hnsw (embedding vector_cosine_ops);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_agent_media_embedding_hnsw
        ON agent_media USING hnsw (embedding vector_cosine_ops);
    """))


def _agent_functions(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_functions (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            name VARCHAR(64) NOT NULL,
            when_to_use TEXT NOT NULL,
            when_not_to_use TEXT NOT NULL DEFAULT '',
            response_instructions TEXT NOT NULL DEFAULT '',
            side_effect VARCHAR(16) NOT NULL DEFAULT 'read',
            trigger VARCHAR(24) NOT NULL DEFAULT 'conversation',
            event_type VARCHAR(64),
            method VARCHAR(8) NOT NULL DEFAULT 'GET',
            url TEXT NOT NULL,
            allowed_host VARCHAR(255) NOT NULL,
            headers_encrypted BYTEA,
            body_template TEXT,
            params JSONB NOT NULL DEFAULT '[]'::jsonb,
            outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
            timeout_ms INTEGER NOT NULL DEFAULT 8000,
            max_response_chars INTEGER NOT NULL DEFAULT 4000,
            sort_order INTEGER NOT NULL DEFAULT 0,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            test_passed_at TIMESTAMP,
            test_was_live BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_functions_agent_name
        ON agent_functions(agent_id, name);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_agent_functions_agent_enabled
        ON agent_functions(agent_id, enabled);
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_function_runs (
            id SERIAL PRIMARY KEY,
            function_id INTEGER NOT NULL REFERENCES agent_functions(id) ON DELETE CASCADE,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            status VARCHAR(24) NOT NULL,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            request_preview JSONB,
            response_preview JSONB,
            error VARCHAR(500),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_agent_function_runs_function
        ON agent_function_runs(function_id, created_at DESC);
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN max_tool_rounds INTEGER NOT NULL DEFAULT 5;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations ADD COLUMN function_state JSONB;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_function_idempotency (
            id SERIAL PRIMARY KEY,
            key VARCHAR(128) NOT NULL,
            function_id INTEGER NOT NULL REFERENCES agent_functions(id) ON DELETE CASCADE,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            status VARCHAR(24) NOT NULL,
            outputs JSONB,
            error VARCHAR(500),
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_function_idempotency_key
        ON agent_function_idempotency(key);
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agent_functions
            ADD COLUMN max_response_chars INTEGER NOT NULL DEFAULT 4000;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_agent_function_idempotency_attention
        ON agent_function_idempotency(agent_id, status, created_at DESC);
    """))


def _llm_models(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN thinking_level VARCHAR(16) NOT NULL DEFAULT 'off';
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))
    from backend.services.llm.catalog import ALIASES
    for old, new in ALIASES.items():
        conn.execute(
            text("UPDATE agents SET model = :new WHERE model = :old"),
            {"old": old, "new": new},
        )
    conn.execute(text("""
        UPDATE agents SET thinking_level = 'low'
        WHERE model LIKE 'gemini%'
          AND thinking_level NOT IN ('minimal', 'low', 'medium', 'high')
    """))


def _internal_triggers(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_triggers (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            name VARCHAR(80) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            token VARCHAR(64) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_triggers_token
        ON agent_triggers(token);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_agent_triggers_agent
        ON agent_triggers(agent_id);
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations ADD COLUMN injected_context JSONB;
        EXCEPTION WHEN duplicate_column THEN null;
        END $$;
    """))


def _escalation_reasons(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS agent_escalation_reasons (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            name VARCHAR(80) NOT NULL,
            slug VARCHAR(64) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            when_to_use TEXT NOT NULL DEFAULT '',
            payload_hint TEXT NOT NULL DEFAULT '',
            fields JSONB NOT NULL DEFAULT '[]'::jsonb,
            phones JSONB NOT NULL DEFAULT '[]'::jsonb,
            webhook_url TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_escalation_agent_slug
        ON agent_escalation_reasons(agent_id, slug);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_escalation_reasons_agent
        ON agent_escalation_reasons(agent_id);
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS escalation_cooldowns (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            reason_id INTEGER NOT NULL REFERENCES agent_escalation_reasons(id) ON DELETE CASCADE,
            fired_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_escalation_cooldown
        ON escalation_cooldowns(conversation_id, reason_id);
    """))


def _knowledge_source(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE documents ADD COLUMN source_text TEXT;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _message_inbox_media(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE messages ADD COLUMN media_too_large BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _message_reply_to(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE messages ADD COLUMN reply_to_text TEXT;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))

