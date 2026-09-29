# API Contract skills

Four plain-markdown skills for the API Contract Reviewer agent. Each one is a body that the app injects into the review prompt under `## Skills / rules`. There is no YAML frontmatter: the import does not parse it. The first line is the skill name and the first sentence is its description.

| File | What it flags |
|---|---|
| `breaking-change.md` | Public contract removed or altered: route/method, required input, field, enum value, status code, auth |
| `response-schema.md` | Response format changes: field rename/retype, nullability, envelope, pagination, error body, casing drift, schema/handler drift |
| `semver-discipline.md` | Breaking change without a MAJOR bump (0.x: MINOR), missing changelog, `/v1` edited in place |
| `deprecation-policy.md` | Silent removal instead of deprecating first (`@deprecated`, `deprecated: true`, `Deprecation`/`Sunset`, replacement, removal date) |

## Import steps
1. Open the **Skills** page, then **Add**, then **Import**, then **From file**.
2. Pick one of the `.md` files from this folder.
3. Check the preview (name from the first line, description from the first sentence).
4. Click **Import**. Repeat for the other three files.
5. Enable each imported skill.
6. Go to **Agents**, open **API Contract**, open the **Skills** tab and attach the skills.

Recommended order: `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`.

## Test PR recipe
Use `sample-breaking-pr.diff` in this folder as the change set (apply it to a scratch branch, or copy its edits by hand). It contains four problems:
1. A removed route (`GET /agents/:id/skills`, deleted).
2. A renamed response field (`default_branch` to `defaultBranch`).
3. A breaking change with no version bump (`package.json` goes 1.4.2 to 1.4.3, no changelog).
4. A removal with no `@deprecated` and no replacement notice.

Control experiment:
- Without skills attached, run the API Contract Reviewer on the PR. Expect little or no flagging of these.
- Attach the four skills and run again. Expect findings for each problem, with CRITICAL for the removed route and renamed field, and a version/deprecation finding.
- Check that a purely additive optional field in the same PR is at most SUGGESTION.
