#!/usr/bin/env bash
# GrokPod refresh: rebuild status.json from the agent host's data and republish ONLY status.json
# (index.html / grokpod.js are hash-matched and skipped by here.now). Idempotent; safe to run from a cron/routine.
# Live inputs: $GROKPOD_INDEX_DB, $GROKPOD_SIGNOUTS_JSON (see config.py / .env.example).
# Cached inputs: score.json (cards/widgets from the last transcript pull), conn_overrides.json.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && { set -a; . ./.env; set +a; }
exec 9>/tmp/grokpod-refresh.lock
flock -w 120 9 || { echo "another refresh is running"; exit 1; }
: "${HERENOW_API_KEY:?HERENOW_API_KEY not set}"
t0=$(date +%s%N)
python3 publish_status.py
python3 herenow.py deploy
# keep it owner-only even if something reset access
mode=$(curl -fsS -H "X-HereNow-Client: grokbot/direct-api" -H "Authorization: Bearer $HERENOW_API_KEY" \
  "https://here.now/api/v1/publish/$(python3 -c 'import json;print(json.load(open("site.json"))["slug"])')/access" \
  | python3 -c 'import json,sys;a=json.load(sys.stdin)["access"];print(a["mode"],len(a["allowedEmails"])+len(a["allowedDomains"]))')
[ "$mode" = "restricted 0" ] || { echo "access was '$mode' -> resetting to owner-only"; python3 herenow.py private; }
echo "refresh done in $(( ($(date +%s%N) - t0) / 1000000 )) ms (access: owner-only)"
