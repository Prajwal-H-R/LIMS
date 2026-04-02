# backend/db.py

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.core.config import settings


# 👇 Get database URL from .env via config.py
engine = create_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()


# Dependency for FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
