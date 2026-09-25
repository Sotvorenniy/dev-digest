# References

## Sources

- **The learnings-loop pattern** — the seven-section schema, the wrap-up flow,
  the vague-vs-useful bar, and the trigger tradeoffs:
  `mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up`
- **Session lifecycle hooks** — why a Stop hook is what makes capture dependable:
  `mindstudio.ai/blog/compounding-knowledge-loop-claude-code`
- **Skill authoring** — frontmatter limits, progressive disclosure, degrees of
  freedom, evaluation-driven development:
  `platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices`
- **How skills are used at Anthropic** — skills as folders of scripts and
  resources, dynamic hooks, and *"the highest-signal content in any skill is the
  Gotchas section"*:
  `claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/`
- **A comparable implementation** — `glebis/claude-skills`, the `retrospective`
  skill. The depth check, the ranked five-candidate cap, and the
  single-multi-select approval are adapted from it.

## Design decisions worth remembering

**Why `INSIGHTS.md` and not `LEARNINGS.md`.** The source material names
`LEARNINGS.md`. This repo already ships `<pkg>/INSIGHTS.md` and every `CLAUDE.md`
routes to it, so the read side was already wired. Adding a second file would have
meant two places to look.

**Why no `.claude/commands/wrap-up.md`.** The article predates user-invocable
skills. `/engineering-insights` already works; a command file would be a second
copy of the same instructions to keep in sync.

**Why the dedup check is a script.** A deterministic detector beats model
judgment for a mechanical comparison, and it costs no context.

**Why the cap is 40 entries, not 200.** Phase 0 reads the whole file every
session, so length is a running cost rather than mere clutter. These are also
per-package files in a small repo, not one global file.

---

## L06 — the Stop hook

**Do not enable yet.** This is the Export-to-CI / automation lesson's payload.

Today the skill fires from its description plus a manual
`/engineering-insights`. That is honest but unreliable — if capture needs a human
trigger, it does not happen consistently enough to compound. A `Stop` hook fires
when the session ends, with no human in the loop.

Create `.claude/settings.json` (it does not exist yet) with:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/skills/engineering-insights/scripts/wrap-up-trigger.sh"
          }
        ]
      }
    ]
  }
}
```

`wrap-up-trigger.sh` does not exist yet either — writing it is part of the
lesson. It should run Phase 2's depth check and exit silently when the session
was shallow, so an always-on hook stays quiet most of the time.

### Why not a skill-registered dynamic hook

A skill can register hooks that live only while it is active. Anthropic's stated
use for those is *situational* constraints — `/careful` blocking `rm -rf` and
force-push, `/freeze` blocking edits outside a directory — where *"you only want
this when you know you're touching prod; having it always on would drive you
insane."*

Capture is the opposite: it should always be on. So L06 belongs in
`settings.json`, not in the skill.