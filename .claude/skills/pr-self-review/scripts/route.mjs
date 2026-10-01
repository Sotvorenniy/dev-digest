#!/usr/bin/env node
// Routes changed files to review skills using routing.json. Deterministic — the
// model never decides which skill sees which file.
//   node route.mjs            → JSON plan on stdout (snapshot + routing)
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILL_DIR, addedLines, collect, matchesAny, readJson } from './lib.mjs';

export const loadRouting = () => readJson(join(SKILL_DIR, 'routing.json'));

/**
 * @param files
 * @param added   {path: string[]}  — added lines, for content triggers
 * @param routing
 * @returns {skills: {skill: path[]}, not_covered: path[], excluded: path[]}
 */
export function route(files, added, routing = loadRouting()) {
  const skills = {};
  const notCovered = [];
  const excluded = [];
  const triggers = new Map(
    routing.rules.map((r) => [r, (r.contentTriggers ?? []).map((t) => new RegExp(t))]),
  );

  for (const { path, status } of files) {
    if (status === 'D') continue;
    if (matchesAny(path, routing.exclude)) {
      excluded.push(path);
      continue;
    }
    let hit = false;
    for (const rule of routing.rules) {
      const byGlob = matchesAny(path, rule.globs);
      const byContent =
        !byGlob &&
        matchesAny(path, rule.triggerGlobs) &&
        (added[path] ?? []).some((line) => triggers.get(rule).some((re) => re.test(line)));
      if (byGlob || byContent) {
        (skills[rule.skill] ??= []).push(path);
        hit = true;
      }
    }
    if (!hit) notCovered.push(path);
  }
  return { skills, not_covered: notCovered, excluded };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snapshot = collect();
  const plan = route(snapshot.files, addedLines(snapshot));
  process.stdout.write(JSON.stringify({ ...snapshot, ...plan }, null, 2) + '\n');
}
