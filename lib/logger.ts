/**
 * Structured JSON logger — drop-in replacement for console.log/error calls.
 *
 * Outputs JSON lines compatible with Vercel Log Drains, DataDog, and any
 * OpenTelemetry-compatible log collector.
 *
 * Usage (additive — existing console.error calls still work):
 *   import { logger } from "@/lib/logger";
 *   logger.info("payment/verify", "Payment confirmed", { paymentId, email });
 *   logger.error("job-worker", "Job failed", { jobId, error: e.message });
 *
 * DEBUG mode: set LOG_LEVEL=debug in Vercel env vars to enable debug lines.
 * Production: only info, warn, error are emitted (debug is silenced).
 *
 * Rollback: remove import and revert to console.log — zero dependency.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts:       string;
  level:    Level;
  service:  string;
  msg:      string;
  env:      string;
  [key: string]: unknown;
}

function emit(level: Level, service: string, msg: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts:      new Date().toISOString(),
    level,
    service,
    msg,
    env:     process.env.NODE_ENV ?? "unknown",
    ...meta,
  };

  const line = JSON.stringify(entry);

  // Mirror to the appropriate console method so Vercel log level filtering works
  if (level === "error") console.error(line);
  else if (level === "warn")  console.warn(line);
  else                        console.log(line);
}

export const logger = {
  /** General informational events — job completions, cache hits, successful sends. */
  info(service: string, msg: string, meta?: Record<string, unknown>): void {
    emit("info", service, msg, meta);
  },

  /** Recoverable issues — fallback triggered, retry scheduled, cache miss. */
  warn(service: string, msg: string, meta?: Record<string, unknown>): void {
    emit("warn", service, msg, meta);
  },

  /** Hard errors — job failed, payment error, DB unreachable. Always logged. */
  error(service: string, msg: string, meta?: Record<string, unknown>): void {
    emit("error", service, msg, meta);
  },

  /** Verbose tracing — only emitted when LOG_LEVEL=debug env var is set. */
  debug(service: string, msg: string, meta?: Record<string, unknown>): void {
    if (process.env.LOG_LEVEL === "debug") emit("debug", service, msg, meta);
  },
};
