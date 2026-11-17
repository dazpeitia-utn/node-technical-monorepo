# Node Technical Monorepo

> A production-grade TypeScript monorepo built to demonstrate advanced software engineering patterns, strict architectural boundaries, and enterprise practices.

---

## 🏗️ Architecture & Design Principles

This repository serves as a technical sandbox and architectural blueprint implementing **Hexagonal Architecture (Ports & Adapters)**. 

### What is Hexagonal Architecture?
Imagine your application as a secure vault. Hexagonal Architecture (popularized by Alistair Cockburn) ensures that **the core of your business (the Domain)** remains completely independent of the outside world (databases, web frameworks like Express, HTTP libraries, or third-party services).

- **The Domain (The Center):** Contains pure business logic and rules (e.g., `Order` entities, invariant checks). It has no knowledge of Express, SQL, MongoDB, or external frameworks—only pure TypeScript.
- **The Ports (Interfaces):** Act as boundaries or contracts. They define *what* the domain needs (e.g., `IOrderRepository`, `IUserRepository`, `IPasswordHasher`) without caring *how* it is implemented.
- **The Adapters (The Outside):** Translate requests between the external world and the core domain:
  - **Inbound Adapters:** NestJS controllers (`AuthController`, `OrderController`), the `JwtAuthGuard`, and Zod validation schemas. They intercept HTTP requests, validate payloads, and trigger use cases. The same Zod schemas also generate the OpenAPI docs.
  - **Outbound Adapters:** Persistence and infrastructure, such as the PostgreSQL/Prisma adapters (`PostgresOrderRepository`, `PostgresUserRepository`), the `scrypt` password hasher (`ScryptPasswordHasher`), and the Redis cache (`RedisService`).

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
- **Testing:** Vitest & Supertest (Unit & Integration tests, V8 coverage)
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
| `unit/CreateOrderUseCase` | PENDING orders, persistence through the port, quantity rules, no save on invalid input, repository failures |
| `unit/*.schema` | Zod rules and messages for orders, register and login (UUIDs, positive integers, email normalization, password length) |
| `unit/JwtAuthGuard` | Valid token → `req.user`; missing, malformed, forged and expired tokens → `401` |
| `unit/ScryptPasswordHasher`, `unit/RegisterUserUseCase` | Hash format, random salt, verification, duplicate emails |
| `integration/OrderController` | `201`, userId taken from the JWT, `400`, `401`, `500` without leaking details, and the **Redis lock**: `429` on repeat, scoped per user + product, 3s TTL, released after expiry (fake timers) |
| `integration/AuthController` | `/auth/register` (`201`/`400`/`409`) and `/auth/login` |
| `integration/Swagger` | Docs served, every endpoint and status code documented, Zod-derived bodies, Bearer security |

> ⚠️ **Known issue:** `unit/OrderController.concurrency` is marked `it.fails`. The Redis lock is a `GET` followed by a separate `SET`, so truly simultaneous identical requests all get through (10/10 in the test). It will be fixed with an atomic `SET NX EX`; then the test flips to `it`.

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

### 3. Create Order (Protected Route)
Creates an order in PostgreSQL. Requires a valid Bearer token, checked by `JwtAuthGuard` (the `userId` is extracted from the JWT to prevent identity spoofing). A Redis lock rejects repeated orders for the same user and product within 3 seconds with `429 Too Many Requests`. Responses: `201`, `400` (field errors in `details`), `401`, `429`.
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

---

## 📄 License
MIT © Jorge Diego Daniel Azpeitia