/**
 * Mobile offline sync tests — Phase 2 & 8
 * Tests the SQLite-backed sync queue in mobile/src/services/offline.ts.
 * - Deduplication via idempotency_key (INSERT OR IGNORE)
 * - FIFO order (ORDER BY created_at ASC)
 * - Retry increment
 * - markSynced removes from queue
 * - scan_log writes (writeScanLog, markScanSynced)
 *
 * Uses an in-memory mock of expo-sqlite so tests run in Node without a native runtime.
 */

// ── In-memory SQLite mock ─────────────────────────────────────────────────────

interface Row { [key: string]: unknown }

class MockDatabase {
  private tables: Map<string, Row[]> = new Map();

  // Parse enough SQL to support the small subset used by offline.ts
  async execAsync(sql: string): Promise<void> {
    // CREATE TABLE IF NOT EXISTS — register table
    const createRe = /CREATE TABLE IF NOT EXISTS (\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql)) !== null) {
      if (!this.tables.has(m[1])) this.tables.set(m[1], []);
    }
  }

  async runAsync(sql: string, params: unknown[] = []): Promise<void> {
    const s = sql.trim().replace(/\s+/g, " ");

    // INSERT OR IGNORE INTO table (...) VALUES (...)
    if (/^INSERT OR IGNORE INTO (\w+)/i.test(s)) {
      const table = s.match(/^INSERT OR IGNORE INTO (\w+)/i)![1];
      const rows  = this.tables.get(table) ?? [];

      // Extract column names from the SQL
      const colMatch = s.match(/\(([^)]+)\)\s*VALUES/i);
      if (!colMatch) return;
      const cols = colMatch[1].split(",").map(c => c.trim());
      const row: Row = {};
      cols.forEach((col, i) => { row[col] = params[i] ?? null; });

      // Honour UNIQUE on idempotency_key — ignore if duplicate
      const uniqCol = table === "sync_queue" ? "idempotency_key" :
                      table === "scan_log"   ? "id"              : null;
      if (uniqCol && rows.some(r => r[uniqCol] === row[uniqCol])) return;

      rows.push(row);
      this.tables.set(table, rows);
      return;
    }

    // INSERT OR REPLACE INTO
    if (/^INSERT OR REPLACE INTO (\w+)/i.test(s)) {
      const table = s.match(/^INSERT OR REPLACE INTO (\w+)/i)![1];
      const rows  = this.tables.get(table) ?? [];
      const colMatch = s.match(/\(([^)]+)\)\s*VALUES/i);
      if (!colMatch) return;
      const cols = colMatch[1].split(",").map(c => c.trim());
      const row: Row = {};
      cols.forEach((col, i) => { row[col] = params[i] ?? null; });
      // Replace if PK exists (registration_code)
      const pkCol = "registration_code";
      const idx   = rows.findIndex(r => r[pkCol] === row[pkCol]);
      if (idx >= 0) rows[idx] = row; else rows.push(row);
      this.tables.set(table, rows);
      return;
    }

    // DELETE FROM table WHERE col = ?
    if (/^DELETE FROM (\w+) WHERE (\w+)\s*=\s*\?/i.test(s)) {
      const [, table, col] = s.match(/^DELETE FROM (\w+) WHERE (\w+)\s*=\s*\?/i)!;
      const rows = this.tables.get(table) ?? [];
      this.tables.set(table, rows.filter(r => r[col] !== params[0]));
      return;
    }

    // UPDATE table SET col = col + 1, last_error = ? WHERE id = ?
    if (/^UPDATE (\w+) SET retry_count = retry_count \+ 1/i.test(s)) {
      const table = s.match(/^UPDATE (\w+)/i)![1];
      const rows  = this.tables.get(table) ?? [];
      const id    = params[1];
      rows.forEach(r => {
        if (r["id"] === id) {
          r["retry_count"] = ((r["retry_count"] as number) ?? 0) + 1;
          r["last_error"]  = params[0];
        }
      });
      return;
    }

    // UPDATE scan_log SET synced = 1
    if (/^UPDATE (\w+) SET synced = 1/i.test(s)) {
      const table = s.match(/^UPDATE (\w+)/i)![1];
      const rows  = this.tables.get(table) ?? [];
      const id    = params[1];
      rows.forEach(r => {
        if (r["id"] === id) {
          r["synced"]    = 1;
          r["synced_at"] = params[0];
        }
      });
      return;
    }
  }

  async getAllAsync<T>(sql: string): Promise<T[]> {
    const s = sql.trim();
    const tableMatch = s.match(/FROM (\w+)/i);
    if (!tableMatch) return [];
    const rows = (this.tables.get(tableMatch[1]) ?? []).slice();
    if (/ORDER BY created_at ASC/i.test(s))  rows.sort((a, b) => (a.created_at as number) - (b.created_at as number));
    if (/ORDER BY event_date DESC/i.test(s)) rows.sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
    return rows as T[];
  }

  async getFirstAsync<T>(sql: string): Promise<T | undefined> {
    const s = sql.trim();
    if (/COUNT\(\*\) AS n FROM (\w+)/i.test(s)) {
      const table = s.match(/FROM (\w+)/i)![1];
      return { n: this.tables.get(table)?.length ?? 0 } as T;
    }
    const rows = await this.getAllAsync<T>(s);
    return rows[0];
  }

  _rows(table: string): Row[] { return this.tables.get(table) ?? []; }
}

// ── Mock expo-sqlite ──────────────────────────────────────────────────────────
// { virtual: true } — tells Jest the module doesn't need to be physically present;
// expo-sqlite is a native Expo package installed only in mobile/node_modules after
// `npm install`. The mock intercepts all imports of "expo-sqlite" in offline.ts.

let mockDb: MockDatabase;

jest.mock(
  "expo-sqlite",
  () => ({
    openDatabaseAsync: jest.fn(async () => {
      mockDb = new MockDatabase();
      // Pre-create tables the real DB would create on first open
      await mockDb.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_queue ();
        CREATE TABLE IF NOT EXISTS wallet_cache ();
        CREATE TABLE IF NOT EXISTS scan_log ();
      `);
      return mockDb;
    }),
  }),
  { virtual: true },
);

// ── Import under test (after mock is registered) ─────────────────────────────

// Re-require every test suite so the module-level singleton resets
beforeEach(() => {
  jest.resetModules();
});

interface QueueItem {
  id: string;
  endpoint: string;
  body: unknown;
  idempotency_key: string;
  retry_count?: number;
  last_error?: string;
  created_at?: number;
}

interface ScanLogItem {
  id: string;
  event_id: string;
  service: string;
  qr_token: string;
  participant_name?: string;
  result: string;
  synced: boolean;
}

interface OfflineModule {
  enqueue: (item: QueueItem) => Promise<void>;
  markSynced: (id: string) => Promise<void>;
  getPendingQueue: () => Promise<(QueueItem & { retry_count: number; last_error?: string; created_at: number })[]>;
  getPendingCount: () => Promise<number>;
  incrementRetry: (id: string, error?: string) => Promise<void>;
  writeScanLog: (item: ScanLogItem) => Promise<void>;
  markScanSynced: (id: string) => Promise<void>;
}

function loadOffline(): OfflineModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../mobile/src/services/offline") as OfflineModule;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sync_queue — enqueue", () => {
  it("inserts an item and it appears in getPendingQueue", async () => {
    const offline = loadOffline();
    await offline.enqueue({
      id:              "id-001",
      endpoint:        "/api/ops/events/evt-1/scan",
      body:            { service: "checkin", qr_token: "tok-abc", event_id: "evt-1" },
      idempotency_key: "evt-1:checkin:tok-abc",
    });
    const queue = await offline.getPendingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("id-001");
  });

  it("deduplicates: INSERT OR IGNORE on same idempotency_key", async () => {
    const offline = loadOffline();
    const item = {
      id:              "id-001",
      endpoint:        "/api/ops/events/evt-1/scan",
      body:            { service: "checkin", qr_token: "tok-abc", event_id: "evt-1" },
      idempotency_key: "evt-1:checkin:tok-abc",
    };
    await offline.enqueue(item);
    await offline.enqueue({ ...item, id: "id-002" }); // same key, different id
    const queue = await offline.getPendingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("id-001");
  });

  it("allows different idempotency_keys", async () => {
    const offline = loadOffline();
    await offline.enqueue({
      id: "id-001", endpoint: "/api/scan", body: {}, idempotency_key: "evt-1:checkin:tok-A",
    });
    await offline.enqueue({
      id: "id-002", endpoint: "/api/scan", body: {}, idempotency_key: "evt-1:checkin:tok-B",
    });
    const queue = await offline.getPendingQueue();
    expect(queue).toHaveLength(2);
  });
});

describe("sync_queue — FIFO order", () => {
  it("returns items oldest-first", async () => {
    const offline = loadOffline();

    // Insert with explicit order — mock uses Date.now() which might be same-millisecond,
    // so we test via the mock's sort by created_at which is set to Date.now() in enqueue.
    // We just verify all three come back and the ids are in insertion order.
    for (const [id, key] of [["a", "key-a"], ["b", "key-b"], ["c", "key-c"]] as [string, string][]) {
      await new Promise(r => setTimeout(r, 2)); // ensure distinct timestamps
      await offline.enqueue({ id, endpoint: "/x", body: {}, idempotency_key: key });
    }

    const queue = await offline.getPendingQueue();
    expect(queue.map(q => q.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sync_queue — markSynced", () => {
  it("removes item from queue", async () => {
    const offline = loadOffline();
    await offline.enqueue({ id: "x1", endpoint: "/a", body: {}, idempotency_key: "k1" });
    await offline.enqueue({ id: "x2", endpoint: "/b", body: {}, idempotency_key: "k2" });
    await offline.markSynced("x1");
    const queue = await offline.getPendingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("x2");
  });
});

describe("sync_queue — getPendingCount", () => {
  it("returns correct count", async () => {
    const offline = loadOffline();
    expect(await offline.getPendingCount()).toBe(0);
    await offline.enqueue({ id: "c1", endpoint: "/a", body: {}, idempotency_key: "ck1" });
    await offline.enqueue({ id: "c2", endpoint: "/b", body: {}, idempotency_key: "ck2" });
    expect(await offline.getPendingCount()).toBe(2);
  });
});

describe("sync_queue — incrementRetry", () => {
  it("increments retry_count and stores last_error", async () => {
    const offline = loadOffline();
    await offline.enqueue({ id: "r1", endpoint: "/a", body: {}, idempotency_key: "rk1" });
    await offline.incrementRetry("r1", "timeout");
    await offline.incrementRetry("r1", "network error");
    const queue = await offline.getPendingQueue();
    expect(queue[0].retry_count).toBe(2);
    expect(queue[0].last_error).toBe("network error");
  });
});

describe("scan_log — writeScanLog + markScanSynced", () => {
  it("writes a scan log entry", async () => {
    const offline = loadOffline();
    await offline.writeScanLog({
      id:               "scan-001",
      event_id:         "evt-1",
      service:          "checkin",
      qr_token:         "tok-xyz",
      participant_name: "Priya Sharma",
      result:           "success",
      synced:           false,
    });
    // Verify via the mock DB directly
    const rows = mockDb._rows("scan_log");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("scan-001");
    expect(rows[0].synced).toBe(0);
  });

  it("deduplicates scan_log on id", async () => {
    const offline = loadOffline();
    await offline.writeScanLog({
      id: "scan-dup", event_id: "e", service: "tshirt", qr_token: "t", result: "success", synced: false,
    });
    await offline.writeScanLog({
      id: "scan-dup", event_id: "e", service: "tshirt", qr_token: "t", result: "duplicate", synced: false,
    });
    const rows = mockDb._rows("scan_log");
    expect(rows).toHaveLength(1);
    expect(rows[0].result).toBe("success"); // first write wins
  });

  it("markScanSynced sets synced=1", async () => {
    const offline = loadOffline();
    await offline.writeScanLog({
      id: "scan-s1", event_id: "e", service: "bib", qr_token: "t", result: "success", synced: false,
    });
    await offline.markScanSynced("scan-s1");
    const rows = mockDb._rows("scan_log");
    expect(rows[0].synced).toBe(1);
    expect(rows[0].synced_at).toBeGreaterThan(0);
  });
});
