import { NotFoundError } from '../../platform/errors.js';
import type { IntentService } from '../intent/types.js';
import { TRIAGE_PAGE_SIZE } from './constants.js';
import { byPriority, triage, type TriageItem } from './domain.js';
import { INTENT_BUDGET_MS, withTimeout } from './helpers.js';
import type { TriageRepositoryPort } from './ports.js';

export interface TriageDeps {
  repo: TriageRepositoryPort;
  intent: IntentService;
  now?: () => Date;
}

export class TriageService {
  constructor(private readonly deps: TriageDeps) {}

  async queue(workspaceId: string, repoId: string): Promise<TriageItem[]> {
    const { repo, intent } = this.deps;
    if (!(await repo.repoExists(workspaceId, repoId))) throw new NotFoundError('Repository not found');

    const pulls = await repo.listOpenPulls(workspaceId, repoId, TRIAGE_PAGE_SIZE);
    const now = (this.deps.now ?? (() => new Date()))();

    const items = await Promise.all(
      pulls.map(async (p) => {
        const record = await withTimeout(
          intent.get(workspaceId, p.id).then((r) => r.confidence ?? null),
          INTENT_BUDGET_MS,
          null,
        );
        return triage(
          {
            id: p.id,
            number: p.number,
            title: p.title,
            additions: p.additions,
            deletions: p.deletions,
            openedAt: p.openedAt,
            status: p.status,
          },
          record,
          now,
        );
      }),
    );
    return items.sort(byPriority);
  }
}
