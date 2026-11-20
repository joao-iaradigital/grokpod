#!/usr/bin/env bash
# Run GrokPod locally with fake data. No accounts, keys or agent host needed.
#   ./demo.sh            serve examples/status.example.json at http://127.0.0.1:8766
#   ./demo.sh pipeline   rebuild site/status.json from the fake index in examples/, then serve
set -euo pipefail
cd "$(dirname "$0")"
if [ "${1:-}" = "pipeline" ]; then
  python3 examples/make_demo_db.py
  GROKPOD_AGENTS_DIR=examples/agents GROKPOD_INDEX_DB=examples/search-index.example.db \
  GROKPOD_SIGNOUTS_JSON=examples/signouts.example.json GROKPOD_ROUTER_LOG=examples/router_log.example.jsonl \
  GROKPOD_SELF_ID=demo-0021 python3 publish_status.py
else
  cp examples/status.example.json site/status.json
fi
echo "GrokPod demo at http://127.0.0.1:${PORT:-8766}  (Ctrl+C to stop)"
cd site && exec python3 -m http.server "${PORT:-8766}" --bind 127.0.0.1
