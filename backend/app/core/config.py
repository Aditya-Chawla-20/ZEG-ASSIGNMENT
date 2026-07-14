"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """LandScope application settings.

    All values can be overridden via environment variables (case-insensitive).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Database -----------------------------------------------------------
    DATABASE_URL: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:5432/landscope",
        description="Sync SQLAlchemy database URL (psycopg2).",
    )

    # --- Coordinate reference systems ---------------------------------------
    ANALYSIS_CRS: str = "EPSG:3857"
    ANALYSIS_CRS_EPSG: int = 3857
    WGS84_CRS: str = "EPSG:4326"
    WGS84_EPSG: int = 4326

    # --- Demo data ----------------------------------------------------------
    DEMO_COUNTY: str = "Brazos"
    DEMO_COUNTY_FIPS: str = "041"

    # --- CORS / logging -----------------------------------------------------
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    LOG_LEVEL: str = "INFO"

    # --- Geometry limits -----------------------------------------------------
    MAX_BUFFER_METERS: float = 5000.0
    MIN_BUFFER_METERS: float = 0.0
    MAX_MANUAL_FEATURES: int = 50
    MAX_COORDINATES_PER_FEATURE: int = 1000
    MAX_PARCEL_SEARCH_LIMIT: int = 100
    DEFAULT_PARCEL_SEARCH_LIMIT: int = 20

    # --- Numerical tolerances ------------------------------------------------
    # 1 cm² — documented sliver removal tolerance.
    SLIVER_TOLERANCE_SQM: float = 0.01
    # 1 m² — area invariant check tolerance.
    AREA_INVARIANT_TOLERANCE_SQM: float = 1.0

    # --- Constraint attribution priority ------------------------------------
    # Ordered unique attribution: each square metre of exclusion is assigned to
    # exactly one constraint in this order so overlaps are not double-counted.
    CONSTRAINT_PRIORITY: list[str] = [
        "wetlands",
        "floodplain",
        "transmission",
        "manual_exclusion",
    ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
