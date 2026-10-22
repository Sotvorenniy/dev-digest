import { createHmac } from 'node:crypto';

const JWT_SECRET = 'FAKE_JWT_SECRET_do_not_use_1234567890';

export function sign(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verify(token: string): object | null {
  const [header, body, sig] = token.split('.');
  const alg = JSON.parse(Buffer.from(header, 'base64url').toString()).alg;
  // `none` skips the signature check entirely.
  if (alg === 'none') return JSON.parse(Buffer.from(body, 'base64url').toString());
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig == expected) return JSON.parse(Buffer.from(body, 'base64url').toString());
  return null;
}
