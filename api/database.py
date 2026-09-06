import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")


if not DATABASE_URL:
    raise ValueError(
        "DATABASE_URL is not set. "
        "Please add your Neon PostgreSQL connection string to the .env file."
    )


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    pass


def get_db():
    """
    FastAPI database dependency.

    Creates one database session per request and closes it afterwards.
    """

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """
    Safely execute non-destructive schema migrations on existing database tables.
    Adds missing columns without dropping or overwriting existing data.
    """
    try:
        with engine.begin() as conn:
            dialect = engine.dialect.name
            if dialect == "postgresql":
                conn.execute(text("ALTER TABLE relationships ADD COLUMN IF NOT EXISTS evidence_snippet TEXT;"))
                conn.execute(text("ALTER TABLE relationships ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;"))
            elif dialect == "sqlite":
                res = conn.execute(text("PRAGMA table_info(relationships)")).fetchall()
                col_names = [r[1] for r in res]
                if "evidence_snippet" not in col_names:
                    conn.execute(text("ALTER TABLE relationships ADD COLUMN evidence_snippet TEXT;"))
                if "source_document_id" not in col_names:
                    conn.execute(text("ALTER TABLE relationships ADD COLUMN source_document_id CHAR(36);"))
    except Exception as exc:
        print(f"Database schema migration note: {exc}")


def init_db():
    """
    Safely initialize and create database tables if they do not exist.
    Also executes safe non-destructive migrations for existing tables.
    Will not drop or overwrite existing tables or data.
    """
    import api.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    run_migrations()