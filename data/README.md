# LandScope Data Directory

## Structure
- `demo/` — Synthetic demo data clearly labeled as NOT from official sources
- `raw/` — (gitignored) Downloaded raw data files

## Demo Data
The `demo/` directory contains synthetic geometries created for testing and evaluation.
These are NOT official data from TNRIS, USFWS, FEMA, or HIFLD.
They are clearly labeled as synthetic in all metadata records.

## Loading Data
Run `make bootstrap` or `make seed` to load demo data into the database.

## Real Data Sources
See docs/DATA_SOURCES.md for official data sources and download instructions.

## .gitignore
Raw data files (*.zip, *.shp, *.geojson > 1MB) are gitignored to avoid
committing large datasets.
