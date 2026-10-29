const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS regions (id TEXT PRIMARY KEY, name TEXT, status TEXT, config TEXT);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, region_id TEXT, kind TEXT CHECK(kind IN ('business','person')),
  name TEXT, phone TEXT, email TEXT, plan TEXT DEFAULT 'free', lat REAL, lng REAL, address TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY, region_id TEXT, name TEXT, phone TEXT, vehicle TEXT,
  tier TEXT DEFAULT 'standard', pro_until INTEGER DEFAULT 0, status TEXT DEFAULT 'offline',
  lat REAL, lng REAL, last_ping INTEGER, pin_lat REAL, pin_lng REAL, pin_at INTEGER,
  rating REAL DEFAULT 5, created_at INTEGER);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, region_id TEXT NOT NULL, account_id INTEGER, idem_key TEXT UNIQUE,
  status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  service_date TEXT, vehicle_class TEXT, weight_kg REAL, category TEXT, declared_cents INTEGER DEFAULT 0,
  pickup_name TEXT, pickup_phone TEXT, pickup_addr TEXT, pickup_lat REAL, pickup_lng REAL,
  drop_name TEXT, drop_phone TEXT, drop_addr TEXT, drop_lat REAL, drop_lng REAL, drop_zone TEXT, drop_outer INTEGER DEFAULT 0,
  drop_confirmed INTEGER DEFAULT 0, cap_cents INTEGER, price_cents INTEGER,
  token_hash TEXT, token_expires INTEGER, code_hash TEXT, code_attempts INTEGER DEFAULT 0,
  run_id INTEGER, seq INTEGER, eta_mid INTEGER, fail_reason TEXT, created_at INTEGER, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(region_id, status, service_date);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, region_id TEXT, service_date TEXT, vehicle_class TEXT, status TEXT,
  driver_id INTEGER, vehicle TEXT, km REAL, minutes INTEGER, revenue_cents INTEGER, payout_cents INTEGER,
  take_cents INTEGER, bonus_cents INTEGER DEFAULT 0, route TEXT, created_at INTEGER, accepted_at INTEGER, version INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, at INTEGER, region_id TEXT, entity TEXT, entity_id INTEGER, type TEXT, actor TEXT, data TEXT);
CREATE INDEX IF NOT EXISTS ix_events_entity ON events(entity, entity_id);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY, txn TEXT NOT NULL, at INTEGER, region_id TEXT, account TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, ref TEXT, memo TEXT);
CREATE INDEX IF NOT EXISTS ix_ledger_account ON ledger(account);
CREATE TABLE IF NOT EXISTS pings (id INTEGER PRIMARY KEY, driver_id INTEGER, at INTEGER, lat REAL, lng REAL);
CREATE TABLE IF NOT EXISTS hotspots (region_id TEXT, cell TEXT, score REAL, lat REAL, lng REAL, at INTEGER, PRIMARY KEY(region_id, cell));
CREATE TABLE IF NOT EXISTS payouts (id INTEGER PRIMARY KEY, driver_id INTEGER, at INTEGER, amount_cents INTEGER, holdback_cents INTEGER, status TEXT);
CREATE TABLE IF NOT EXISTS quote_links (
  id INTEGER PRIMARY KEY, store_id INTEGER, token_hash TEXT NOT NULL UNIQUE, region_id TEXT NOT NULL,
  quote_json TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'shopper', expires_at INTEGER NOT NULL,
  used_at INTEGER, order_id INTEGER, created_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_quote_links_hash ON quote_links(token_hash);
`;

function open(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  require('./auth').initAuth(db);
  require('./notify').initNotify(db);
  return db;
}

/** Run fn inside a transaction. Rolls back on throw. */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

module.exports = { open, tx };
