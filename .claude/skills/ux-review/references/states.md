# UI state matrix

Walk every row for each surface (page, panel, dialog, popover) and each async action
(import, run review, save agent, sync). A state the design does not show is a gap.

| State | Question to answer | Typical expected behaviour |
|---|---|---|
| Empty — first use | What does the user see before any data exists? | `EmptyState` with one sentence and the primary action |
| Empty — filtered | What if a filter or search matches nothing? | say the filter matched nothing; offer "clear filters" |
| Loading — first load | What shows while data loads? | `Skeleton` in the final layout shape; no layout jump |
| Loading — refresh | What shows when data reloads in the background? | keep old data visible; a small, non-blocking indicator |
| In progress — long action | Review runs, indexing, import: what shows while it runs? | progress or Live Log, a way to leave and come back, no double start |
| Success | How does the user know it worked? | visible result or toast; focus moves to the result if the view changed |
| Error — recoverable | Network error, 5xx, timeout | `ErrorState` or inline error with what happened and a retry |
| Error — validation | Bad input | message next to the field, linked to it; input kept |
| Rate-limited (429) | Review runs, intent: 10/min; settings: 20/min; global 120/min | say it is a limit, show when to retry, disable the action until then |
| Dependency down | Model provider, GitHub, Postgres unavailable | degraded result with the reason, or an error that names the dependency |
| No API key / not configured | Feature needs a secret or setting the user has not set | explain and link to the settings section; no stack trace |
| Partial data | Some files, findings or agents failed | show what succeeded and list what failed |
| Not found | Deleted repo, PR or agent; stale link | `repo-not-found`-style page with a way back |
| Long content | Long titles, paths, finding text, model output | truncation with full text available (tooltip or expand); no overflow or clipping |
| Many items | 100+ PRs, 500+ findings, many agents | paging or virtualisation, sorting, filter; stated limit |
| Stale data | Data changed on GitHub or in another tab | show the last update time or refresh on focus; resolve conflicts on save |
| Concurrency | Double click, two tabs, run while a run is active | one effect only; the second attempt is disabled or told why |
| Destructive action | Delete agent, skill, repo | `confirm-dialog` naming the object; undo when possible |
| Unsaved changes | Leaving an editor with edits | warn before losing input |
| Narrow viewport | Small window or zoom 200% | content reflows; nothing hidden behind horizontal scroll |

## Per async action, always state
- the trigger and who may start it;
- what is disabled while it runs;
- the success signal;
- each failure signal (validation, 4xx, 429, 5xx, timeout, dependency down);
- whether it is safe to retry, and what a retry does.
