#!/usr/bin/env bash
# Dry-run tests for ocr-merge-hold.sh. No network: feeds label/timeline
# fixtures shaped like the REST API responses. Run: bash .github/scripts/test-ocr-merge-hold.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

BOT='{"login":"wyre-ai-conduit-ocr-reviewer[bot]","type":"Bot"}'
HUMAN='{"login":"asachs01","type":"User"}'
ev() { # event actor [label]
  if [[ -n "${3:-}" ]]; then
    printf '{"event":"%s","actor":%s,"created_at":"2026-10-10T01:00:00Z","label":{"name":"%s"}}' "$1" "$2" "$3"
  else
    printf '{"event":"%s","actor":%s,"created_at":"2026-10-10T01:00:00Z"}' "$1" "$2"
  fi
}

check() { # name expected labels_json timeline_json
  local name="$1" want="$2"
  printf '%s' "$3" >"$tmp/labels.json"; printf '%s' "$4" >"$tmp/timeline.json"
  local out got
  out="$(LABELS_FILE="$tmp/labels.json" TIMELINE_FILE="$tmp/timeline.json" GITHUB_OUTPUT="$tmp/out" PR_NUMBER=1 bash "$here/ocr-merge-hold.sh")"
  got="$(sed -n 's/^hold=//p' <<<"$out" | head -1)"
  if [[ "$got" == "$want" ]] && grep -qx "hold=$want" "$tmp/out"; then
    pass=$((pass + 1)); echo "ok   - $name"
  else
    fail=$((fail + 1)); echo "FAIL - $name (want hold=$want)"; echo "$out" | sed 's/^/       /'
  fi
  rm -f "$tmp/out"
}

check "no labels, empty timeline"                false '[]' '[]'
check "hold label"                               true  '[{"name":"hold"}]' '[]'
check "do-not-merge label (case-insensitive)"    true  '[{"name":"Do-Not-Merge"}]' '[]'
check "unrelated label"                          false '[{"name":"bug"}]' '[]'
check "bot arms auto-merge only"                 false '[]' "[$(ev auto_squash_enabled "$BOT")]"
check "human disables, bot re-arms (PR #2081)"   true  '[]' \
  "[$(ev auto_squash_enabled "$BOT"),$(ev auto_merge_disabled "$HUMAN"),$(ev auto_squash_enabled "$BOT")]"
check "bot disables auto-merge"                  false '[]' "[$(ev auto_merge_disabled "$BOT")]"
check "system disable with null actor"           false '[]' '[{"event":"auto_merge_disabled","actor":null}]'
check "human disables, human re-enables"         false '[]' \
  "[$(ev auto_merge_disabled "$HUMAN"),$(ev auto_squash_enabled "$HUMAN")]"
check "human disables, human re-enables (merge)" false '[]' \
  "[$(ev auto_merge_disabled "$HUMAN"),$(ev auto_merge_enabled "$HUMAN")]"
check "human disables, hold label removed"       false '[]' \
  "[$(ev auto_merge_disabled "$HUMAN"),$(ev labeled "$HUMAN" hold),$(ev unlabeled "$HUMAN" hold)]"
check "human disables, unrelated label removed"  true  '[]' \
  "[$(ev auto_merge_disabled "$HUMAN"),$(ev unlabeled "$HUMAN" bug)]"
check "re-enabled, then disabled again by human" true  '[]' \
  "[$(ev auto_merge_disabled "$HUMAN"),$(ev auto_squash_enabled "$HUMAN"),$(ev auto_merge_disabled "$HUMAN")]"
check "bot-suffixed User login is not human"     false '[]' \
  "[$(ev auto_merge_disabled '{"login":"some-app[bot]","type":"User"}')]"
check "hold label wins over human re-enable"     true  '[{"name":"hold"}]' \
  "[$(ev auto_merge_disabled "$HUMAN"),$(ev auto_squash_enabled "$HUMAN")]"
check "hold label with whitespace and case"     true  '[{"name":"  Hold  "}]' '[]'
check "actor present but empty"                  true  '[]' '[{"event":"auto_merge_disabled","actor":{}}]'
check "actor login with [bot] in caps type"      false '[]' \
  "[$(ev auto_merge_disabled '{"login":"x[bot]","type":"BOT"}')]"
check "malformed timeline fails closed"          true  '[]' 'not json'

echo "# $pass passed, $fail failed"
[[ $fail -eq 0 ]]
