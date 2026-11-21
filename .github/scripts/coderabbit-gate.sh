#!/usr/bin/env bash
# Decide the CodeRabbit merge gate for one PR head. Exit 0 = pass, 1 = fail.
# Needs GH_TOKEN, REPO, PR_NUMBER, HEAD_SHA. Read-only API calls.
set -euo pipefail
latest=$(gh api --paginate "repos/${REPO}/pulls/${PR_NUMBER}/reviews?per_page=100" \
  | jq -s -c '[.[][] | select(.user.login == "coderabbitai[bot]")
                | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED")]
              | sort_by(.submitted_at) | last // {}')
state=$(jq -r '.state // "none"' <<<"$latest")
commit=$(jq -r '.commit_id // ""' <<<"$latest")
echo "PR #${PR_NUMBER} head ${HEAD_SHA}; latest CodeRabbit decision: ${state} on ${commit:-n/a}"
if [[ "$state" == "APPROVED" && "$commit" == "$HEAD_SHA" ]]; then
  GATE_SUMMARY="CodeRabbit approved the head commit ${HEAD_SHA:0:8}."
  echo "$GATE_SUMMARY"; echo "summary=$GATE_SUMMARY" >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
fi
if [[ "$state" == "APPROVED" ]]; then
  GATE_SUMMARY="CodeRabbit approved ${commit:0:8}, not the head ${HEAD_SHA:0:8}. It must review and approve the final commit (comment '@coderabbitai review' if it has not started)."
elif [[ "$state" == "CHANGES_REQUESTED" ]]; then
  GATE_SUMMARY="CodeRabbit's latest review requests changes. Resolve its threads so it approves the head commit."
else
  GATE_SUMMARY="CodeRabbit has not approved this PR. It may be rate limited; comment '@coderabbitai review' once the limit clears."
fi
echo "::error title=CodeRabbit gate::${GATE_SUMMARY}"
echo "summary=$GATE_SUMMARY" >> "${GITHUB_OUTPUT:-/dev/null}"
exit 1
