#!/usr/bin/env bash
# Decide whether ocr-review must skip its Approve + auto-merge arming steps.
#
# Holds (either one is enough):
#   (a) the PR carries a `hold` or `do-not-merge` label;
#   (b) a human disabled auto-merge (timeline `auto_merge_disabled` whose actor
#       is a User, not a bot), and since then no human has re-enabled it
#       (`auto_merge_enabled` / `auto_squash_enabled` / `auto_rebase_enabled`
#       by a User) and no `hold` / `do-not-merge` label has been removed.
#       Bot re-arms (the OCR app's own `auto_squash_enabled`) never clear it —
#       that re-arm on every push is exactly what this guards against.
#       Events are replayed sorted by created_at (tie-break: event id, then
#       API position), so the latest human action wins regardless of the
#       order the timeline API returns them in.
#
# The OCR review comments are posted by an earlier step and are unaffected.
#
# Live mode:  REPO=owner/name PR_NUMBER=123 GH_TOKEN=... ocr-merge-hold.sh
# Test mode:  LABELS_FILE=labels.json TIMELINE_FILE=timeline.json ocr-merge-hold.sh
#   (labels.json = GET issues/{n}/labels, timeline.json = GET issues/{n}/timeline)
#
# Writes hold=true|false and reason=... to $GITHUB_OUTPUT (when set) and
# prints them to stdout. Any failure to read labels/timeline fails CLOSED
# (hold=true) so an API hiccup can never approve or arm a held PR.
set -uo pipefail

PR_LABEL="PR #${PR_NUMBER:-?}"

emit() {
  local hold="$1" reason="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    { echo "hold=${hold}"; echo "reason=${reason}"; } >>"$GITHUB_OUTPUT"
  fi
  echo "hold=${hold}"
  echo "reason=${reason}"
  if [[ "$hold" == "true" ]]; then
    echo "::notice title=ocr-review merge hold::Skipping approve and auto-merge for ${PR_LABEL}: ${reason}"
  else
    echo "ocr-review: no merge hold on ${PR_LABEL}; approve and auto-merge may proceed."
  fi
  exit 0
}

command -v jq >/dev/null 2>&1 || emit true "jq is not installed on the runner (fail closed)"

if [[ -n "${LABELS_FILE:-}" || -n "${TIMELINE_FILE:-}" ]]; then
  labels_json="$(cat "${LABELS_FILE:-/dev/null}" 2>/dev/null)" || emit true "could not read labels fixture (fail closed)"
  timeline_json="$(cat "${TIMELINE_FILE:-/dev/null}" 2>/dev/null)" || emit true "could not read timeline fixture (fail closed)"
  [[ -n "$labels_json" ]] || labels_json='[]'
  [[ -n "$timeline_json" ]] || timeline_json='[]'
else
  command -v gh >/dev/null 2>&1 || emit true "gh is not installed on the runner (fail closed)"
  : "${REPO:?REPO is required}" "${PR_NUMBER:?PR_NUMBER is required}"
  # --paginate emits one JSON array per page; jq -s 'add' joins them.
  labels_json="$(gh api --paginate "repos/${REPO}/issues/${PR_NUMBER}/labels?per_page=100" | jq -s 'add // []')" \
    || emit true "could not read PR labels from the API (fail closed)"
  timeline_json="$(gh api --paginate "repos/${REPO}/issues/${PR_NUMBER}/timeline?per_page=100" | jq -s 'add // []')" \
    || emit true "could not read PR timeline from the API (fail closed)"
fi

decision="$(jq -n -r \
  --argjson labels "$labels_json" \
  --argjson timeline "$timeline_json" '
  def hold_labels: ["hold", "do-not-merge"];
  def norm: (. // "") | tostring | gsub("^\\s+|\\s+$"; "") | ascii_downcase;
  def is_hold_label: norm as $n | hold_labels | index($n) != null;
  def human:
    (.actor | type) == "object"
    and ((.actor.type // "User") | norm) != "bot"
    and ((.actor.login // "") | norm | endswith("[bot]") | not);

  ($labels | map(.name) | map(select(is_hold_label))) as $held
  | if ($held | length) > 0 then
      "true\tlabel \($held | join(", ")) is set"
    else
      # Replay in chronological order, not API order: sort by created_at,
      # then numeric event id, then original position (sort_by is stable).
      # Events without created_at sort first, so they never override a
      # dated human action.
      ($timeline
        | to_entries
        | map(.value + {_pos: .key})
        | sort_by([(.created_at // ""), ((.id // -1) | tonumber? // -1), ._pos])
      ) as $ordered
      | (reduce $ordered[] as $e ({held: false};
        if $e.event == "auto_merge_disabled" and ($e | human) then
          {held: true, by: $e.actor.login, at: $e.created_at}
        elif ($e.event | IN("auto_merge_enabled", "auto_squash_enabled", "auto_rebase_enabled")) and ($e | human) then
          {held: false}
        elif $e.event == "unlabeled" and ($e.label.name | is_hold_label) then
          {held: false}
        else . end)) as $s
      | if $s.held then
          "true\tauto-merge was disabled by \($s.by) at \($s.at) and has not been re-enabled by a human"
        else
          "false\tno hold label and auto-merge not disabled by a human"
        end
    end
')" || emit true "could not evaluate labels/timeline (fail closed)"

emit "${decision%%$'\t'*}" "${decision#*$'\t'}"
