"""Dataset metadata model.

Records provenance for each constraint dataset (wetlands, floodplain,
transmission) so analyses can cite the exact source used.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class DatasetMetadata(Base):
    __tablename__ = "dataset_metadata"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    source_url = Column(Text, nullable=False)
    licence = Column(Text, nullable=False)
    retrieved_at = Column(DateTime, nullable=True)
    source_version = Column(String, nullable=True)
    analysis_crs = Column(String, nullable=False)
    feature_count = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DatasetMetadata {self.name} ({self.provider})>"
