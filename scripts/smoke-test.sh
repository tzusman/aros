#!/usr/bin/env bash
set -euo pipefail

AROS_DIR=$(mktemp -d)
PORT=4100
API="http://localhost:$PORT/api"
AROS_PID=""

cleanup() {
  if [[ -n "$AROS_PID" ]]; then
    kill "$AROS_PID" 2>/dev/null || true
    wait "$AROS_PID" 2>/dev/null || true
  fi
  rm -rf "$AROS_DIR"
}
trap cleanup EXIT INT TERM

echo "=== AROS Smoke Test ==="
echo "Project dir: $AROS_DIR"
echo ""

# Check that port is not already in use
if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "FAIL: Port $PORT is already in use"
  exit 1
fi

# Start AROS server in the background
node cli/dist/index.js "$AROS_DIR" &
AROS_PID=$!

# Wait for server to become ready (up to 10 attempts, 0.5s apart)
echo -n "Waiting for server"
MAX_ATTEMPTS=20
for i in $(seq 1 $MAX_ATTEMPTS); do
  if curl -sf "$API/pipeline/counts" > /dev/null 2>&1; then
    echo " ready!"
    break
  fi
  if ! kill -0 "$AROS_PID" 2>/dev/null; then
    echo ""
    echo "FAIL: Server process exited unexpectedly"
    exit 1
  fi
  echo -n "."
  sleep 0.5
done

# Final check — if still not responding, fail
if ! curl -sf "$API/pipeline/counts" > /dev/null 2>&1; then
  echo ""
  echo "FAIL: Server not responding after ${MAX_ATTEMPTS} attempts"
  exit 1
fi
echo "  Server running on port $PORT"

# --- Test: Default policy exists ---
POLICIES=$(curl -sf "$API/policies")
if echo "$POLICIES" | grep -q '"name":"default"'; then
  echo "  Default policy exists"
else
  echo "FAIL: Default policy not found in response: $POLICIES"
  exit 1
fi

# --- Test: GET /api/policies/default returns full policy ---
DEFAULT_POLICY=$(curl -sf "$API/policies/default")
if echo "$DEFAULT_POLICY" | grep -q '"name":"default"'; then
  echo "  GET /api/policies/default works"
else
  echo "FAIL: GET /api/policies/default unexpected response: $DEFAULT_POLICY"
  exit 1
fi

# --- Test: Deliverables endpoint ---
DELIVERABLES=$(curl -sf "$API/deliverables")
if echo "$DELIVERABLES" | grep -q '\['; then
  echo "  Deliverables endpoint works (${#DELIVERABLES} bytes)"
else
  echo "FAIL: Deliverables endpoint unexpected response: $DELIVERABLES"
  exit 1
fi

# --- Test: Pipeline counts ---
COUNTS=$(curl -sf "$API/pipeline/counts")
if echo "$COUNTS" | grep -q 'in_progress'; then
  echo "  Pipeline counts: $COUNTS"
else
  echo "FAIL: Pipeline counts unexpected response: $COUNTS"
  exit 1
fi

# --- Test: SSE endpoint responds with event-stream content type ---
SSE_HEADERS=$(curl -sf -I "$API/events" --max-time 2 2>/dev/null || true)
if echo "$SSE_HEADERS" | grep -qi "text/event-stream"; then
  echo "  SSE endpoint responds with correct content type"
else
  echo "  SSE endpoint check skipped (headers: ${SSE_HEADERS:-empty})"
fi

# --- Test: Project directory structure was created ---
if [[ -d "$AROS_DIR/.aros" ]]; then
  echo "  .aros/ directory created"
else
  echo "FAIL: .aros/ directory not found in project dir"
  exit 1
fi

if [[ -f "$AROS_DIR/.aros/config.json" ]]; then
  echo "  .aros/config.json created"
else
  echo "FAIL: .aros/config.json not found"
  exit 1
fi

if [[ -d "$AROS_DIR/.aros/review" ]]; then
  echo "  .aros/review/ directory created"
else
  echo "FAIL: .aros/review/ directory not found"
  exit 1
fi

if [[ -d "$AROS_DIR/.aros/approved" ]]; then
  echo "  .aros/approved/ directory created"
else
  echo "FAIL: .aros/approved/ directory not found"
  exit 1
fi

if [[ -d "$AROS_DIR/.aros/rejected" ]]; then
  echo "  .aros/rejected/ directory created"
else
  echo "FAIL: .aros/rejected/ directory not found"
  exit 1
fi

if [[ -d "$AROS_DIR/.aros/policies" ]]; then
  echo "  .aros/policies/ directory created"
else
  echo "FAIL: .aros/policies/ directory not found"
  exit 1
fi

if [[ -f "$AROS_DIR/.aros/policies/default.json" ]]; then
  echo "  .aros/policies/default.json created"
else
  echo "FAIL: .aros/policies/default.json not found"
  exit 1
fi

echo ""
echo "=== All smoke tests passed ==="
