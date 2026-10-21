export interface HealthRepo {
  id: string;
  owner: string;
  name: string;
  lastPolledAt: Date | null;
}

export interface RepoHealthRepositoryPort {
  findRepo(workspaceId: string, repoId: string): Promise<HealthRepo | null>;
}
