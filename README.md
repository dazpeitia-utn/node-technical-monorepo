# Node Technical Monorepo

> A production-grade TypeScript monorepo built to demonstrate advanced software engineering patterns, strict architectural boundaries, and enterprise practices.

---

## 🏗️ Architecture & Design Principles

This repository serves as a technical sandbox and architectural blueprint implementing **Hexagonal Architecture (Ports & Adapters)**. 

### What is Hexagonal Architecture?
Imagine your application as a secure vault. Hexagonal Architecture (popularized by Alistair Cockburn) ensures that **the core of your business (the Domain)** remains completely independent of the outside world (databases, web frameworks like Express, HTTP libraries, or third-party services).

- **The Domain (The Center):** Contains pure business logic and rules (e.g., `Order` entities, invariant checks). It has no knowledge of Express, SQL, MongoDB, or external frameworks—only pure TypeScript.
- **The Ports (Interfaces):** Act as boundaries or contracts. They define *what* the domain needs (e.g., `IOrderRepository` for saving data) without caring *how* it is implemented.
- **The Adapters (The Outside):** Translate requests between the external world and the core domain:
  - **Inbound Adapters:** Express controllers (`OrderController`, `AuthController`), security middlewares (`authMiddleware`), and Zod validation schemas. They intercept HTTP requests, validate payloads, and trigger use cases.
  - **Outbound Adapters:** Persistence layers, such as the production-ready PostgreSQL/Prisma adapter (`PostgresOrderRepository`).

> **Why this matters in interviews:** If business requirements dictate swapping Express for NestJS, or migrating from PostgreSQL to another database, **not a single line of business logic changes**. You simply write a new adapter.

---

## 🛠️ Tech Stack

- **Monorepo Management:** Turborepo & pnpm Workspaces
- **Automated CI/CD & AI Code Review:** GitHub Actions integrated with Google Gemini API for automated Pull Request code reviews.
- **Language:** TypeScript (Strict Mode)
- **API Framework:** Express.js
- **Authentication:** JSON Web Tokens (JWT) & Stateless Security
- **Validation:** Zod (Fail-fast boundary validation)
- **Database & ORM:** PostgreSQL & Prisma ORM
- **Testing:** Vitest & Supertest (Unit & Integration tests)
- **Containerization:** Docker & Docker Compose

---

## 📁 Monorepo Structure

```text
node-technical-monorepo/
├── apps/
│   └── flash-sale-api/         # E-commerce Flash Sale micro-API (Hexagonal Architecture)
│       ├── prisma/            # Database schema and migrations
│       ├── src/
│       │   ├── application/   # Use cases (Orchestration logic)
│       │   ├── domain/        # Pure business models and rules
│       │   ├── infrastructure/# Inbound (HTTP/Auth/Middlewares) & Outbound (Prisma/DB)
│       │   └── ports/         # Outbound interfaces (Repositories)
│       └── test/              # Unit & Integration test suites
├── packages/                  # Shared packages across apps (future expansions)
├── docker-compose.yml         # Local infrastructure provisioning (PostgreSQL)
├── pnpm-workspace.yaml        # pnpm workspaces configuration
└── turbo.json                 # Turborepo task orchestration pipeline
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- pnpm (`npm install -g pnpm`)
- Docker & Docker Compose

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

3. **Start local infrastructure (PostgreSQL):**
   ```bash
   docker compose up -d
   ```

4. **Run database migrations:**
   ```bash
   cd apps/flash-sale-api
   npx prisma migrate dev --name init_orders_table
   ```

5. **Run tests across the monorepo:**
   ```bash
   pnpm test
   ```

6. **Start the development server:**
   ```bash
   pnpm dev
   ```

---

## 🔒 API Endpoints & Testing

### 1. Authenticate (Get JWT Token)
Sends user credentials to receive a signed JWT access token.
- **POST** `/auth/login`
  ```bash
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "jorge@example.com"}'
  ```

### 2. Create Order (Protected Route)
Creates an order in PostgreSQL. Requires a valid Bearer token (extracted securely to prevent identity spoofing).
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