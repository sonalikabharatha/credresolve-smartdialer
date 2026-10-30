const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const dbFile = process.env.DB_FILE || "./data/smartdialer.db";
const absolute = path.resolve(dbFile);
fs.mkdirSync(path.dirname(absolute), { recursive: true });

const db = new Database(absolute);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK(state IN ('OFFLINE','AVAILABLE','RESERVED','DIALING','CONNECTED','WRAP_UP','PAUSED')),
  current_call_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS borrowers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK(status IN ('QUEUED','RESERVED','CALLED','COMPLETED','SKIPPED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrower_id INTEGER NOT NULL REFERENCES borrowers(id),
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK(status IN ('RESERVED','INITIATED','RINGING','ANSWERED','CONNECTED','COMPLETED','FAILED','CANCELLED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_call_id TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_call_per_agent
ON calls(agent_id) WHERE status IN ('RESERVED','INITIATED','RINGING','ANSWERED','CONNECTED');
CREATE TABLE IF NOT EXISTS provider_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  call_id INTEGER NOT NULL REFERENCES calls(id),
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
