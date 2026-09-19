"""Delete every WaSender session (provider + our rows). Conversations stay.

Run on the Render shell after deploy:
  python -m backend.scripts.wipe_wasender --yes
"""
import argparse
import asyncio
import sys

from backend.core.database import SessionLocal
from backend.services.wasender.purge import wipe_all


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="required")
    args = parser.parse_args()
    if not args.yes:
        print("refusing without --yes")
        sys.exit(2)
    db = SessionLocal()
    try:
        result = asyncio.run(wipe_all(db))
        print(f"deleted remote={result['remote']} local={result['local']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
