from sqlalchemy import text

from api.database import engine


def test_connection():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        print("Neon PostgreSQL connection successful:", result.scalar())


if __name__ == "__main__":
    test_connection()