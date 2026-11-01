CREATE TABLE IF NOT EXISTS sync_accounts (
 owner_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 mutation_id TEXT NOT NULL DEFAULT '',
 updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sync_stocks (
 owner_id TEXT NOT NULL,
 stock_key TEXT NOT NULL,
 data_json TEXT NOT NULL,
 PRIMARY KEY(owner_id,stock_key),
 FOREIGN KEY(owner_id) REFERENCES sync_accounts(owner_id)
);
