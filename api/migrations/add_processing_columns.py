"""One-shot Neon/PostgreSQL migration: add extracted_text and processing_error columns.

Run once from the project root:
    .venv\\Scripts\\python.exe -m api.migrations.add_processing_columns

Uses IF NOT EXISTS so it is safe to run multiple times.
"""

import sys
from sqlalchemy import text

from api.database import engine

_SQL = text("""
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS extracted_text TEXT,
    ADD COLUMN IF NOT EXISTS processing_error TEXT;
""")


def run() -> None:
    with engine.connect() as conn:
        conn.execute(_SQL)
        conn.commit()
    print("Migration complete: extracted_text, processing_error columns ensured on documents table.")


if __name__ == "__main__":
    run()
    sys.exit(0)
