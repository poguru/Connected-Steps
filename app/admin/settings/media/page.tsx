"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Alert, Badge, Label } from "@/components/ui/ds";

interface MediaStats {
  total_items:    number;
  total_images:   number;
  total_videos:   number;
  active_videos:  number;
  deleted_videos: number;
  total_bytes:    number | null;
  video_bytes:    number | null;
  next_expiry_at: string | null;
}

interface CleanupResult {
  deleted: number;
  failed:  number;
  skipped: number;
  log:     string[];
}

function fmtBytes(b: number | null): string {
  if (!b) return "—";
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${Math.round(b / 1e3)} KB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MediaSettingsPage() {
  const [stats,    setStats]    = useState<MediaStats | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [nextCleanup, setNextCleanup] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null); // which key is being saved
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResult,  setCleanupResult]  = useState<CleanupResult | null>(null);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/admin/media/stats");
      if (!res.ok) { setError("Failed to load stats."); return; }
      const data = await res.json() as { stats: MediaStats; settings: Record<string, string>; nextCleanupEst: string | null };
      setStats(data.stats);
      setSettings(data.settings);
      setNextCleanup(data.nextCleanupEst);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveSetting = async (key: string, value: string) => {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/media/stats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) setSettings(s => ({ ...s, [key]: value }));
      else setError("Failed to save setting.");
    } finally { setSaving(null); }
  };

  const runCleanup = async () => {
    setCleanupRunning(true); setCleanupResult(null); setError("");
    try {
      const res  = await fetch("/api/admin/media/cleanup", { method: "POST" });
      const data = await res.json() as CleanupResult;
      setCleanupResult(data);
      await load(); // refresh stats
    } catch { setError("Cleanup failed."); }
    finally { setCleanupRunning(false); }
  };

  const enabled         = settings.cleanup_enabled !== "false";
  const retentionDays   = parseInt(settings.video_retention_days ?? "30", 10);
  const lastCleanup     = settings.last_cleanup_at;
  const lastDeleted     = parseInt(settings.last_cleanup_deleted ?? "0", 10);

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: 780, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/admin/settings" style={{ fontSize: 12, color: "var(--muted-foreground)", textDecoration: "none" }}>← Settings</Link>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: "6px 0 4px" }}>Media Lifecycle Settings</h1>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
          Manage automatic video retention, storage usage, and cleanup schedules.
        </p>
      </div>

      {error && <Alert variant="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      {/* ── Storage Overview ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
          Storage Overview
        </div>

        {loading ? (
          <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            {[
              { label: "Photos",          value: stats?.total_images  ?? 0, unit: "files" },
              { label: "Active Videos",   value: stats?.active_videos ?? 0, unit: "files" },
              { label: "Deleted Videos",  value: stats?.deleted_videos ?? 0, unit: "files" },
              { label: "Photo Storage",   value: fmtBytes((stats?.total_bytes ?? 0) - (stats?.video_bytes ?? 0)), unit: "" },
              { label: "Video Storage",   value: fmtBytes(stats?.video_bytes ?? null), unit: "" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--cs-orange)", lineHeight: 1 }}>
                  {String(s.value)}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {nextCleanup && (
          <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted-foreground)" }}>
            Next video expires: <strong style={{ color: "#fff" }}>{fmtDate(nextCleanup)}</strong>
          </div>
        )}
      </Card>

      {/* ── Retention Settings ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
          Video Retention Policy
        </div>

        {/* Enable/Disable toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div>
            <Label style={{ display: "block", marginBottom: 3 }}>Automatic Video Cleanup</Label>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              When enabled, expired videos are deleted from storage to reduce costs. Thumbnails are always preserved.
            </div>
          </div>
          <button
            onClick={() => saveSetting("cleanup_enabled", enabled ? "false" : "true")}
            disabled={saving === "cleanup_enabled"}
            style={{
              width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
              background: enabled ? "var(--cs-orange)" : "rgba(255,255,255,0.15)",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
              opacity: saving === "cleanup_enabled" ? 0.6 : 1,
            }}
            aria-label={enabled ? "Disable cleanup" : "Enable cleanup"}
          >
            <span style={{ position: "absolute", top: 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", left: enabled ? 23 : 3 }} />
          </button>
        </div>

        {/* Retention period */}
        <div>
          <Label style={{ marginBottom: 6 }}>Retention Period (days)</Label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[7, 14, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => saveSetting("video_retention_days", String(d))}
                  disabled={saving === "video_retention_days"}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: "none",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    background: retentionDays === d ? "var(--cs-orange)" : "rgba(255,255,255,0.07)",
                    color: retentionDays === d ? "#fff" : "var(--muted-foreground)",
                    transition: "all 0.15s",
                    opacity: saving === "video_retention_days" ? 0.6 : 1,
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              Videos older than {retentionDays} day{retentionDays !== 1 ? "s" : ""} will be deleted.
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8 }}>
            Photos are <strong style={{ color: "#fff" }}>always kept permanently</strong>. Only video files are subject to retention.
          </div>
        </div>
      </Card>

      {/* ── Last cleanup ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
          Cleanup History &amp; Manual Trigger
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 4 }}>Last run</div>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{fmtDate(lastCleanup)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 4 }}>Files deleted</div>
            <div style={{ fontSize: 13, color: lastDeleted > 0 ? "var(--cs-orange)" : "#fff", fontWeight: 600 }}>{lastDeleted}</div>
          </div>
        </div>

        <Button
          size="sm"
          loading={cleanupRunning}
          onClick={runCleanup}
          variant={enabled ? "primary" : "secondary"}
        >
          {cleanupRunning ? "Running…" : "Run Cleanup Now"}
        </Button>

        {/* Cleanup result log */}
        {cleanupResult && (
          <div style={{ marginTop: 14 }}>
            <Alert variant={cleanupResult.failed > 0 ? "warning" : "success"} style={{ marginBottom: 10 }}>
              Deleted {cleanupResult.deleted} · Failed {cleanupResult.failed} · Skipped {cleanupResult.skipped}
            </Alert>
            {cleanupResult.log.length > 0 && (
              <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 12px", maxHeight: 200, overflowY: "auto" }}>
                {cleanupResult.log.map((line, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Cron setup info ── */}
      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
          Scheduled Automation
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.7, marginBottom: 10 }}>
          To run cleanup automatically, configure a scheduler to hit this endpoint daily:
        </p>
        <code style={{
          display: "block", padding: "8px 12px", borderRadius: 6,
          background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)",
          fontSize: 11, color: "#e8620a", wordBreak: "break-all",
          lineHeight: 1.6,
        }}>
          GET {typeof window !== "undefined" ? window.location.origin : "https://connectedsteps.in"}/api/cron/media-cleanup<br />
          Header: x-cron-secret: $CRON_SECRET
        </code>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10 }}>
          Set the <Badge color="orange" size="sm">CRON_SECRET</Badge> environment variable in your deployment to secure this endpoint.
          Videos older than the retention period are deleted; thumbnails are always preserved.
        </div>
      </Card>
    </div>
  );
}
