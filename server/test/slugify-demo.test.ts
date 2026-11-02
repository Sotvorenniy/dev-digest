import { describe, expect, it } from 'vitest';
import { slugify } from '../src/demo/index.js';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
});
