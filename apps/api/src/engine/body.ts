/** Reading a request body by hand: used by the upload route, with its limits. */
import type { Request } from 'express';
import { MAX_UPLOAD } from '../legacy/router';
import { httpError } from './scope';

export const MAX_BODY = 8e6;

/** JSON object (up to 8 MB), or with `raw` the file bytes (up to 25 MB). Refuses early when Content-Length already says it is too big. */
export function readBody(req: Request, raw: boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const limit = raw ? MAX_UPLOAD : MAX_BODY;
    const tooBigError = () => httpError(413, `body too large (limit ${Math.round(limit / 1048576)} MB)`, 'payload_too_large');
    if (Number(req.headers['content-length'] || 0) > limit) return reject(tooBigError());
    const chunks: Buffer[] = [];
    let size = 0, tooBig = false;
    req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { tooBig = true; chunks.length = 0; } else if (!tooBig) chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return reject(tooBigError());
      const buf = Buffer.concat(chunks);
      if (raw) return resolve(buf);
      const t = buf.toString('utf8');
      if (!t) return resolve({});
      try { resolve(JSON.parse(t)); } catch { reject(httpError(400, 'invalid JSON body', 'invalid_json')); }
    });
    req.on('error', reject);
  });
}
