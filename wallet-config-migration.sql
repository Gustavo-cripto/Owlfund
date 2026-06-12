-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS wallet_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data    jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wallet_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_config_own" ON wallet_config
  FOR ALL USING (auth.uid() = user_id);
