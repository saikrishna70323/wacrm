CREATE TABLE IF NOT EXISTS faq_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  answer TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_entries_user_id ON faq_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_faq_entries_active ON faq_entries(user_id, is_active);

ALTER TABLE faq_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own faq entries" ON faq_entries;
CREATE POLICY "Users can manage own faq entries" ON faq_entries FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON faq_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON faq_entries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
