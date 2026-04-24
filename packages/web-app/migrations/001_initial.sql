-- 001_initial.sql — copilot conversation memory.
--
-- Runs against libSQL / Turso (SQLite dialect). Keep it compatible with both
-- local `file:./data/copilot.db` and remote `libsql://...` URLs so dev and
-- prod are byte-identical.
--
-- `customer_id` is carried on every row so the table shape is ready for
-- multi-tenant scoping without a future migration. For single-customer
-- deployments, callers pass a constant (SF_CUSTOMER_ID env) for every row.

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_format TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);
CREATE INDEX IF NOT EXISTS idx_convos_tenant_activity
  ON conversations(customer_id, user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(customer_id);

-- Per-user daily turn counter. Rolls nightly via retention job (Phase 2).
-- Keeps the cost-cap enforcement in SQL rather than in-memory so horizontal
-- Vercel functions share a consistent view.
CREATE TABLE IF NOT EXISTS usage_daily (
  customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL, -- YYYY-MM-DD in UTC
  turn_count INTEGER NOT NULL DEFAULT 0,
  cost_usd_micros INTEGER NOT NULL DEFAULT 0, -- store cost as integer micros to avoid float drift
  PRIMARY KEY (customer_id, user_id, day)
);
