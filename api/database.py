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


def init_db():
    """
    Safely initialize and create database tables if they do not exist.
    Will not drop or overwrite existing tables or data.
    """
    import api.models  # noqa: F401
    Base.metadata.create_all(bind=engine)