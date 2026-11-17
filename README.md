# Node Technical Monorepo

> A production-grade TypeScript monorepo built to demonstrate advanced software engineering patterns, strict architectural boundaries, and enterprise practices.

---

## 🏗️ Architecture & Design Principles

This repository serves as a technical sandbox and architectural blueprint implementing **Hexagonal Architecture (Ports & Adapters)**. 

### What is Hexagonal Architecture?
Imagine your application as a secure vault. Hexagonal Architecture (popularized by Alistair Cockburn) ensures that **the core of your business (the Domain)** remains completely independent of the outside world (databases, web frameworks like Express, HTTP libraries, or third-party services).

- **The Domain (The Center):** Contains pure business logic and rules (e.g., `Order` entities, invariant checks). It has no knowledge of Express, SQL, MongoDB, or external frameworks—only pure TypeScript.
- **The Ports (Interfaces):** Act as boundaries or contracts. They define *what* the domain needs (e.g., `IOrderRepository`, `IOrderQueue`, `IUserRepository`, `IPasswordHasher`) without caring *how* it is implemented.
- **The Adapters (The Outside):** Translate requests between the external world and the core domain:
  - **Inbound Adapters:** NestJS controllers (`AuthController`, `OrderController`), the `JwtAuthGuard`, and Zod validation schemas. They intercept HTTP requests, validate payloads, and trigger use cases. The same Zod schemas also generate the OpenAPI docs. The BullMQ `OrderWorker` is an inbound adapter too: it is driven by queue jobs instead of HTTP requests.
  - **Outbound Adapters:** Persistence and infrastructure, such as the PostgreSQL/Prisma adapters (`PostgresOrderRepository`, `PostgresUserRepository`), the `scrypt` password hasher (`ScryptPasswordHasher`), the Redis cache (`RedisService`), and the BullMQ order queue (`BullMqOrderQueue`).

> **Why this matters in interviews:** The HTTP layer was migrated from plain Express to NestJS **without touching a single line of business logic**: use cases such as `RegisterUserUseCase` are plain TypeScript classes, and NestJS only wires them up in `AuthModule` via factory providers and port injection tokens.

---

## 🛠️ Tech Stack

- **Monorepo Management:** Turborepo & pnpm Workspaces
- **Automated CI/CD & AI Code Review:** GitHub Actions integrated with Google Gemini API for automated Pull Request code reviews.
- **Language:** TypeScript (Strict Mode)
- **API Framework:** NestJS (Express platform)
- **Authentication:** JSON Web Tokens (JWT) & Stateless Security, passwords hashed with `scrypt` (`node:crypto`)
- **Validation:** Zod (Fail-fast boundary validation)
- **API Documentation:** Swagger / OpenAPI 3 (`@nestjs/swagger`), request schemas generated from Zod via `zod-to-json-schema`
- **Database & ORM:** PostgreSQL & Prisma ORM
- **Cache & Concurrency Control:** Redis (`ioredis`) for per-user order idempotency locks
- **Asynchronous Processing:** BullMQ (Redis-backed queue) with a separate worker process, retries with exponential backoff
- **Testing:** Vitest & Supertest (Unit & Integration tests, V8 coverage)
- **Load Testing:** k6 (flash sale scenarios, PostgreSQL cross-check, recorded before/after results)
- **Containerization:** Docker & Docker Compose

---

## 📁 Monorepo Structure

```text
node-technical-monorepo/
├── apps/
│   └── flash-sale-api/         # E-commerce Flash Sale micro-API (Hexagonal Architecture)
│       ├── prisma/            # Database schema (orders, users)
│       ├── src/
│       │   ├── application/   # Use cases (CreateOrder, RegisterUser)
│       │   ├── domain/        # Pure business models, rules and domain errors
│       │   ├── infrastructure/# Inbound (NestJS modules, controllers, guards, OpenAPI docs), Outbound (Prisma),
│       │   │                  # cache (Redis), security (JWT, password hashing), config (.env loading)
│       │   └── ports/         # Outbound interfaces + DI tokens
│       ├── test/              # unit/, integration/, helpers/ (in-memory fakes, fixtures)
│       └── .env.example       # Environment variables template
├── load-tests/                # k6 flash sale load test, DB cross-check and recorded results
├── packages/                  # Shared packages across apps (future expansions)
├── docker-compose.yml         # Local infrastructure provisioning (PostgreSQL + Redis)
├── pnpm-workspace.yaml        # pnpm workspaces configuration
└── turbo.json                 # Turborepo task orchestration pipeline
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- pnpm (`npm install -g pnpm`)
- Docker & Docker Compose

> ⚠️ The root `package.json` enforces pnpm through `devEngines`, so `npx`/`npm` commands fail with `EBADDEVENGINES`. Use `pnpm exec <bin>` instead of `npx <bin>`.

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_GITHUB_USERNAME/node-technical-monorepo.git
   cd node-technical-monorepo
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Start local infrastructure (PostgreSQL + Redis):**
   ```bash
   docker compose up -d
   ```

4. **Configure environment variables:**
   ```bash
   cp apps/flash-sale-api/.env.example apps/flash-sale-api/.env
   ```
   The server loads `apps/flash-sale-api/.env` on startup (`src/infrastructure/config/load-env.ts`); variables already set in the shell take precedence.

5. **Sync the database schema (creates the `orders` and `users` tables):**
   ```bash
   cd apps/flash-sale-api
   pnpm exec prisma db push
   ```

6. **Run tests across the monorepo:**
   ```bash
   pnpm test
   ```

7. **Start the development server** (NestJS on `http://localhost:3000`):
   ```bash
   pnpm --filter flash-sale-api dev
   ```

8. **Start the order worker** in another terminal (processes queued orders; without it they stay `PENDING`):
   ```bash
   pnpm --filter flash-sale-api dev:worker
   ```

---

## 🧪 Testing

Tests run with **Vitest**; HTTP integration tests boot a real NestJS app (controllers, `JwtAuthGuard`, validation) with **Supertest**, replacing only the outbound adapters (PostgreSQL, Redis) with in-memory fakes. No Docker needed to run them.

```bash
pnpm test                                        # whole monorepo (Turborepo)
pnpm --filter flash-sale-api test:unit           # use cases, schemas, guard, hasher
pnpm --filter flash-sale-api test:integration    # HTTP endpoints + Swagger spec
pnpm --filter flash-sale-api test:coverage       # V8 coverage report in apps/flash-sale-api/coverage/
pnpm --filter flash-sale-api test:watch          # watch mode
pnpm --filter flash-sale-api typecheck           # tsc --noEmit (includes tests)
```

| Suite | What it covers |
|-------|----------------|
| `unit/CreateOrderUseCase` | PENDING orders enqueued through the `IOrderQueue` port, quantity rules, nothing enqueued on invalid input, queue failures |
| `unit/ProcessOrderUseCase`, `unit/GetOrderUseCase`, `unit/Order` | Worker logic: CONFIRMED, idempotent re-processing, REJECTED never overrides a final status; status lookup in DB or queue, owner-only access; domain transitions |
| `unit/*.schema` | Zod rules and messages for orders, register and login (UUIDs, positive integers, email normalization, password length) |
| `unit/JwtAuthGuard` | Valid token → `req.user`; missing, malformed, forged and expired tokens → `401` |
| `unit/ScryptPasswordHasher`, `unit/RegisterUserUseCase` | Hash format, random salt, verification, duplicate emails |
| `integration/OrderController` | `202` + `Location`, no DB access in the request, userId taken from the JWT, `400`, `401`, `500` without leaking details, `GET /orders/:id` PENDING → CONFIRMED / REJECTED / `404`, and the **Redis lock**: `429` on repeat, scoped per user + product, 3s TTL, released after expiry (fake timers) |
| `integration/AuthController` | `/auth/register` (`201`/`400`/`409`) and `/auth/login` |
| `integration/Swagger` | Docs served, every endpoint and status code documented, Zod-derived bodies, Bearer security |
| `unit/OrderController.concurrency` | N truly simultaneous requests: exactly one wins per user + product, others get `429`; lock released on failure |
| `integration/RedisService.lock` | Against a **real Redis**: 50 parallel `acquireLock` → 1 winner, TTL set, owner-only release (Lua). Skipped automatically if Redis isn't reachable |
| `integration/OrderQueue.bullmq` | Against a **real Redis + BullMQ**: queue → worker → repository, idempotent enqueue, 100 orders persisted exactly once, retry after a transient failure, `REJECTED` after 3 failed attempts. Skipped if Redis isn't reachable |

---

## 🔥 Load Testing (k6)

[`load-tests/`](load-tests/) simulates a flash sale against `POST /orders` for a single product:

- **200 distinct buyers** ordering at the same instant: all must succeed.
- **50 concurrent clients spamming from one account** for 10 s: the Redis lock must let at most one order through per 3 s window and answer `429` to the rest.

After each run (and once the worker has drained the queue), the rows actually written to PostgreSQL are checked against the accepted responses.

```bash
./load-tests/run.sh          # API on :3000 + worker running; uses local k6 or the grafana/k6 Docker image
```

**Recorded result** ([full report](load-tests/RESULTS.md)): at ~800–1,500 req/s, the atomic lock (`SET NX EX`) allowed **4 orders in 10 s in all 3 runs**. The previous `GET`-then-`SET` lock allowed **48–90** (12–22× over the limit, all real rows in PostgreSQL), at the same latency and throughput. All 200 simultaneous distinct buyers got their order in every run. With the BullMQ queue, results stayed the same, and HTTP latency didn't change even with 200 ms of simulated processing per order (done by the worker, not the request).

---

## 📚 API Documentation (Swagger)

With the server running, open the interactive docs:

- **Swagger UI:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **OpenAPI JSON:** [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json) (importable into Postman / Insomnia)

To call protected routes from the UI: run `POST /auth/register`, copy the `accessToken`, click **Authorize** and paste it (the token is kept across page reloads).

Request bodies are generated from the same Zod schemas used for runtime validation (`zodToOpenApi` in `src/infrastructure/inbound/http/openapi/`), so docs and validation can't drift apart. Endpoint docs live in `openapi/*.docs.ts`, keeping controllers to a single decorator per route.

---

## 🔒 API Endpoints & Testing

### 1. Register a User (Get JWT Token)
Validates the payload with Zod (valid `email`, `password` of 8–72 chars), hashes the password with `scrypt`, stores the user in PostgreSQL and returns a signed JWT access token.
- **POST** `/auth/register`
  ```bash
  curl -X POST http://localhost:3000/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email": "jorge@example.com", "password": "super-secret"}'
  ```
  ```json
  {
    "message": "User registered successfully",
    "data": { "id": "eb383f8b-…", "email": "jorge@example.com", "createdAt": "2026-11-17T17:11:57.350Z" },
    "accessToken": "eyJhbGciOiJIUzI1NiIs…",
    "tokenType": "Bearer",
    "expiresIn": "1h"
  }
  ```
  | Status | Meaning |
  |--------|---------|
  | `201`  | User created, token returned |
  | `400`  | Validation error (`details` lists field errors) |
  | `409`  | Email already registered |

### 2. Login (Development Token)
Returns a signed JWT for testing purposes. ⚠️ It does **not** verify credentials yet; use `/auth/register` to get a token for a real user. Both `email` and `userId` are optional; if sent, they must be a valid email / UUID (`400` otherwise).
- **POST** `/auth/login`
  ```bash
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "jorge@example.com"}'
  ```

### 3. Place Order (Protected Route, asynchronous)
Validates the order, takes the Redis lock and **enqueues** it (BullMQ). It answers immediately with `202 Accepted`, status `PENDING` and a `Location: /orders/<id>` header, **without touching PostgreSQL**. Requires a valid Bearer token, checked by `JwtAuthGuard` (the `userId` is extracted from the JWT to prevent identity spoofing). A Redis lock rejects repeated orders for the same user and product within 3 seconds with `429 Too Many Requests`.

  The lock is taken atomically with a single `SET lock:order:<userId>:<productId> <token> NX EX 3`, so among N simultaneous identical requests exactly one gets through (verified with 50 parallel requests: 1 accepted, 49×`429`, 1 row in PostgreSQL). On success the lock is kept until it expires (double-click protection); if enqueueing fails, it is released immediately with an owner-checked compare-and-delete (Lua), so the user can retry. Responses: `202`, `400` (field errors in `details`), `401`, `429`.
- **POST** `/orders`
  ```bash
  curl -X POST http://localhost:3000/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
    -d '{
      "productId": "123e4567-e89b-12d3-a456-426614174000",
      "quantity": 2
    }'
  ```

### 4. Get Order Status (Protected Route)
Returns one of your orders: `PENDING` while it's queued or being processed, then `CONFIRMED`, or `REJECTED` if processing failed after all retries. Orders of other users answer `404` (ids can't be probed). Responses: `200`, `400` (id is not a UUID), `401`, `404`.
- **GET** `/orders/:id` (the URL comes in the `Location` header of `POST /orders`)
  ```bash
  curl http://localhost:3000/orders/<ORDER_ID> \
    -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
  ```

---

## ⚙️ Asynchronous Order Processing (BullMQ)

```text
 client ──POST /orders──▶ API (NestJS)                      Worker process (pnpm dev:worker)
                           │ 1. validate (Zod + domain)        │
                           │ 2. Redis lock SET NX EX 3 ── 429  │ 4. take job (concurrency 10)
                           │ 3. enqueue job ──▶ Redis/BullMQ ──▶│ 5. upsert order CONFIRMED in PostgreSQL
 client ◀─202 PENDING──────┘    (jobId = orderId)              │    retry ×3 (1s, 2s), then REJECTED
 client ──GET /orders/:id──▶ PostgreSQL, or the queue while PENDING
```

- **Non-blocking request:** the HTTP path never waits for the database or for processing; spikes are absorbed by Redis and the worker drains them at its own pace.
- **No lost or duplicated orders:** `jobId` = order id makes enqueueing idempotent; the worker is idempotent (an order with a final status is never rewritten) and the repository upserts by id, so BullMQ's at-least-once delivery is safe.
- **Retries and failures:** 3 attempts with exponential backoff (1s, 2s); after the last one the order is marked `REJECTED`. Failed jobs stay 24h in Redis for inspection.
- **Separate process:** the worker (`src/infrastructure/inbound/queue/worker.ts`) has no HTTP server and can be scaled independently (`ORDER_WORKER_CONCURRENCY`, more replicas). If it's down, orders wait in the queue and are processed when it comes back. `SIGTERM` lets in-flight jobs finish.
- **Configuration** (`.env`, all optional): `ORDER_QUEUE_NAME` (default `orders`), `ORDER_WORKER_CONCURRENCY` (default `10`), `ORDER_PROCESSING_DELAY_MS` (simulated work per order, for load tests; default `0`).

---

## 📄 License
MIT © Jorge Diego Daniel Azpeitia