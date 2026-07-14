"""Verify database connection and table existence.

Usage:
    python -m scripts.check_db
    # or
    python scripts/check_db.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    print(f"Connecting to: {settings.DATABASE_URL}")

    try:
        engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1")).scalar()
            print(f"  [OK] Database connection successful (SELECT 1 returned {result})")

            # Check for PostGIS
            try:
                postgis = conn.execute(text("SELECT PostGIS_Version()")).scalar()
                print(f"  [OK] PostGIS version: {postgis}")
            except Exception as e:
                print(f"  [WARN] PostGIS not available: {e}")

            # Check tables
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            required = ["parcels", "dataset_metadata", "constraint_features"]
            for t in required:
                if t in tables:
                    count = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
                    print(f"  [OK] Table '{t}' exists ({count} rows)")
                else:
                    print(f"  [MISSING] Table '{t}' does not exist")

            # Check geometry indexes
            indexes = inspector.get_indexes("parcels")
            gist_indexes = [i for i in indexes if "gist" in i.get("name", "").lower()]
            print(f"  [INFO] parcels has {len(gist_indexes)} GiST indexes")

        print("\nDatabase check complete.")
    except Exception as e:
        print(f"  [ERROR] Database check failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
