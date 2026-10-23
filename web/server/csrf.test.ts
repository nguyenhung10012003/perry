import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCsrf } from './csrf.js';
import type { Session } from './session.js';

const ORIGIN = 'https://perry.example.com';
const session = { id: 'x', accessToken: 't', record: { csrfToken: 'c'.repeat(43) } } as unknown as Session;
const req = (headers: Record<string, string>) => new Request(`${ORIGIN}/api/x`, { method: 'PATCH', headers });

describe('checkCsrf', () => {
  it('needs the token and a same-origin Origin', () => {
    assert.equal(checkCsrf(req({ 'x-csrf-token': 'c'.repeat(43), origin: ORIGIN }), session, ORIGIN), true);
    assert.equal(checkCsrf(req({ origin: ORIGIN }), session, ORIGIN), false);
    assert.equal(checkCsrf(req({ 'x-csrf-token': 'd'.repeat(43), origin: ORIGIN }), session, ORIGIN), false);
    assert.equal(checkCsrf(req({ 'x-csrf-token': 'c'.repeat(43), origin: 'https://evil.example' }), session, ORIGIN), false);
    assert.equal(checkCsrf(req({ 'x-csrf-token': 'c'.repeat(43), origin: `${ORIGIN}.evil.example` }), session, ORIGIN), false);
  });

  it('without Origin, the Referer must start with PUBLIC_URL/', () => {
    assert.equal(checkCsrf(req({ 'x-csrf-token': 'c'.repeat(43), referer: `${ORIGIN}/dashboard` }), session, ORIGIN), true);
    assert.equal(
      checkCsrf(req({ 'x-csrf-token': 'c'.repeat(43), referer: `${ORIGIN}.evil.example/` }), session, ORIGIN),
      false,
    );
    assert.equal(checkCsrf(req({ 'x-csrf-token': 'c'.repeat(43) }), session, ORIGIN), false);
  });
});
