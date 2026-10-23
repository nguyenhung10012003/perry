import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveSealKey, open, randomToken, seal, sha256hex, timingSafeEqualStr, TOKEN_RE } from './crypto.js';

describe('crypto', () => {
  const key = deriveSealKey('s'.repeat(64));

  it('seal/open round trip; the sealed value does not contain the plaintext', () => {
    const sealed = seal(key, 'discord-access-token');
    assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(!sealed.includes('discord-access-token'));
    assert.equal(open(key, sealed), 'discord-access-token');
    assert.notEqual(seal(key, 'x'), seal(key, 'x'));
  });

  it('tampering and a different secret are detected', () => {
    const sealed = seal(key, 'token');
    const [v, iv, ct = '', tag] = sealed.split('.');
    const flipped = `${v}.${iv}.${ct.endsWith('A') ? `${ct.slice(0, -1)}B` : `${ct.slice(0, -1)}A`}.${tag}`;
    assert.equal(open(key, flipped), null);
    assert.equal(open(deriveSealKey('t'.repeat(64)), sealed), null);
    assert.equal(open(key, 'v2.a.b.c'), null);
    assert.equal(open(key, 'garbage'), null);
  });

  it('tokens are 43 base64url characters', () => {
    const token = randomToken();
    assert.match(token, TOKEN_RE);
    assert.notEqual(token, randomToken());
    assert.equal(sha256hex('abc').length, 64);
    assert.equal(timingSafeEqualStr('abc', 'abc'), true);
    assert.equal(timingSafeEqualStr('abc', 'abd'), false);
    assert.equal(timingSafeEqualStr('abc', 'abcd'), false);
  });
});
