"""Backfill script: migrate existing WaSender agents to agent_channels model.

Run this ONCE after deploying Phase 1 migrations, BEFORE deploying Phase 2 code.

Steps:
  A. Create agent_channels rows for each WaSender agent
  B. Create channel_users rows for each existing user with WaSender conversations
  C. Update conversations with channel_id, channel_user_id, channel_type_snapshot

Usage:
    cd /path/to/whatsappagent
    python -m backend.scripts.backfill_wasender_channels [--dry-run]

Always run with --dry-run first to verify counts.
CREDENTIALS_ENCRYPTION_KEY must be set in environment.
"""
import argparse
import sys
import os

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import text

from backend.core.database import SessionLocal
from backend.core.encryption import encrypt_credentials


def run_backfill(dry_run: bool = True):
    db = SessionLocal()
    try:
        # ── Step A: agent_channels for WaSender agents ────────────────────────
        wasender_agents = db.execute(text("""
            SELECT id, provider_config, is_active
            FROM agents
            WHERE provider = 'wasender'
        """)).fetchall()

        print(f"Found {len(wasender_agents)} WaSender agents")

        created_channels = 0
        for agent in wasender_agents:
            config = agent.provider_config or {}
            session = config.get("session", "default")
            # external_account_id must be globally unique per channel_type;
            # multiple agents may share the same session label, so use agent id.
            external_account_id = f"agent_{agent.id}"

            exists = db.execute(text("""
                SELECT id FROM agent_channels
                WHERE agent_id = :agent_id AND channel_type = 'whatsapp_wasender'
            """), {"agent_id": agent.id}).scalar()

            if exists:
                print(f"  Agent {agent.id}: channel already exists (id={exists}), skipping")
                continue

            if not dry_run:
                encrypted = encrypt_credentials({
                    "api_key": config.get("api_key", ""),
                    "session": session,
                    "webhook_secret": config.get("webhook_secret", ""),
                })
                db.execute(text("""
                    INSERT INTO agent_channels
                        (agent_id, channel_type, external_account_id, account_name,
                         credentials_encrypted, is_active, health_status)
                    VALUES
                        (:agent_id, 'whatsapp_wasender', :ext_id, :name,
                         :creds, :is_active, 'unknown')
                """), {
                    "agent_id": agent.id,
                    "ext_id": external_account_id,
                    "name": session,
                    "creds": encrypted,
                    "is_active": agent.is_active,
                })
                created_channels += 1
                print(f"  Agent {agent.id}: created channel (session={session})")
            else:
                print(f"  [DRY RUN] Agent {agent.id}: would create channel (session={session})")
                created_channels += 1

        if not dry_run:
            db.commit()
        print(f"\nStep A: {created_channels} channels {'created' if not dry_run else 'would be created'}")

        # ── Step B: channel_users for existing conversation users ─────────────
        user_rows = db.execute(text("""
            SELECT DISTINCT u.phone, u.name, ac.id as channel_id
            FROM users u
            JOIN conversations c ON c.user_id = u.id
            JOIN agents a ON c.agent_id = a.id
            JOIN agent_channels ac ON ac.agent_id = a.id AND ac.channel_type = 'whatsapp_wasender'
            WHERE c.channel_id IS NULL
        """)).fetchall()

        print(f"\nStep B: Found {len(user_rows)} unique user+channel pairs to create")

        if not dry_run and user_rows:
            for row in user_rows:
                db.execute(text("""
                    INSERT INTO channel_users (channel_id, external_id, display_name)
                    VALUES (:channel_id, :external_id, :display_name)
                    ON CONFLICT (channel_id, external_id) DO NOTHING
                """), {
                    "channel_id": row.channel_id,
                    "external_id": row.phone,
                    "display_name": row.name,
                })
            db.commit()
            print(f"  Created/skipped {len(user_rows)} channel_user rows")

        # ── Step C: update conversations ──────────────────────────────────────
        to_update = db.execute(text("""
            SELECT c.id as conv_id, ac.id as channel_id, cu.id as channel_user_id
            FROM conversations c
            JOIN agents a ON c.agent_id = a.id
            JOIN agent_channels ac ON ac.agent_id = a.id AND ac.channel_type = 'whatsapp_wasender'
            LEFT JOIN users u ON u.id = c.user_id
            LEFT JOIN channel_users cu ON cu.channel_id = ac.id AND cu.external_id = u.phone
            WHERE c.channel_id IS NULL
        """)).fetchall()

        print(f"\nStep C: {len(to_update)} conversations to update")

        if not dry_run and to_update:
            for row in to_update:
                db.execute(text("""
                    UPDATE conversations
                    SET channel_id = :channel_id,
                        channel_user_id = :channel_user_id,
                        channel_type_snapshot = 'whatsapp_wasender'
                    WHERE id = :conv_id
                """), {
                    "channel_id": row.channel_id,
                    "channel_user_id": row.channel_user_id,
                    "conv_id": row.conv_id,
                })
            db.commit()
            print(f"  Updated {len(to_update)} conversations")

        # ── Verification ──────────────────────────────────────────────────────
        if not dry_run:
            unlinked = db.execute(text(
                "SELECT COUNT(*) FROM conversations WHERE channel_id IS NULL"
            )).scalar()
            print(f"\nVerification: conversations with channel_id IS NULL = {unlinked}")
            if unlinked == 0:
                print("✓ All conversations linked to a channel")
            else:
                print(f"⚠ {unlinked} conversations still unlinked (may be agents with provider != 'wasender')")

        print("\nBackfill complete!" if not dry_run else "\nDry run complete. Rerun without --dry-run to apply.")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill WaSender agents to agent_channels model")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Preview without making changes")
    parser.add_argument("--apply", action="store_true", help="Actually apply changes")
    args = parser.parse_args()

    dry_run = not args.apply
    if dry_run:
        print("=== DRY RUN MODE (use --apply to make changes) ===\n")
    else:
        print("=== APPLYING CHANGES ===\n")

    run_backfill(dry_run=dry_run)
