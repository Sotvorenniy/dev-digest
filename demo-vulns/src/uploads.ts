import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const UPLOAD_DIR = '/var/app/uploads';

export async function readUpload(fileName: string): Promise<Buffer> {
  return readFile(join(UPLOAD_DIR, fileName));
}

export async function saveUpload(fileName: string, data: Buffer): Promise<void> {
  await writeFile(UPLOAD_DIR + '/' + fileName, data);
}
