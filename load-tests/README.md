# Load Tests — k6

Performance benchmarks for the Connected Steps platform.
Uses [k6](https://k6.io) (free, open-source load testing tool).

## Install k6

```bash
# macOS
brew install k6

# Windows (chocolatey)
choco install k6

# Docker
docker run --rm -i grafana/k6 run -
```

## Scripts

| Script | Scenario | Peak VUs | Duration | Primary Threshold |
|--------|----------|----------|----------|-------------------|
| `k6-registration.js` | Participant free-event registration | 100 | ~3m30s | p95 < 3000 ms |
| `k6-checkin.js` | Volunteer QR check-in (constant-arrival-rate) | 50 | 3m | p95 < 1500 ms |
| `k6-dashboard.js` | Dashboard + leaderboard concurrent reads | 500 | ~3m30s | p95 < 2000 ms |

## Running against staging

```bash
# Registration flow
k6 run load-tests/k6-registration.js \
  --env BASE_URL=https://staging.connectedsteps.in \
  --env USER_TOKEN=<test-user-token> \
  --env EVENT_ID=<free-event-uuid>

# Check-in simulation
k6 run load-tests/k6-checkin.js \
  --env BASE_URL=https://staging.connectedsteps.in \
  --env ADMIN_COOKIE="cs_admin_session=<value>" \
  --env EVENT_ID=<event-uuid>

# Dashboard / leaderboard
k6 run load-tests/k6-dashboard.js \
  --env BASE_URL=https://staging.connectedsteps.in \
  --env USER_TOKEN=<test-user-token>
```

## Running locally

```bash
npm run dev &
k6 run load-tests/k6-dashboard.js --env BASE_URL=http://localhost:3000 --vus 20 --duration 60s
```

## Thresholds

All scripts define `thresholds` in their `options` export. k6 exits with code 99
when any threshold is violated — suitable for CI/CD gating.

| Metric | Target | Notes |
|--------|--------|-------|
| Registration p95 | < 3000 ms | Includes DB write + job enqueue |
| Check-in p95 | < 1500 ms | Volunteer sees delay; keep tight |
| Dashboard p95 | < 2000 ms | 500 concurrent readers |
| Global error rate | < 2–5% | Per-script threshold |

## What to look for

- **p99 spikes** above threshold: indicates DB connection exhaustion or lock contention
- **Dead-letter jobs**: run `/api/health` after — `components.job_queue.dead > 0` means failures under load
- **503s from /api/ready**: indicates the process cannot serve traffic (env missing or DB unreachable)
- **Flat p50 + spiking p99**: classic tail-latency problem — usually slow DB queries under concurrency
