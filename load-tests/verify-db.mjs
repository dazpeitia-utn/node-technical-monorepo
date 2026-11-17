#!/usr/bin/env node
/**
 * Cross-checks a k6 run against PostgreSQL: the number of orders actually stored must match
 * the number of accepted responses (201/202), every one CONFIRMED, and the spam user must not
 * have more orders than the lock allows.
 *
 * With the BullMQ queue (202), orders are written by the background worker, so this script
 * polls until they have all been processed (or DRAIN_TIMEOUT_SECONDS passes) and records how
 * long that took after k6 finished (`drainSeconds`): the queue's processing lag.
 * Appends a `dbVerification` block to the results JSON.
 *
 *   node load-tests/verify-db.mjs load-tests/results/<label>.json
 *
 * Reads the DB through `docker exec <PG_CONTAINER> psql` (docker-compose defaults).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const file = process.argv[2];
if (!file) {
  console.error('usage: node verify-db.mjs <results.json>');
  process.exit(2);
}

const PG_CONTAINER = process.env.PG_CONTAINER || 'flash_sale_postgres';
const PG_USER = process.env.PG_USER || 'postgres';
const PG_DB = process.env.PG_DB || 'flash_sale_db';
const DRAIN_TIMEOUT_SECONDS = Number(process.env.DRAIN_TIMEOUT_SECONDS || 120);

const result = JSON.parse(readFileSync(file, 'utf8'));
if (!result.setup) {
  console.error('verify-db: results have no setup data (setup failed?), skipping.');
  process.exit(1);
}

const UUID = /^[0-9a-f-]{36}$/;
const RUN_ID = /^k6-\d+$/;
if (!UUID.test(result.setup.spamUserId) || !RUN_ID.test(result.setup.runId)) {
  console.error('verify-db: unexpected ids in results file, refusing to query.');
  process.exit(1);
}

function scalar(sql) {
  const out = execFileSync('docker', ['exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-tAc', sql], {
    encoding: 'utf8',
  });
  return Number(out.trim());
}

const burstUsers = `SELECT id FROM users WHERE email LIKE '${result.setup.runId}-burst-%'`;
const spamUser = `'${result.setup.spamUserId}'`;

function snapshot() {
  return {
    spamOrdersInDb: scalar(`SELECT count(*) FROM orders WHERE user_id = ${spamUser}`),
    burstOrdersInDb: scalar(`SELECT count(*) FROM orders WHERE user_id IN (${burstUsers})`),
    notConfirmed: scalar(
      `SELECT count(*) FROM orders WHERE status <> 'CONFIRMED' AND (user_id = ${spamUser} OR user_id IN (${burstUsers}))`,
    ),
    burstUsersWithDuplicates: scalar(
      `SELECT count(*) FROM (SELECT user_id FROM orders WHERE user_id IN (${burstUsers}) GROUP BY user_id HAVING count(*) > 1) d`,
    ),
  };
}

// Results from before the queue used `created201`; newer ones use `accepted`.
const accepted = (scenario) => scenario.accepted ?? scenario.created201;
const { many_users_burst: burst, same_user_spam: spam } = result.scenarios;
const expected = { spam: accepted(spam), burst: accepted(burst) };

// Wait for the worker to drain the queue (instant for the synchronous API).
const start = Date.now();
let db = snapshot();
while (
  (db.spamOrdersInDb < expected.spam || db.burstOrdersInDb < expected.burst || db.notConfirmed > 0) &&
  Date.now() - start < DRAIN_TIMEOUT_SECONDS * 1000
) {
  await sleep(250);
  db = snapshot();
}
const drainSeconds = (Date.now() - start) / 1000;

const checks = {
  'burst: orders in DB == accepted responses': db.burstOrdersInDb === expected.burst,
  'burst: no user has duplicate orders': db.burstUsersWithDuplicates === 0,
  'spam: orders in DB == accepted responses': db.spamOrdersInDb === expected.spam,
  [`spam: orders in DB <= ${result.config.maxSpamOrdersAllowed} (one per lock window)`]:
    db.spamOrdersInDb <= result.config.maxSpamOrdersAllowed,
  'every order ended CONFIRMED': db.notConfirmed === 0,
};

result.dbVerification = { ...db, drainSeconds, checks };
result.dbVerification.passed = Object.values(checks).every(Boolean);
writeFileSync(file, JSON.stringify(result, null, 2) + '\n');

console.log('=== PostgreSQL cross-check ===');
console.log(`spam user orders in DB:  ${db.spamOrdersInDb} (k6 saw ${expected.spam} accepted)`);
console.log(`burst orders in DB:      ${db.burstOrdersInDb} (k6 saw ${expected.burst} accepted)`);
console.log(`not CONFIRMED:           ${db.notConfirmed}`);
console.log(`queue drained in:        ${drainSeconds.toFixed(2)} s after k6 finished`);
for (const [name, ok] of Object.entries(checks)) console.log(`  ${ok ? '✓' : '✗'} ${name}`);
console.log(`DB VERIFICATION: ${result.dbVerification.passed ? 'PASS' : 'FAIL'}\n`);

process.exit(result.dbVerification.passed ? 0 : 1);
