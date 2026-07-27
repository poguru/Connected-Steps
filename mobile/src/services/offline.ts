/**
 * Offline service — SQLite-backed sync queue and wallet cache.
 *
 * Sync queue: volunteer scan operations recorded while offline are queued
 * here and replayed in FIFO order when connectivity returns.
 *
 * Wallet cache: participant QR metadata stored for offline display.
 */

import * as SQLite from "expo-sqlite";
import type { SyncQueueItem } from "../types";

// ── Database singleton ────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync("cs_offline.db");
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sync_queue (
      id               TEXT PRIMARY KEY,
      endpoint         TEXT NOT NULL,
      method           TEXT NOT NULL DEFAULT 'POST',
      body             TEXT NOT NULL,
      created_at       INTEGER NOT NULL,
      retry_count      INTEGER NOT NULL DEFAULT 0,
      last_error       TEXT,
      idempotency_key  TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS wallet_cache (
      registration_code TEXT PRIMARY KEY,
      event_id          TEXT NOT NULL,
      event_title       TEXT,
      event_date        TEXT,
      qr_token          TEXT NOT NULL,
      bib_number        TEXT,
      category          TEXT,
      status            TEXT,
      qr_local_path     TEXT,
      cached_at         INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_log (
      id             TEXT PRIMARY KEY,
      event_id       TEXT NOT NULL,
      service        TEXT NOT NULL,
      qr_token       TEXT NOT NULL,
      participant_id TEXT,
      participant_name TEXT,
      result         TEXT NOT NULL,
      synced         INTEGER NOT NULL DEFAULT 0,
      scanned_at     INTEGER NOT NULL,
      synced_at      INTEGER
    );
  `);
  return _db;
}

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function enqueue(item: {
  id:              string;
  endpoint:        string;
  method?:         string;
  body:            Record<string, unknown>;
  idempotency_key: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO sync_queue
       (id, endpoint, method, body, created_at, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.endpoint,
      item.method ?? "POST",
      JSON.stringify(item.body),
      Date.now(),
      item.idempotency_key,
    ],
  );
}

export async function getPendingQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<SyncQueueItem>(
    `SELECT * FROM sync_queue ORDER BY created_at ASC`,
  );
}

export async function getPendingCount(): Promise<number> {
  const db   = await getDb();
  const row  = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sync_queue`,
  );
  return row?.n ?? 0;
}

export async function markSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

export async function incrementRetry(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
    [error, id],
  );
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

// ── Wallet cache ──────────────────────────────────────────────────────────────

export interface WalletItem {
  registration_code: string;
  event_id:          string;
  event_title:       string;
  event_date:        string;
  qr_token:          string;
  bib_number:        string | null;
  category:          string;
  status:            string;
  qr_local_path:     string | null;
  cached_at:         number;
}

export async function saveWalletItem(item: WalletItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO wallet_cache
       (registration_code, event_id, event_title, event_date, qr_token,
        bib_number, category, status, qr_local_path, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.registration_code, item.event_id, item.event_title, item.event_date,
      item.qr_token, item.bib_number ?? null, item.category, item.status,
      item.qr_local_path ?? null, item.cached_at,
    ],
  );
}

export async function getWalletItems(): Promise<WalletItem[]> {
  const db = await getDb();
  return db.getAllAsync<WalletItem>(
    `SELECT * FROM wallet_cache ORDER BY event_date DESC`,
  );
}

export async function updateQrLocalPath(registration_code: string, path: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE wallet_cache SET qr_local_path = ? WHERE registration_code = ?`,
    [path, registration_code],
  );
}

export async function clearWalletCache(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM wallet_cache`);
}

// ── Scan log ──────────────────────────────────────────────────────────────────

export async function writeScanLog(entry: {
  id:               string;
  event_id:         string;
  service:          string;
  qr_token:         string;
  participant_id?:  string;
  participant_name?:string;
  result:           string;
  synced:           boolean;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO scan_log
       (id, event_id, service, qr_token, participant_id, participant_name, result, synced, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id, entry.event_id, entry.service, entry.qr_token,
      entry.participant_id ?? null, entry.participant_name ?? null,
      entry.result, entry.synced ? 1 : 0, Date.now(),
    ],
  );
}

export async function markScanSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE scan_log SET synced = 1, synced_at = ? WHERE id = ?`,
    [Date.now(), id],
  );
}
