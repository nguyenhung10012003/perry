import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generalPatchSchema } from '../shared/api.js';
import { readJsonBody } from './body.js';
import { ApiError } from './errors.js';

function req(body: BodyInit | null, headers: Record<string, string> = { 'content-type': 'application/json' }): Request {
  return new Request('http://localhost/x', { method: 'PATCH', body, headers, duplex: 'half' } as RequestInit);
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (err) {
    return err instanceof ApiError ? `${err.status} ${err.code}` : 'other';
  }
}

function stream(bytes: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes) {
        controller.close();
        return;
      }
      const size = Math.min(4096, bytes - sent);
      sent += size;
      controller.enqueue(new TextEncoder().encode('a'.repeat(size)));
    },
  });
}

describe('readJsonBody', () => {
  it('parses JSON with an optional utf-8 charset', async () => {
    assert.deepEqual(await readJsonBody(req('{"a":1}'), 100), { a: 1 });
    assert.deepEqual(await readJsonBody(req('[1]', { 'content-type': 'application/json; charset=UTF-8' }), 100), [1]);
  });

  it('415 without a JSON Content-Type', async () => {
    assert.equal(await code(readJsonBody(req('{}', { 'content-type': 'text/plain' }), 100)), '415 unsupported_media_type');
    assert.equal(await code(readJsonBody(req('{}', {}), 100)), '415 unsupported_media_type');
  });

  it('413 by Content-Length and by streamed bytes (chunked, no Content-Length)', async () => {
    const declared = req('x'.repeat(10), { 'content-type': 'application/json', 'content-length': '20000' });
    assert.equal(await code(readJsonBody(declared, 16384)), '413 payload_too_large');
    assert.equal(await code(readJsonBody(req(stream(20_000)), 16384)), '413 payload_too_large');
  });

  it('400 for an empty body, invalid UTF-8 and invalid JSON', async () => {
    assert.equal(await code(readJsonBody(req(''), 100)), '400 invalid_body');
    assert.equal(await code(readJsonBody(req(new Uint8Array([0x7b, 0xff, 0x7d])), 100)), '400 invalid_body');
    assert.equal(await code(readJsonBody(req('{nope'), 100)), '400 invalid_body');
  });

  it('a __proto__ key stays an own property and the strict schema rejects it', async () => {
    const body = await readJsonBody(req('{"__proto__":{"polluted":true},"defaultVolume":5}'), 100);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(generalPatchSchema.safeParse(body).success, false);
  });

  it('allowEmpty: no body and no Content-Type is undefined; a body without Content-Type is 415', async () => {
    assert.equal(await readJsonBody(req(null, {}), 100, { allowEmpty: true }), undefined);
    assert.equal(await code(readJsonBody(req('{}', {}), 100, { allowEmpty: true })), '415 unsupported_media_type');
  });
});
