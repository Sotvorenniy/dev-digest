# Usability heuristics (Nielsen), applied to dev-digest

Report only concrete problems with evidence. Each problem becomes a proposal.

| # | Heuristic | Look for in dev-digest |
|---|---|---|
| 1 | Visibility of system status | Review runs and indexing take seconds to minutes: is progress shown (Live Log, progress bar)? Does the PR list show which PRs have a running or finished review? |
| 2 | Match with the real world | Use GitHub and code-review words users know (PR, diff, finding, severity, file, line); avoid internal names (`repo-intel`, `agent_run`). |
| 3 | User control and freedom | Can a running review be cancelled or left? Can a destructive action be undone, or is it confirmed? Can the user leave a drawer or dialog with Escape? |
| 4 | Consistency and standards | Same severity colours and chips (`severity-chips`) everywhere; same empty, error and loading primitives; same position for primary actions. |
| 5 | Error prevention | Disable "Run" without a configured key or agent; validate agent prompts before save; confirm deletes; block double submits. |
| 6 | Recognition rather than recall | Show which agent and model produced a finding; show the file and line next to a finding; keep filters visible. |
| 7 | Flexibility and efficiency | Keyboard shortcuts (`Kbd`) for frequent actions; deep links to a PR, finding or agent; remembered filters. |
| 8 | Aesthetic and minimalist design | Findings first, metadata on demand; no duplicated information; cost and confidence only where they help a decision. |
| 9 | Recognise, diagnose, recover from errors | Error text names the cause (rate limit, missing key, GitHub down) and the next step; never a raw stack trace or raw model output. |
| 10 | Help and documentation | First-use hints on empty states; link to settings when a key is missing; tooltip for score, confidence and severity. |

## Wording rules
- Say what happened, then what to do: "Review limit reached. Try again in 40 s."
- Buttons are verbs that name the result: "Run review", "Import repository", not "OK".
- Same term for the same thing on every screen (finding, not issue/comment/note).
- Numbers carry units and enough precision to be true (a cheap run is not "$0.00").
- Every string has an i18n key in `client/messages/en/<ns>.json`.
