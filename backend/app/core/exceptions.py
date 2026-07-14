"""Custom domain exceptions for LandScope."""

from __future__ import annotations


class LandScopeError(Exception):
    """Base exception for all LandScope domain errors."""


class ParcelNotFoundError(LandScopeError):
    """Raised when a requested parcel does not exist."""


class InvalidGeometryError(LandScopeError):
    """Raised when a geometry is invalid or cannot be repaired."""


class ConstraintValidationError(LandScopeError):
    """Raised when a constraint configuration is invalid (e.g. bad buffer)."""


class DatasetNotReadyError(LandScopeError):
    """Raised when a required dataset is not loaded/ready for analysis."""


class AnalysisError(LandScopeError):
    """Raised when the analysis pipeline fails for an unexpected reason."""
