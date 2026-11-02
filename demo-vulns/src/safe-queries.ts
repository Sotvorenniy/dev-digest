import { resolve, sep } from 'node:path';

interface Db {
  query(sql: string, params: unknown[]): Promise<unknown[]>;
}

export async function findUserById(db: Db, id: number) {
  return db.query('SELECT id, email FROM users WHERE id = $1', [id]);
}

const BASE = resolve('/var/app/uploads');

export function safeUploadPath(fileName: string): string {
  const full = resolve(BASE, fileName);
  if (!full.startsWith(BASE + sep)) throw new Error('invalid file name');
  return full;
}
