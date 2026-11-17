#!/usr/bin/env node
/**
 * Cross-checks a k6 run against PostgreSQL: the number of orders actually stored must match
 * the number of 201 responses, and the spam user must not have more orders than the lock allows.
 * Appends a `dbVerification` block to the results JSON.
 *
 *   node load-tests/verify-db.mjs load-tests/results/<label>.json
 *
 * Reads the DB through `docker exec <PG_CONTAINER> psql` (docker-compose defaults).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node verify-db.mjs <results.json>');
  process.exit(2);
}

const PG_CONTAINER = process.env.PG_CONTAINER || 'flash_sale_postgres';
const PG_USER = process.env.PG_USER || 'postgres';
const PG_DB = process.env.PG_DB || 'flash_sale_db';

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

const spamOrdersInDb = scalar(`SELECT count(*) FROM orders WHERE user_id = '${result.setup.spamUserId}'`);
const burstOrdersInDb = scalar(
  `SELECT count(*) FROM orders o JOIN users u ON u.id = o.user_id WHERE u.email LIKE '${result.setup.runId}-burst-%'`,
);
const burstUsersWithDuplicates = scalar(
  `SELECT count(*) FROM (SELECT o.user_id FROM orders o JOIN users u ON u.id = o.user_id
     WHERE u.email LIKE '${result.setup.runId}-burst-%' GROUP BY o.user_id HAVING count(*) > 1) d`,
);

const { many_users_burst: burst, same_user_spam: spam } = result.scenarios;
const checks = {
  'burst: orders in DB == 201 responses': burstOrdersInDb === burst.created201,
  'burst: no user has duplicate orders': burstUsersWithDuplicates === 0,
  'spam: orders in DB == 201 responses': spamOrdersInDb === spam.created201,
  [`spam: orders in DB <= ${result.config.maxSpamOrdersAllowed} (one per lock window)`]:
    spamOrdersInDb <= result.config.maxSpamOrdersAllowed,
};

result.dbVerification = { spamOrdersInDb, burstOrdersInDb, burstUsersWithDuplicates, checks };
result.dbVerification.passed = Object.values(checks).every(Boolean);
writeFileSync(file, JSON.stringify(result, null, 2) + '\n');

console.log('=== PostgreSQL cross-check ===');
console.log(`spam user orders in DB:  ${spamOrdersInDb} (k6 saw ${spam.created201}×201)`);
console.log(`burst orders in DB:      ${burstOrdersInDb} (k6 saw ${burst.created201}×201)`);
for (const [name, ok] of Object.entries(checks)) console.log(`  ${ok ? '✓' : '✗'} ${name}`);
console.log(`DB VERIFICATION: ${result.dbVerification.passed ? 'PASS' : 'FAIL'}\n`);

process.exit(result.dbVerification.passed ? 0 : 1);
