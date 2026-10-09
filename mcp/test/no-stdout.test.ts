import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const FORBIDDEN = /console\s*\.\s*(log|info)\b|process\s*\.\s*stdout/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

describe('stdout is reserved for the MCP transport', () => {
  it('the forbidden pattern matches what it should (guards against a dead regex)', () => {
    expect(FORBIDDEN.test('console.log(1)')).toBe(true);
    expect(FORBIDDEN.test('console.info(1)')).toBe(true);
    expect(FORBIDDEN.test('process.stdout.write(x)')).toBe(true);
    expect(FORBIDDEN.test('process.stderr.write(x)')).toBe(false);
  });

  it('no src file uses console.log, console.info or process.stdout', () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
