CREATE TABLE IF NOT EXISTS entries (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS picks (
  id                SERIAL PRIMARY KEY,
  entry_id          TEXT NOT NULL REFERENCES entries(id),
  week              INTEGER NOT NULL,
  team              TEXT NOT NULL,
  win_prob_at_pick  DOUBLE PRECISION,
  picked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, team),
  UNIQUE (entry_id, week)
);

-- Latest win probability captured while the picked game was still upcoming
-- (refreshed on every stats refresh, then frozen once the game kicks off).
ALTER TABLE picks ADD COLUMN IF NOT EXISTS win_prob_pregame DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS cache (
  key        TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE entries ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS pick_overrides (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  week     INTEGER NOT NULL,
  outcome  TEXT NOT NULL CHECK (outcome IN ('survived', 'out', 'revived')),
  PRIMARY KEY (entry_id, week)
);

-- Widen the outcome check on tables created before 'revived' existed.
ALTER TABLE pick_overrides DROP CONSTRAINT IF EXISTS pick_overrides_outcome_check;
ALTER TABLE pick_overrides ADD CONSTRAINT pick_overrides_outcome_check
  CHECK (outcome IN ('survived', 'out', 'revived'));

INSERT INTO entries (id, name) VALUES
  ('jon','Jon'), ('genevieve','Genevieve'), ('elliot','Elliot')
ON CONFLICT (id) DO NOTHING;
