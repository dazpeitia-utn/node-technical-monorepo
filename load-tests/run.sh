#!/usr/bin/env bash
# Runs the flash sale load test and then cross-checks the results against PostgreSQL.
#
#   ./load-tests/run.sh                         # against http://localhost:3000
#   RUN_LABEL=my-run SPAM_VUS=100 ./load-tests/run.sh
#
# Uses a local `k6` binary if installed, otherwise the official Docker image.
set -uo pipefail

cd "$(dirname "$0")"

RUN_LABEL="${RUN_LABEL:-latest}"
API_URL="${API_URL:-http://localhost:3000}"
K6_IMAGE="${K6_IMAGE:-grafana/k6:2.4.0}"
mkdir -p results

# Forward only the knobs that were set.
K6_ENV=(-e "RUN_LABEL=$RUN_LABEL" -e "RESULTS_DIR=results")
for name in BURST_USERS SPAM_VUS SPAM_SECONDS PRODUCT_ID; do
  if [ -n "${!name:-}" ]; then K6_ENV+=(-e "$name=${!name}"); fi
done

if command -v k6 >/dev/null 2>&1 && [ -z "${USE_DOCKER:-}" ]; then
  k6 run "${K6_ENV[@]}" -e "BASE_URL=$API_URL" flash-sale-load-test.js
else
  # Inside the container, the host is reachable as host.docker.internal.
  DOCKER_URL="${API_URL/localhost/host.docker.internal}"
  DOCKER_URL="${DOCKER_URL/127.0.0.1/host.docker.internal}"
  docker run --rm -i \
    --add-host=host.docker.internal:host-gateway \
    -v "$PWD:/scripts" -w /scripts \
    "$K6_IMAGE" run "${K6_ENV[@]}" -e "BASE_URL=$DOCKER_URL" flash-sale-load-test.js
fi
K6_EXIT=$?

if [ -f "results/$RUN_LABEL.json" ]; then
  node verify-db.mjs "results/$RUN_LABEL.json" || K6_EXIT=1
fi

# k6 exits with 99 when a threshold fails.
exit $K6_EXIT
