/**
 * Flash sale load test for apps/flash-sale-api (k6).
 *
 * Two scenarios against POST /orders, all for the SAME productId:
 *   1. many_users_burst – N distinct users (real accounts, real JWTs) each place ONE order at
 *      the same instant. Every one of them must succeed: the lock is per user + product,
 *      so different buyers never block each other.
 *   2. same_user_spam   – M virtual users share ONE account and hammer the endpoint for a while
 *      (double clicks, retries, bots). The Redis lock (SET NX EX 3) must let at most one order
 *      through per 3-second window and answer 429 to the rest.
 *
 * Users are registered in setup() through POST /auth/register, so tokens are real.
 * Results are written by handleSummary() to RESULTS_DIR/<RUN_LABEL>.json.
 *
 * See load-tests/README.md for how to run it.
 */
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

// ---------- Configuration (override with -e NAME=value) ----------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PRODUCT_ID = __ENV.PRODUCT_ID || '123e4567-e89b-12d3-a456-426614174000';
const BURST_USERS = Number(__ENV.BURST_USERS || 200);
const SPAM_VUS = Number(__ENV.SPAM_VUS || 50);
const SPAM_SECONDS = Number(__ENV.SPAM_SECONDS || 10);
const LOCK_TTL_SECONDS = 3;
const RUN_LABEL = __ENV.RUN_LABEL || 'latest';
const RESULTS_DIR = __ENV.RESULTS_DIR || 'results';

// Upper bound of orders one user can legitimately create while spamming:
// one per lock window, plus one for a window boundary at the very end.
const MAX_SPAM_ORDERS = Math.ceil(SPAM_SECONDS / LOCK_TTL_SECONDS) + 1;

// ---------- Custom metrics ----------
const ordersCreated = new Counter('orders_created'); // 201
const ordersBlocked = new Counter('orders_blocked'); // 429 (Redis lock)
const ordersUnexpected = new Counter('orders_unexpected'); // the API answered something else (400/401/5xx)
// The request never got an HTTP answer (status 0: dial/connection timeout). Kept apart from
// API errors: when k6 runs in Docker Desktop, its host proxy drops a few connections at high
// rates (see README), which says nothing about the API.
const transportErrors = new Rate('transport_errors');

// 429 is an expected, correct answer here: don't count it as a failed request.
http.setResponseCallback(http.expectedStatuses(200, 201, 429));

export const options = {
  setupTimeout: '180s',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    many_users_burst: {
      executor: 'per-vu-iterations',
      exec: 'manyUsersBurst',
      vus: BURST_USERS,
      iterations: 1,
      maxDuration: '60s',
    },
    same_user_spam: {
      executor: 'constant-vus',
      exec: 'sameUserSpam',
      vus: SPAM_VUS,
      duration: `${SPAM_SECONDS}s`,
      startTime: '15s', // after the burst has finished, so the two don't skew each other's latency
    },
  },
  thresholds: {
    // Correctness: every response is one of the expected ones.
    checks: ['rate==1.0'],
    orders_unexpected: ['count==0'],
    transport_errors: ['rate<0.01'],
    // Burst: every distinct user gets their order.
    'orders_created{scenario:many_users_burst}': [`count==${BURST_USERS}`],
    'orders_blocked{scenario:many_users_burst}': ['count==0'],
    // Spam: at most one order per lock window, the rest blocked.
    'orders_created{scenario:same_user_spam}': [`count<=${MAX_SPAM_ORDERS}`],
    'orders_blocked{scenario:same_user_spam}': ['count>0'],
    // Performance budgets (local dev machine).
    'http_req_duration{scenario:many_users_burst}': ['p(95)<2000'],
    'http_req_duration{scenario:same_user_spam}': ['p(95)<300'],
    // Declared so the per-scenario counts show up in the summary.
    'http_reqs{scenario:many_users_burst}': ['count>0'],
    'http_reqs{scenario:same_user_spam}': ['count>0'],
  },
};

// ---------- Setup: register real users ----------
function registerUsers(count, prefix) {
  const users = [];
  const BATCH = 25;
  for (let start = 0; start < count; start += BATCH) {
    const requests = [];
    for (let i = start; i < Math.min(start + BATCH, count); i++) {
      requests.push({
        method: 'POST',
        url: `${BASE_URL}/auth/register`,
        body: JSON.stringify({ email: `${prefix}-${i}@loadtest.local`, password: 'load-test-password' }),
        params: { headers: { 'Content-Type': 'application/json' }, tags: { name: 'setup_register' } },
      });
    }
    for (const res of http.batch(requests)) {
      if (res.status !== 201) {
        throw new Error(`setup: register failed with ${res.status}: ${res.body}`);
      }
      const body = res.json();
      users.push({ userId: body.data.id, token: body.accessToken });
    }
  }
  return users;
}

export function setup() {
  const health = http.post(`${BASE_URL}/auth/login`, null, { tags: { name: 'setup_health' } });
  if (health.status !== 200) {
    throw new Error(`API not reachable at ${BASE_URL} (POST /auth/login → ${health.status}). Is the server running?`);
  }

  const runId = `k6-${Date.now()}`;
  const [spamUser] = registerUsers(1, `${runId}-spam`);
  const burstUsers = registerUsers(BURST_USERS, `${runId}-burst`);

  return { runId, spamUser, burstUsers };
}

// ---------- Scenarios ----------
function placeOrder(token) {
  return http.post(`${BASE_URL}/orders`, JSON.stringify({ productId: PRODUCT_ID, quantity: 1 }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    tags: { name: 'POST /orders' },
  });
}

/** Counts the response; returns false if there was no HTTP answer at all (transport error). */
function record(res) {
  const answered = res.status !== 0;
  transportErrors.add(!answered);
  if (!answered) return false;

  if (res.status === 201) ordersCreated.add(1);
  else if (res.status === 429) ordersBlocked.add(1);
  else ordersUnexpected.add(1);
  return true;
}

export function manyUsersBurst(data) {
  // One distinct user per iteration. Note: __VU is global across scenarios (VUs are pooled),
  // so it can't be used as an index here; iterationInTest is unique within this scenario.
  const user = data.burstUsers[exec.scenario.iterationInTest];
  const res = placeOrder(user.token);
  if (!record(res)) return;
  check(res, {
    'burst: every distinct user gets 201': (r) => r.status === 201,
  });
}

export function sameUserSpam(data) {
  const res = placeOrder(data.spamUser.token);
  if (!record(res)) return;
  check(res, {
    'spam: answered 201 or 429 (never 5xx)': (r) => r.status === 201 || r.status === 429,
    'spam: 429 explains the lock': (r) => r.status !== 429 || r.json('error') === 'Too Many Requests',
  });
}

// ---------- Results ----------
function metricValue(data, name, stat) {
  const metric = data.metrics[name];
  return metric && metric.values[stat] !== undefined ? metric.values[stat] : 0;
}

function scenarioResult(data, scenario) {
  const duration = `http_req_duration{scenario:${scenario}}`;
  return {
    requests: metricValue(data, `http_reqs{scenario:${scenario}}`, 'count'),
    created201: metricValue(data, `orders_created{scenario:${scenario}}`, 'count'),
    blocked429: metricValue(data, `orders_blocked{scenario:${scenario}}`, 'count'),
    latencyMs: {
      avg: metricValue(data, duration, 'avg'),
      med: metricValue(data, duration, 'med'),
      p90: metricValue(data, duration, 'p(90)'),
      p95: metricValue(data, duration, 'p(95)'),
      p99: metricValue(data, duration, 'p(99)'),
      max: metricValue(data, duration, 'max'),
    },
  };
}

export function handleSummary(data) {
  const thresholds = {};
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.thresholds) {
      for (const [expr, result] of Object.entries(metric.thresholds)) {
        thresholds[`${name}: ${expr}`] = result.ok;
      }
    }
  }

  const spam = scenarioResult(data, 'same_user_spam');
  const result = {
    label: RUN_LABEL,
    runAt: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      productId: PRODUCT_ID,
      burstUsers: BURST_USERS,
      spamVus: SPAM_VUS,
      spamSeconds: SPAM_SECONDS,
      lockTtlSeconds: LOCK_TTL_SECONDS,
      maxSpamOrdersAllowed: MAX_SPAM_ORDERS,
    },
    setup: data.setup_data
      ? { runId: data.setup_data.runId, spamUserId: data.setup_data.spamUser.userId }
      : null,
    scenarios: {
      many_users_burst: scenarioResult(data, 'many_users_burst'),
      same_user_spam: { ...spam, requestsPerSecond: spam.requests / SPAM_SECONDS },
    },
    unexpectedResponses: metricValue(data, 'orders_unexpected', 'count'),
    transportErrors: {
      count: metricValue(data, 'transport_errors', 'passes'),
      rate: metricValue(data, 'transport_errors', 'rate'),
    },
    checksPassRate: metricValue(data, 'checks', 'rate'),
    thresholds,
    allThresholdsPassed: Object.values(thresholds).every(Boolean),
  };

  const ms = (v) => `${v.toFixed(1)} ms`;
  const b = result.scenarios.many_users_burst;
  const s = result.scenarios.same_user_spam;
  const text = [
    '',
    `=== Flash sale load test: ${RUN_LABEL} ===`,
    `many_users_burst: ${b.requests} requests → ${b.created201}×201, ${b.blocked429}×429 | p95 ${ms(b.latencyMs.p95)}`,
    `same_user_spam:   ${s.requests} requests → ${s.created201}×201 (max allowed ${MAX_SPAM_ORDERS}), ${s.blocked429}×429 | p95 ${ms(s.latencyMs.p95)} | ${s.requestsPerSecond.toFixed(0)} req/s`,
    `unexpected API responses: ${result.unexpectedResponses} | transport errors (no HTTP answer): ${result.transportErrors.count} (${(result.transportErrors.rate * 100).toFixed(3)}%) | checks: ${(result.checksPassRate * 100).toFixed(2)}%`,
    ...Object.entries(thresholds).map(([k, ok]) => `  ${ok ? '✓' : '✗'} ${k}`),
    `RESULT: ${result.allThresholdsPassed ? 'PASS' : 'FAIL'}`,
    `Spam user id (for DB verification): ${result.setup ? result.setup.spamUserId : 'n/a'}`,
    '',
  ].join('\n');

  return {
    stdout: text,
    [`${RESULTS_DIR}/${RUN_LABEL}.json`]: JSON.stringify(result, null, 2),
  };
}
