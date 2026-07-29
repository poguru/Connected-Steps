// Offline scan queue — persists pending ops scans to localStorage so they can
// be synced to the server once connectivity is restored.
// Used only in browser contexts (guard all calls with typeof window !== 'undefined').

export interface QueuedScan {
  id:               string;   // random client-generated ID
  event_id:         string;
  service:          string;
  qr_token:         string;
  participant_name: string | null;
  queued_at:        string;   // ISO timestamp
  sync_error?:      string;
}

const STORAGE_KEY = "cs_offline_queue";

function readQueue(): QueuedScan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedScan[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); }
  catch { /* quota exceeded — drop silently */ }
}

export function enqueueOfflineScan(item: Omit<QueuedScan, "id" | "queued_at">) {
  const q = readQueue();
  q.push({
    ...item,
    id:        crypto.randomUUID(),
    queued_at: new Date().toISOString(),
  });
  writeQueue(q);
}

export function getPendingScans(): QueuedScan[] {
  return readQueue();
}

export function removeScan(id: string) {
  writeQueue(readQueue().filter(s => s.id !== id));
}

export function markSyncError(id: string, error: string) {
  const q = readQueue().map(s => s.id === id ? { ...s, sync_error: error } : s);
  writeQueue(q);
}

export function clearQueue() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

// Attempt to sync all pending scans. Returns { synced, failed } counts.
export async function syncPendingScans(): Promise<{ synced: number; failed: number }> {
  const pending = readQueue();
  if (!pending.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const res = await fetch(`/api/ops/events/${item.event_id}/scan`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ service: item.service, qr_token: item.qr_token }),
      });
      if (res.ok || res.status === 409) {
        // 409 = already done (race condition); still consider it synced
        removeScan(item.id);
        synced++;
      } else {
        const d = await res.json().catch(() => ({})) as { code?: string };
        markSyncError(item.id, d.code ?? `HTTP ${res.status}`);
        failed++;
      }
    } catch {
      // Still offline — leave in queue
      failed++;
    }
  }

  return { synced, failed };
}
