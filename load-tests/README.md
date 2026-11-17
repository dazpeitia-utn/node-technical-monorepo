# Load tests (k6)

Flash sale load test for `apps/flash-sale-api`: many buyers and one spamming user all ordering the **same product** at the same time, to check that the Redis lock stops duplicate orders (`429`) without blocking legitimate buyers, and that PostgreSQL ends up consistent.

📊 **Latest results and analysis:** [RESULTS.md](RESULTS.md)

## Files

| File | What it does |
|---|---|
| `flash-sale-load-test.js` | The k6 script: registers real users in `setup()`, runs two scenarios, checks and thresholds, and writes `results/<RUN_LABEL>.json` |
| `run.sh` | Runs the script (local `k6` if installed, otherwise Docker) and then `verify-db.mjs` |
| `verify-db.mjs` | Waits for the queue to drain, then compares the orders stored in PostgreSQL with the accepted responses k6 saw |
| `results/` | One JSON per run (metrics, thresholds, DB cross-check) |
| `RESULTS.md` | Recorded runs, before/after comparison and conclusions |

## Scenarios

| Scenario | Load (defaults) | Pass criteria |
|---|---|---|
| `many_users_burst` | 200 distinct users, 1 order each, all at the same instant | 200 accepted (`202`; `201` on the pre-queue API), 0 × `429`, p95 < 2 s |
| `same_user_spam` | 50 VUs on **one** account, non-stop for 10 s (starts at t = 15 s) | ≤ `ceil(10/3)+1 = 5` accepted, the rest `429`, p95 < 300 ms |
| Both | | 0 unexpected API responses (no 400/401/5xx); < 1% transport errors |
| `verify-db.mjs` | | Waits for the worker to drain the queue, then: rows in PostgreSQL = accepted responses, all `CONFIRMED`, no burst user has duplicates, spam user ≤ 5 orders |

## Running it

**1. Prerequisites:** infrastructure, schema, the API **and the order worker** running (without the worker, orders stay `PENDING` in the queue and the DB check times out).

```bash
docker compose up -d
```

```bash
cd apps/flash-sale-api && pnpm exec prisma db push && pnpm dev
```

In another terminal:

```bash
cd apps/flash-sale-api && pnpm dev:worker
```

**2. k6:** either install it natively (recommended: no Docker network proxy in the way), or let `run.sh` use the Docker image `grafana/k6:2.4.0` automatically.

```bash
brew install k6
```

**3. Run** (from the repo root, in another terminal):

```bash
./load-tests/run.sh
```

The output ends with `RESULT: PASS|FAIL` (k6 thresholds) and `DB VERIFICATION: PASS|FAIL`. The script exits non-zero if either fails, so it can be used in CI.

### Options

All optional, as environment variables:

| Variable | Default | |
|---|---|---|
| `API_URL` | `http://localhost:3000` | API base URL (`localhost` is rewritten to `host.docker.internal` when k6 runs in Docker) |
| `RUN_LABEL` | `latest` | Name of the results file `results/<RUN_LABEL>.json` |
| `BURST_USERS` | `200` | Distinct users in the burst |
| `SPAM_VUS` | `50` | Concurrent clients sharing the spam account |
| `SPAM_SECONDS` | `10` | Spam duration (the allowed maximum adapts: `ceil(s/3)+1`) |
| `PRODUCT_ID` | `123e4567-…4000` | Product everyone orders |
| `USE_DOCKER` | unset | Set to `1` to force the Docker image even if `k6` is installed |
| `PG_CONTAINER` | `flash_sale_postgres` | Container used by `verify-db.mjs` |
| `DRAIN_TIMEOUT_SECONDS` | `120` | How long `verify-db.mjs` waits for the worker to process every accepted order |

```bash
RUN_LABEL=stress BURST_USERS=500 SPAM_VUS=100 SPAM_SECONDS=30 ./load-tests/run.sh
```

### Running k6 directly

```bash
k6 run -e BASE_URL=http://localhost:3000 load-tests/flash-sale-load-test.js
```

## Notes

- **Test data:** each run registers `BURST_USERS + 1` users (`k6-<timestamp>-…@loadtest.local`) and their orders in your local database. To clean up:

  ```bash
  docker exec flash_sale_postgres psql -U postgres -d flash_sale_db -c "DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@loadtest.local'); DELETE FROM users WHERE email LIKE '%@loadtest.local';"
  ```

- **Docker Desktop on macOS:** at high rates its `host.docker.internal` proxy can drop a few connections (`dial: i/o timeout`). They're reported as `transport_errors`, separate from API errors. Native k6 avoids them.
- **Numbers are machine-specific.** Compare runs on the same machine; see the caveats in [RESULTS.md](RESULTS.md).
