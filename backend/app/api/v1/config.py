"""Constraint configuration endpoint.

Returns the frontend-facing configuration for constraint layers: supported
classifications, default buffers, min/max buffers, and priority order.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()


@router.get("/config/constraints")
async def get_constraint_config() -> dict:
    """Return constraint configuration for the frontend."""
    settings = get_settings()
    return {
        "constraints": [
            {
                "type": "wetlands",
                "label": "Wetlands",
                "defaultBufferMeters": 30,
                "minBuffer": 0,
                "maxBuffer": 5000,
                "defaultEnabled": True,
                "supportedClassifications": [],
            },
            {
                "type": "floodplain",
                "label": "FEMA Flood Hazard",
                "defaultBufferMeters": 0,
                "minBuffer": 0,
                "maxBuffer": 1000,
                "defaultEnabled": True,
                "supportedClassifications": [
                    "A",
                    "AE",
                    "AH",
                    "AO",
                    "VE",
                    "X",
                    "X500",
                ],
            },
            {
                "type": "transmission",
                "label": "Transmission Lines",
                "defaultBufferMeters": 30,
                "minBuffer": 0,
                "maxBuffer": 500,
                "defaultEnabled": True,
                "supportedClassifications": [],
            },
        ],
        "priorityOrder": settings.CONSTRAINT_PRIORITY,
        "analysisCrs": settings.ANALYSIS_CRS,
        "analysisCrsDescription": "UTM Zone 14N - appropriate for Brazos County, Texas",
    }
