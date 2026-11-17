# Load test results: Redis order lock under a flash sale

**Date:** 2026-11-17 · **Tool:** k6 v2.4.0 (`grafana/k6:2.4.0` in Docker) · **Script:** [`flash-sale-load-test.js`](flash-sale-load-test.js)
**Raw data:** [`results/*.json`](results/) (one file per run, including the PostgreSQL cross-check)

## TL;DR

The atomic Redis lock (`SET NX EX`, PR #8) does exactly what a flash sale needs. Under 50 concurrent "clients" sharing one account and firing **~800–1,500 requests per second**, it let **4 orders through in 10 s (one per 3 s lock window) in all 3 runs**. The previous `GET`-then-`SET` lock let through **48 to 90** in the same test (**12× to 22× more orders than allowed**), and every one of them was a real row in PostgreSQL.

200 different buyers ordering the same product at the same instant were never blocked by each other in any run, and the fix adds **no measurable latency**.

## What was tested

| Scenario | Load | Correct behaviour |
|---|---|---|
| `many_users_burst` | 200 **distinct** users (real accounts, real JWTs) place **one** order each, all at the same instant, same `productId` | All 200 get `201`: the lock is per user + product, so buyers don't block each other |
| `same_user_spam` | 50 virtual users share **one** account and hammer `POST /orders` for 10 s with no pause (double clicks, retries, bots) | At most `ceil(10 / 3) + 1 = 5` orders (one per 3 s lock window); everything else `429` |

After each run, [`verify-db.mjs`](verify-db.mjs) counted the rows actually written to PostgreSQL and compared them with the `201` responses k6 saw.

Two versions of the API were tested with the same script, 3 runs each:

- **Baseline:** commit `d21b17a` (before PR #8): the lock is `GET key` followed by a separate `SET key EX 3`.
- **Atomic lock:** commit `bfc709b` (current `main`): one atomic `SET key token NX EX 3`.

## Results

### Correctness (what matters)

| Run | Spam: orders for 1 user in 10 s | …rows in PostgreSQL | Allowed | Burst: 201 / 200 | Unexpected API responses | Verdict |
|---|---:|---:|---:|---:|---:|---|
| Baseline run 1 | **60** | 60 | ≤ 5 | 200 | 0 | ❌ FAIL |
| Baseline run 2 | **90** | 90 | ≤ 5 | 199¹ | 0 | ❌ FAIL |
| Baseline run 3 | **48** | 48 | ≤ 5 | 200 | 0 | ❌ FAIL |
| **Atomic run 1** | **4** | 4 | ≤ 5 | 200 | 0 | ✅ PASS |
| **Atomic run 2** | **4** | 4 | ≤ 5 | 200 | 0 | ✅ PASS |
| **Atomic run 3** | **4** | 4 | ≤ 5 | 200 | 0 | ✅ PASS |

¹ One request got no HTTP answer at all (a dropped connection in Docker Desktop's network proxy, not an API error; see [Caveats](#caveats)). The DB has 199 rows, consistent with it never reaching the API.

In every run, **rows in PostgreSQL = `201` responses**, and no burst user ended up with a duplicate order.

### Performance

| Run | Spam throughput | Spam latency p50 / p95 | Burst latency p50 / p95 (200 simultaneous) |
|---|---:|---:|---:|
| Baseline run 1 | 1,468 req/s | 30.9 / 53.0 ms | 197 / 308 ms |
| Baseline run 2 | 1,074 req/s | 41.8 / 68.3 ms | 248 / 459 ms |
| Baseline run 3 | 1,000 req/s | 45.4 / 75.0 ms | 150 / 211 ms |
| Atomic run 1 | 1,472 req/s | 31.5 / 53.0 ms | 157 / 261 ms |
| Atomic run 2 | 788 req/s | 56.8 / 98.7 ms | 547 / 744 ms |
| Atomic run 3 | 901 req/s | 50.9 / 81.6 ms | 316 / 517 ms |

The spread between runs of the **same** version (e.g. 788 vs 1,472 req/s) is larger than any difference between versions. That's noise from a laptop running the API, PostgreSQL, Redis and k6 at the same time. Run 1 of each version, taken under similar conditions, is practically identical (1,468 vs 1,472 req/s; p95 53.0 vs 53.0 ms). **Conclusion: the fix costs nothing measurable**, which makes sense because both versions hit Redis once per blocked request.

All performance thresholds passed in every run (burst p95 < 2 s, spam p95 < 300 ms).

## Why the baseline fails

With `GET` then `SET`, there is a gap between "is the lock free?" and "take the lock". When many requests arrive together, several read "free" before any of them writes:

```
request A: GET lock → null ─┐
request B: GET lock → null ─┼─ all three see "free"
request C: GET lock → null ─┘
request A: SET lock ; create order ✔
request B: SET lock ; create order ✔   ← duplicate
request C: SET lock ; create order ✔   ← duplicate
```

That gap opens at the start of the burst and again every time the 3 s lock expires while 50 clients are waiting. That's why the baseline produced 48–90 orders instead of ≤ 5. `SET NX` checks and writes in one atomic Redis command, so exactly one request wins each window.

## Benefits shown by these results

- **No duplicate orders under real concurrency.** In a flash sale, a double click, a retry from a flaky network or a bot spamming the button cannot turn into several charges or several reserved units. The baseline would have created up to 90 orders for one person in 10 seconds.
- **Inventory and money stay consistent.** Every `201` is exactly one row in PostgreSQL. No orders appear without a response, and no responses come back without an order.
- **Fair for everyone else.** The lock is scoped per user + product, so 200 different buyers hitting the same product at the same instant all got through. Protection against one user's spam never blocks other buyers.
- **Cheap rejection.** Blocked requests (`429`) answer in ~30–55 ms at p50 and never touch PostgreSQL, so spam doesn't eat database capacity that real buyers need.
- **No performance cost.** Same throughput and latency as the broken version.
- **Clear feedback to the client.** A `429` with an explicit message lets the frontend show "your order is being processed" instead of failing silently.

## Caveats

- **Local, single machine.** Intel i7-1068NG7 (4 cores / 8 threads), 16 GB RAM, macOS, Node 23.5.0. The API runs in dev mode (`tsx`), and PostgreSQL 15 and Redis 7 run in Docker Desktop. Absolute numbers (req/s, ms) are only useful to compare runs on the same machine. **The correctness results (4 vs 48–90) don't depend on hardware.**
- **k6 ran in Docker**, reaching the API through Docker Desktop's `host.docker.internal` proxy, which can drop the odd connection at high rates. The script counts those apart (`transport_errors`, threshold < 1%) from real API answers (`orders_unexpected`, must be 0). The same spam pattern run natively from the host with Node showed 0 connection errors in 11,899 requests. For the cleanest numbers, run k6 natively (`brew install k6`).
- The lock is anti-duplicate protection per user + product. It is **not** stock control: there is no inventory limit yet, so 200 buyers → 200 orders is correct for the current domain.

## How to reproduce

See [README.md](README.md). Short version, with the API running on `:3000` and docker compose up:

```bash
RUN_LABEL=my-run ./load-tests/run.sh
```
