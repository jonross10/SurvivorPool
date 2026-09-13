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

CREATE TABLE IF NOT EXISTS cache (
  key        TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO entries (id, name) VALUES
  ('jon','Jon'), ('genevieve','Genevieve'), ('elliot','Elliot')
ON CONFLICT (id) DO NOTHING;
