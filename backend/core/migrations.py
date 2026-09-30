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
    _mcp_tokens(conn)
    _playground(conn)
    _wasender_hub(conn)
    _wasender_qr_links(conn)
    _escalation_groups(conn)
    _channel_user_staff_note(conn)
    _message_group_sender(conn)
    _silence(conn)
    _campaigns(conn)
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
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agents ADD COLUMN split_config JSON;
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

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_conversations_agent_updated
        ON conversations (agent_id, updated_at DESC, id DESC)
        WHERE playground_link_id IS NULL;
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
        "split_config",
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


def _mcp_tokens(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS auth_mcp_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
            name VARCHAR(80) NOT NULL,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            prefix VARCHAR(16) NOT NULL,
            last_used_at TIMESTAMP,
            paused BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_auth_mcp_tokens_user_id
        ON auth_mcp_tokens(user_id);
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE auth_mcp_tokens ADD COLUMN paused BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _playground(conn):
    # Views block ALTER on underlying columns. Drop first, recreate at the end.
    conn.execute(text("DROP VIEW IF EXISTS conversations_live"))
    conn.execute(text("DROP VIEW IF EXISTS users_live"))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS playground_links (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
            agent_name_snapshot VARCHAR(100) NOT NULL,
            created_by INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            token_encrypted BYTEA NOT NULL,
            ttl_seconds INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            stopped_at TIMESTAMP,
            deleted_at TIMESTAMP,
            require_profile BOOLEAN NOT NULL DEFAULT TRUE,
            token_limit INTEGER NOT NULL DEFAULT 1000000,
            tokens_used INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_playground_links_agent_id
        ON playground_links(agent_id);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_playground_links_expires_at
        ON playground_links(expires_at);
    """))
    conn.execute(text("""
        ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(64);
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE users ADD COLUMN playground_link_id INTEGER
                REFERENCES playground_links(id) ON DELETE RESTRICT;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_users_playground_link_id
        ON users(playground_link_id);
    """))
    conn.execute(text("""
        ALTER TABLE conversations ALTER COLUMN agent_id DROP NOT NULL;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations ADD COLUMN playground_link_id INTEGER
                REFERENCES playground_links(id) ON DELETE RESTRICT;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE conversations ADD COLUMN archived_at TIMESTAMP;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_conversations_playground_link_id
        ON conversations(playground_link_id);
    """))
    conn.execute(text("""
        DROP INDEX IF EXISTS ix_agent_user;
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_agent_user_live
        ON conversations (agent_id, user_id)
        WHERE archived_at IS NULL AND playground_link_id IS NULL AND agent_id IS NOT NULL;
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_playground_user_live
        ON conversations (playground_link_id, user_id)
        WHERE archived_at IS NULL AND playground_link_id IS NOT NULL;
    """))
    conn.execute(text("""
        CREATE OR REPLACE VIEW conversations_live AS
        SELECT * FROM conversations WHERE playground_link_id IS NULL;
    """))
    conn.execute(text("""
        CREATE OR REPLACE VIEW users_live AS
        SELECT * FROM users WHERE playground_link_id IS NULL;
    """))


def _wasender_hub(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS system_secrets (
            name VARCHAR(64) PRIMARY KEY,
            value_encrypted BYTEA NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE messages ADD COLUMN provider_msg_id VARCHAR(120);
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _wasender_qr_links(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS wasender_qr_links (
            id SERIAL PRIMARY KEY,
            channel_id INTEGER NOT NULL REFERENCES agent_channels(id) ON DELETE CASCADE,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            created_by INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_wasender_qr_links_channel_id
        ON wasender_qr_links(channel_id);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_wasender_qr_links_expires_at
        ON wasender_qr_links(expires_at);
    """))


def _escalation_groups(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE agent_escalation_reasons
            ADD COLUMN groups JSONB NOT NULL DEFAULT '[]'::jsonb;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _channel_user_staff_note(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE channel_users
            ADD COLUMN staff_note TEXT;
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _message_group_sender(conn):
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE messages ADD COLUMN sender_name VARCHAR(100);
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE messages ADD COLUMN sender_phone VARCHAR(32);
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _silence(conn):
    for statement in (
        "ALTER TABLE agents ADD COLUMN phone_silence_minutes INTEGER",
        "ALTER TABLE conversations ADD COLUMN owner_silence_until TIMESTAMP",
        "ALTER TABLE conversations ADD COLUMN owner_silence_forever BOOLEAN NOT NULL DEFAULT FALSE",
    ):
        conn.execute(text(f"""
            DO $$ BEGIN
                {statement};
            EXCEPTION
                WHEN duplicate_column THEN null;
            END $$;
        """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS blocked_numbers (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            phone VARCHAR(20) NOT NULL,
            CONSTRAINT uq_blocked_agent_phone UNIQUE (agent_id, phone)
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_blocked_numbers_agent ON blocked_numbers(agent_id)
    """))
    conn.execute(text("DROP TABLE IF EXISTS saved_contacts"))
    conn.execute(text("ALTER TABLE agents DROP COLUMN IF EXISTS skip_saved_contacts"))
    conn.execute(text("ALTER TABLE agent_channels DROP COLUMN IF EXISTS contacts_synced_at"))


def _add_column(conn, statement: str):
    conn.execute(text(f"""
        DO $$ BEGIN
            {statement};
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def _campaigns(conn):
    for statement in (
        "ALTER TABLE agents ADD COLUMN campaigns_enabled BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE agents ADD COLUMN campaign_hourly_cap INTEGER",
        "ALTER TABLE agents ADD COLUMN campaign_daily_cap INTEGER",
        "ALTER TABLE agents ADD COLUMN campaign_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jerusalem'",
        "ALTER TABLE agents ADD COLUMN campaign_system_prompt TEXT",
        "ALTER TABLE conversations ADD COLUMN campaign_pending BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE blocked_numbers ADD COLUMN manual BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE blocked_numbers ADD COLUMN opted_out BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE blocked_numbers ADD COLUMN quote TEXT",
        "ALTER TABLE blocked_numbers ADD COLUMN created_at TIMESTAMP",
        "ALTER TABLE blocked_numbers ADD COLUMN opted_out_at TIMESTAMP",
    ):
        _add_column(conn, statement)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL,
            description TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            pause_reason VARCHAR(40),
            mode VARCHAR(20) NOT NULL DEFAULT 'template',
            template_body TEXT,
            prompt TEXT,
            column_defaults JSONB,
            rephrase_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            writer_model VARCHAR(50) NOT NULL DEFAULT 'gemini-3.8-flash',
            rephrase_model VARCHAR(50) NOT NULL DEFAULT 'gemini-3.8-flash',
            media_kind VARCHAR(20),
            media_key TEXT,
            media_mime VARCHAR(80),
            media_name VARCHAR(200),
            media_description TEXT,
            window_start VARCHAR(5),
            window_end VARCHAR(5),
            timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jerusalem',
            skip_recent_amount INTEGER,
            skip_recent_unit VARCHAR(10),
            recipient_count INTEGER NOT NULL DEFAULT 0,
            step_sent_count INTEGER NOT NULL DEFAULT 0,
            replied_count INTEGER NOT NULL DEFAULT 0,
            delivered_count INTEGER NOT NULL DEFAULT 0,
            current_step INTEGER NOT NULL DEFAULT 1,
            starts_at TIMESTAMP,
            hourly_cap INTEGER,
            daily_cap INTEGER,
            reply_window_amount INTEGER NOT NULL DEFAULT 7,
            reply_window_unit VARCHAR(10) NOT NULL DEFAULT 'days',
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """))
    _add_column(conn, "ALTER TABLE campaigns ADD COLUMN starts_at TIMESTAMP")
    _add_column(conn, "ALTER TABLE campaigns ADD COLUMN hourly_cap INTEGER")
    _add_column(conn, "ALTER TABLE campaigns ADD COLUMN daily_cap INTEGER")
    _add_column(conn, "ALTER TABLE campaigns ADD COLUMN reply_window_amount INTEGER NOT NULL DEFAULT 7")
    _add_column(conn, "ALTER TABLE campaigns ADD COLUMN reply_window_unit VARCHAR(10) NOT NULL DEFAULT 'days'")
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS campaign_steps (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            delay_minutes INTEGER NOT NULL DEFAULT 0,
            template_body TEXT,
            prompt TEXT,
            CONSTRAINT uq_campaign_step UNIQUE (campaign_id, position)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS campaign_recipients (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            phone VARCHAR(20) NOT NULL,
            fields JSONB,
            sort_order INTEGER NOT NULL DEFAULT 0,
            replied_at TIMESTAMP,
            CONSTRAINT uq_campaign_recipient_phone UNIQUE (campaign_id, phone)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS campaign_sends (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            recipient_id INTEGER NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
            step_position INTEGER NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            delivery VARCHAR(20),
            next_send_at TIMESTAMP,
            locked_until TIMESTAMP,
            hold_since TIMESTAMP,
            provider_msg_id VARCHAR(80),
            http_status INTEGER,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            channel_id INTEGER,
            fail_reason VARCHAR(200),
            body TEXT,
            sent_at TIMESTAMP,
            CONSTRAINT uq_campaign_send_step UNIQUE (recipient_id, step_position)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS campaign_usage (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            model VARCHAR(50) NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cache_read_tokens INTEGER NOT NULL DEFAULT 0,
            cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT uq_campaign_usage_model UNIQUE (campaign_id, model)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS campaign_imports (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            filename VARCHAR(200) NOT NULL DEFAULT '',
            payload BYTEA,
            phone_column VARCHAR(120),
            status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
            error VARCHAR(200),
            headers JSONB,
            created_at TIMESTAMP
        )
    """))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_campaigns_agent_status ON campaigns(agent_id, status)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_campaign_recipients_campaign ON campaign_recipients(campaign_id)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_campaign_sends_due ON campaign_sends(agent_id, status, next_send_at)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_campaign_sends_msg ON campaign_sends(provider_msg_id)"
    ))


def drop_campaigns(conn):
    """Manual rollback. Not called from run_all."""
    conn.execute(text("DROP TABLE IF EXISTS campaign_imports"))
    conn.execute(text("DROP TABLE IF EXISTS campaign_usage"))
    conn.execute(text("DROP TABLE IF EXISTS campaign_sends"))
    conn.execute(text("DROP TABLE IF EXISTS campaign_recipients"))
    conn.execute(text("DROP TABLE IF EXISTS campaign_steps"))
    conn.execute(text("DROP TABLE IF EXISTS campaigns"))
    for statement in (
        "ALTER TABLE agents DROP COLUMN IF EXISTS campaigns_enabled",
        "ALTER TABLE agents DROP COLUMN IF EXISTS campaign_hourly_cap",
        "ALTER TABLE agents DROP COLUMN IF EXISTS campaign_daily_cap",
        "ALTER TABLE agents DROP COLUMN IF EXISTS campaign_timezone",
        "ALTER TABLE campaigns DROP COLUMN IF EXISTS starts_at",
        "ALTER TABLE campaigns DROP COLUMN IF EXISTS hourly_cap",
        "ALTER TABLE campaigns DROP COLUMN IF EXISTS daily_cap",
        "ALTER TABLE campaigns DROP COLUMN IF EXISTS reply_window_amount",
        "ALTER TABLE campaigns DROP COLUMN IF EXISTS reply_window_unit",
        "ALTER TABLE conversations DROP COLUMN IF EXISTS campaign_pending",
        "ALTER TABLE blocked_numbers DROP COLUMN IF EXISTS manual",
        "ALTER TABLE blocked_numbers DROP COLUMN IF EXISTS opted_out",
        "ALTER TABLE blocked_numbers DROP COLUMN IF EXISTS quote",
        "ALTER TABLE blocked_numbers DROP COLUMN IF EXISTS created_at",
        "ALTER TABLE blocked_numbers DROP COLUMN IF EXISTS opted_out_at",
    ):
        conn.execute(text(statement))

