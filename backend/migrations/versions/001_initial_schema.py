"""Initial schema: parcels, dataset_metadata, constraint_features.

Creates all three tables with GiST indexes on geometry columns and B-tree
indexes on filterable text columns.

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "001"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # --- parcels ---
    op.create_table(
        "parcels",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("source_id", sa.String, nullable=False),
        sa.Column("county_name", sa.String, nullable=False),
        sa.Column("display_name", sa.String, nullable=False),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("source_area_acres", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("geometry", Geometry("MULTIPOLYGON", srid=32614), nullable=False),
        sa.Column("geometry_wgs84", Geometry("MULTIPOLYGON", srid=4326), nullable=False),
        sa.Column("centroid_wgs84", Geometry("POINT", srid=4326), nullable=False),
        sa.Column("properties", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("now()")),
        sa.UniqueConstraint("source_id", name="uq_parcels_source_id"),
    )

    op.create_index("ix_parcels_source_id", "parcels", ["source_id"])
    op.create_index("ix_parcels_county_name", "parcels", ["county_name"])
    op.create_index(
        "ix_parcels_geometry_gist",
        "parcels",
        ["geometry"],
        postgresql_using="gist",
    )
    op.create_index(
        "ix_parcels_geometry_wgs84_gist",
        "parcels",
        ["geometry_wgs84"],
        postgresql_using="gist",
    )
    op.create_index(
        "ix_parcels_centroid_wgs84_gist",
        "parcels",
        ["centroid_wgs84"],
        postgresql_using="gist",
    )

    # --- dataset_metadata ---
    op.create_table(
        "dataset_metadata",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("provider", sa.String, nullable=False),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.Column("licence", sa.Text, nullable=False),
        sa.Column("retrieved_at", sa.DateTime, nullable=True),
        sa.Column("source_version", sa.String, nullable=True),
        sa.Column("analysis_crs", sa.String, nullable=False),
        sa.Column("feature_count", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("now()")),
    )

    # --- constraint_features ---
    op.create_table(
        "constraint_features",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "dataset_id",
            UUID(as_uuid=True),
            sa.ForeignKey("dataset_metadata.id"),
            nullable=False,
        ),
        sa.Column("layer_type", sa.String, nullable=False),
        sa.Column("source_id", sa.String, nullable=True),
        sa.Column("classification", sa.String, nullable=True),
        sa.Column("geometry", Geometry("GEOMETRY", srid=32614), nullable=False),
        sa.Column("properties", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("now()")),
    )

    op.create_index("ix_constraint_features_dataset_id", "constraint_features", ["dataset_id"])
    op.create_index("ix_constraint_features_layer_type", "constraint_features", ["layer_type"])
    op.create_index("ix_constraint_features_classification", "constraint_features", ["classification"])
    op.create_index(
        "ix_constraint_features_geometry_gist",
        "constraint_features",
        ["geometry"],
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("ix_constraint_features_geometry_gist", table_name="constraint_features")
    op.drop_index("ix_constraint_features_classification", table_name="constraint_features")
    op.drop_index("ix_constraint_features_layer_type", table_name="constraint_features")
    op.drop_index("ix_constraint_features_dataset_id", table_name="constraint_features")
    op.drop_table("constraint_features")

    op.drop_table("dataset_metadata")

    op.drop_index("ix_parcels_centroid_wgs84_gist", table_name="parcels")
    op.drop_index("ix_parcels_geometry_wgs84_gist", table_name="parcels")
    op.drop_index("ix_parcels_geometry_gist", table_name="parcels")
    op.drop_index("ix_parcels_county_name", table_name="parcels")
    op.drop_index("ix_parcels_source_id", table_name="parcels")
    op.drop_table("parcels")
