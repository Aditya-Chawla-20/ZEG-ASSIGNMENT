-- Saved analysis results for LandScope
-- Allows users to save and revisit analysis configurations and results

CREATE TABLE IF NOT EXISTS ls_saved_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id       text NOT NULL,
  parcel_name     text NOT NULL,
  settings         jsonb NOT NULL,    -- constraint config snapshot
  summary          jsonb NOT NULL,    -- analysis summary
  breakdown        jsonb NOT NULL,    -- breakdown array
  geometry         jsonb,             -- analysis geometry (can be large)
  warnings         jsonb DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ls_sa_parcel_idx    ON ls_saved_analyses (parcel_id);
CREATE INDEX IF NOT EXISTS ls_sa_created_idx   ON ls_saved_analyses (created_at DESC);

ALTER TABLE ls_saved_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_saved_analyses" ON ls_saved_analyses;
CREATE POLICY "anon_select_saved_analyses" ON ls_saved_analyses
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_saved_analyses" ON ls_saved_analyses;
CREATE POLICY "anon_insert_saved_analyses" ON ls_saved_analyses
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_saved_analyses" ON ls_saved_analyses;
CREATE POLICY "anon_delete_saved_analyses" ON ls_saved_analyses
  FOR DELETE TO anon, authenticated USING (true);
