import { z } from 'zod';

// Flat primitive params shared by the PR tools. .describe() stays 40-80 chars.
export const repoParam = z
  .string()
  .max(200)
  .describe('GitHub repo as owner/name, as in the git remote (e.g. acme/api)');

export const prParam = z
  .number()
  .int()
  .min(1)
  .max(9_999_999)
  .describe('Pull request number as shown by gh pr list (digits only)');

export const cursorParam = z
  .string()
  .max(10)
  .optional()
  .describe('next_cursor from a previous page; omit to start at the beginning');
