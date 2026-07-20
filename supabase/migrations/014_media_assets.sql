CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  media_kind TEXT NOT NULL DEFAULT 'image' CHECK (media_kind IN ('image')),
  file_size BIGINT,
  storage_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_user_id
  ON media_assets(user_id, created_at DESC);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own media assets" ON media_assets;
CREATE POLICY "Users can manage own media assets"
  ON media_assets
  FOR ALL
  USING (auth.uid() = user_id);
