import 'server-only';
import { ApiError } from './errors.js';

const JSON_TYPE_RE = /^application\/json\s*(;\s*charset\s*=\s*"?utf-8"?\s*)?$/i;

export interface ReadBodyOptions {
  /** Route 4 (logout) also accepts a request with no body and no Content-Type: the result is then undefined. */
  allowEmpty?: boolean;
}

/**
 * Reads a JSON request body with a byte limit (Route Handlers have none of their own). 415 without a JSON
 * Content-Type, 413 above the limit (by Content-Length, or by counting streamed bytes for chunked uploads), 400 for an
 * empty body, invalid UTF-8 or invalid JSON. JSON.parse never changes a prototype; the strict schemas then reject a
 * `__proto__` key like any other unknown key.
 */
export async function readJsonBody(request: Request, limit: number, options: ReadBodyOptions = {}): Promise<unknown> {
  const contentType = request.headers.get('content-type');
  const declaredLength = request.headers.get('content-length');
  if (contentType === null && options.allowEmpty === true) {
    const bytes = await readBytes(request, limit);
    if (bytes.length === 0) return undefined;
    throw new ApiError('unsupported_media_type', { message: 'Content-Type must be application/json' });
  }
  if (contentType === null || !JSON_TYPE_RE.test(contentType.trim())) {
    throw new ApiError('unsupported_media_type', { message: 'Content-Type must be application/json' });
  }
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > limit) {
    throw new ApiError('payload_too_large', { message: `The body exceeds ${limit} bytes` });
  }
  const bytes = await readBytes(request, limit);
  if (bytes.length === 0) throw new ApiError('invalid_body', { message: 'The body is empty' });
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError('invalid_body', { message: 'The body is not valid UTF-8' });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('invalid_body', { message: 'The body is not valid JSON' });
  }
}

/** Reads the body chunk by chunk and stops at limit + 1 bytes with 413. */
async function readBytes(request: Request, limit: number): Promise<Uint8Array> {
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError('payload_too_large', { message: `The body exceeds ${limit} bytes` });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
