import { exec } from 'node:child_process';

export async function deliver(url: string, payload: unknown): Promise<number> {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
  return res.status;
}

export function archiveLogs(dirName: string): void {
  exec(`tar -czf /tmp/${dirName}.tgz /var/app/logs/${dirName}`);
}
