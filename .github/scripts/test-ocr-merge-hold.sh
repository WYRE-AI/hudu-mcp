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

# --- Workflow wrapper: script is run from the BASE checkout (.ocr-base) ---
# Extract the hold step's run: block from ocr-review.yml and execute it in a
# scratch dir, with and without the base copy of the script.
wf="$here/../workflows/ocr-review.yml"
if [[ -f "$wf" ]]; then
  awk '/id: hold$/ {f=1} f && /^        run: \|/ {r=1; next} r && /^          / {sub(/^          /, ""); print; next} r {exit}' "$wf" >"$tmp/wrapper.sh"
  wrap() { # name expected with_base_script
    local name="$1" want="$2" work="$tmp/work"; rm -rf "$work"; mkdir -p "$work"
    if [[ "$3" == yes ]]; then
      mkdir -p "$work/.ocr-base/.github/scripts"
      cp "$here/ocr-merge-hold.sh" "$work/.ocr-base/.github/scripts/"
      printf '[]' >"$tmp/labels.json"; printf '[]' >"$tmp/timeline.json"
    fi
    local got
    got="$(cd "$work" && LABELS_FILE="$tmp/labels.json" TIMELINE_FILE="$tmp/timeline.json" \
      GITHUB_OUTPUT="$tmp/out" PR_NUMBER=1 bash "$tmp/wrapper.sh" >/dev/null; sed -n 's/^hold=//p' "$tmp/out" | head -1)"
    if [[ "$got" == "$want" ]]; then pass=$((pass + 1)); echo "ok   - $name"
    else fail=$((fail + 1)); echo "FAIL - $name (want hold=$want, got '$got')"; fi
    rm -f "$tmp/out"
  }
  wrap "wrapper: script missing on base fails closed" true no
  grep -q 'ocr-merge-hold.sh is not on the base commit yet' "$tmp/wrapper.sh" \
    && { pass=$((pass + 1)); echo "ok   - wrapper: missing-on-base notice present"; } \
    || { fail=$((fail + 1)); echo "FAIL - wrapper: missing-on-base notice"; }
  wrap "wrapper: runs the base copy when present (no hold -> false)" false yes
  if grep -Eq 'bash \.github/scripts/ocr-merge-hold\.sh' "$wf"; then
    fail=$((fail + 1)); echo "FAIL - workflow must not run the PR head copy of the script"
  else
    pass=$((pass + 1)); echo "ok   - workflow never runs the PR head copy"
  fi
fi

echo "# $pass passed, $fail failed"
[[ $fail -eq 0 ]]
