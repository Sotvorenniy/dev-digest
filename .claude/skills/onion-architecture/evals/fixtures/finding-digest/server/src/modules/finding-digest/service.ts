import { NotFoundError } from '../../platform/errors.js';
import { PREVIEW_RATIONALE_CHARS } from '../pulls/constants.js';
import { groupBySeverity, type DigestFinding, type FindingDigest } from './domain.js';
import type { FindingDigestRepositoryPort } from './ports.js';

export interface FindingDigestDeps {
  repo: FindingDigestRepositoryPort;
}

const TOP_TITLES = 3;

export class FindingDigestService {
  constructor(private readonly deps: FindingDigestDeps) {}

  async digest(workspaceId: string, prId: string): Promise<FindingDigest> {
    const { repo } = this.deps;
    if (!(await repo.pullExists(workspaceId, prId))) throw new NotFoundError('Pull request not found');

    const rows = await repo.listFindingsForPull(workspaceId, prId);
    const findings: DigestFinding[] = rows
      .filter((r) => r.dismissedAt === null)
      .map((r) => ({
        id: r.id,
        file: r.file,
        severity: r.severity,
        category: r.category,
        title: r.title,
        rationale: r.rationale,
        acceptedAt: r.acceptedAt,
        dismissedAt: r.dismissedAt,
      }));

    const first = findings[0];
    return {
      prId,
      entries: groupBySeverity(findings, TOP_TITLES),
      preview: first ? first.rationale.slice(0, PREVIEW_RATIONALE_CHARS) : null,
    };
  }
}
