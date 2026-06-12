-- Tabela para rastrear uso mensal de chats por utilizador (plano Free: limite 5/mês)
CREATE TABLE IF NOT EXISTS chat_usage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month       text NOT NULL, -- formato: "YYYY-MM"
  count       integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

-- RLS: cada utilizador só vê/escreve os seus próprios registos
ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_usage_own" ON chat_usage
  FOR ALL USING (auth.uid() = user_id);

-- Service role tem acesso total (bypass RLS)
CREATE POLICY "chat_usage_service" ON chat_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);
