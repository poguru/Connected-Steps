# Load tests for The IT Run Sprint-2

These scripts are for [k6](https://k6.io). They are written but have not been run.

## Files

- `read-only-capacity.js`: GET requests only (event page, event data, categories, register page). Safe for small levels on production, with approval.
- `registration-journey.js`: saves registration drafts with synthetic participants. **Writes data. Staging only.** It never creates a registration, starts a payment, or sends OTP or email.

## Levels

| LEVEL | Virtual users | Where it may run |
|---|---|---|
| smoke | 5 | Staging, or production for read-only with approval |
| baseline | 10 | Staging, or production for read-only with approval |
| moderate | 50 | Staging only |
| target | 100 | Staging only |
| capacity | 200 | Staging only, after lower levels pass |

Production is capped at smoke and baseline, and only for the read-only script. The scripts enforce this and stop otherwise.

## Running

```
k6 run -e TARGET_URL=https://staging.example.com -e LEVEL=baseline performance/read-only-capacity.js

k6 run -e TARGET_URL=https://staging.example.com -e TEST_SESSION_COOKIE=<session for a synthetic test account> -e LEVEL=moderate performance/registration-journey.js
```

Production, read-only, only with explicit approval:
```
k6 run -e TARGET_URL=https://www.connectedsteps.in -e ALLOW_PRODUCTION_READ_ONLY=yes -e LEVEL=baseline performance/read-only-capacity.js
```

## Safety rules

1. Never point the write script at production. It refuses.
2. Use synthetic accounts only. Never reuse a real participant's session.
3. Synthetic participants use names that start with `LoadTest` and emails at `.invalid` domains.
4. Clean up only those records, on staging only. Example (staging database, after review):
   - Find: `select id from it_run_participants where first_name like 'LoadTest%';`
   - Delete the dependent rows first, then the drafts and registrations that hold only these participants. Review the list before any delete.
5. Stop the test if error rates or database load rise sharply.

## Acceptance targets (proposed, for review)

- Read-only p95 under 1 second. Critical registration p95 under 2 seconds. p99 reported separately.
- Errors under 1%. No duplicate registrations, no oversold seats, no cross-user access.

## Not covered by these scripts

- Payment (Razorpay), OTP delivery, email delivery and WhatsApp. These need test-mode or mocked providers.
- Full checkout and webhook behaviour under load.
