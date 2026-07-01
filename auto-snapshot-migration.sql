-- Run this in Supabase SQL Editor
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_snapshot boolean NOT NULL DEFAULT true;
