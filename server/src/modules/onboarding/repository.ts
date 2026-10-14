import { and, eq } from 'drizzle-orm';
import { OnboardingTour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OnboardingRepoRef, OnboardingRepositoryPort } from './ports.js';

/**
 * `onboarding` table (one jsonb tour per repo, cascade-deleted with the repo) plus
 * the workspace-scoped repo lookup. Implements OnboardingRepositoryPort.
 */
export class OnboardingRepository implements OnboardingRepositoryPort {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  async getTour(repoId: string): Promise<OnboardingTour | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const parsed = OnboardingTour.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async saveTour(repoId: string, tour: OnboardingTour): Promise<void> {
    const generatedAt = new Date(tour.generated_at);
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: tour, generatedAt })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: tour, generatedAt } });
  }
}
