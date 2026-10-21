import { z } from 'zod';
import { AppError } from '../../platform/errors.js';

export const HealthThresholds = z.object({
  staleAfterDays: z.number().int().positive(),
  maxOpenPulls: z.number().int().positive(),
});
export type HealthThresholds = z.infer<typeof HealthThresholds>;

export interface RepoHealth {
  repoId: string;
  openPulls: number;
  stalePulls: number;
  lastPolledAt: Date | null;
  status: 'healthy' | 'busy' | 'stale';
}

export class RepoNotPolledError extends AppError {
  constructor() {
    super('repo_not_polled', 'Repository has never been polled', 409);
  }
}

export function assessHealth(
  input: { repoId: string; openedAt: (Date | null)[]; lastPolledAt: Date | null; now: Date },
  rawThresholds: unknown,
): RepoHealth {
  const thresholds = HealthThresholds.parse(rawThresholds);
  const staleMs = thresholds.staleAfterDays * 24 * 60 * 60 * 1000;
  const stalePulls = input.openedAt.filter((d) => d !== null && input.now.getTime() - d.getTime() > staleMs).length;
  const openPulls = input.openedAt.length;
  const status = stalePulls > 0 ? 'stale' : openPulls > thresholds.maxOpenPulls ? 'busy' : 'healthy';
  return { repoId: input.repoId, openPulls, stalePulls, lastPolledAt: input.lastPolledAt, status };
}
