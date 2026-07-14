import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.core.config import get_settings
from scripts.ingest_real_data import ingest_wetlands

settings = get_settings()
engine = create_engine(settings.DATABASE_URL)
with Session(engine) as session:
    with session.begin():
        ingest_wetlands(session)
print("Wetlands-only ingestion finished!")
