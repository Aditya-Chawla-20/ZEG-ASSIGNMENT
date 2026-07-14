"""Dataset metadata endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.repositories.constraint_repository import ConstraintRepository

router = APIRouter()


class DatasetMetadataResponse(BaseModel):
    """Dataset metadata response schema."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    provider: str
    source_url: str = Field(alias="sourceUrl")
    licence: str
    retrieved_at: str | None = Field(alias="retrievedAt", default=None)
    source_version: str | None = Field(alias="sourceVersion", default=None)
    analysis_crs: str = Field(alias="analysisCrs")
    feature_count: int | None = Field(alias="featureCount", default=None)
    notes: str | None = None


@router.get("/datasets", response_model=list[DatasetMetadataResponse])
async def list_datasets(db: Session = Depends(get_db)) -> list[DatasetMetadataResponse]:
    """Return all dataset metadata records."""
    repo = ConstraintRepository(db)
    datasets = repo.get_datasets()

    results: list[DatasetMetadataResponse] = []
    for ds in datasets:
        results.append(
            DatasetMetadataResponse(
                id=str(ds.id),
                name=ds.name,
                provider=ds.provider,
                source_url=ds.source_url,
                licence=ds.licence,
                retrieved_at=ds.retrieved_at.isoformat() if ds.retrieved_at else None,
                source_version=ds.source_version,
                analysis_crs=ds.analysis_crs,
                feature_count=ds.feature_count,
                notes=ds.notes,
            )
        )
    return results
