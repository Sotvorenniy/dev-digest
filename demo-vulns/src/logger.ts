export function logRequest(req: { method: string; url: string; headers: Record<string, string> }) {
  console.log('request', req.method, req.url, 'authorization=' + req.headers['authorization']);
}
