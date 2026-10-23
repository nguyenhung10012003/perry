import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clientIp } from './client-ip.js';
import { parseTrustProxy } from './config.js';

const trusted = parseTrustProxy('loopback,uniquelocal');
if (typeof trusted === 'string') throw new Error(trusted);
const ip = (value: string | null) => clientIp(new Headers(value === null ? {} : { 'x-forwarded-for': value }), trusted);

describe('clientIp', () => {
  it('a reverse proxy on the same host: the right-most untrusted entry', () => {
    assert.equal(ip('203.0.113.9, 127.0.0.1'), '203.0.113.9');
    assert.equal(ip('203.0.113.9, 10.0.0.2, 127.0.0.1'), '203.0.113.9');
  });

  it('spoofed left entries are ignored', () => {
    assert.equal(ip('1.2.3.4, 198.51.100.20, 127.0.0.1'), '198.51.100.20');
  });

  it('every entry trusted: the left-most one', () => {
    assert.equal(ip('192.168.1.10, 127.0.0.1'), '192.168.1.10');
    assert.equal(ip('::ffff:127.0.0.1'), '127.0.0.1');
    assert.equal(ip('::1'), '::1');
  });

  it('an entry that is not an IP ends the walk as unknown', () => {
    assert.equal(ip('203.0.113.9, nonsense, 127.0.0.1'), 'unknown');
    assert.equal(ip(null), 'unknown');
  });

  it('WEB_TRUST_PROXY accepts keywords, IPs and CIDRs and rejects anything else', () => {
    assert.notEqual(typeof parseTrustProxy('loopback, 203.0.113.0/24, 2001:db8::1'), 'string');
    assert.equal(typeof parseTrustProxy('everyone'), 'string');
    assert.equal(typeof parseTrustProxy('10.0.0.0/33'), 'string');
    const custom = parseTrustProxy('203.0.113.0/24');
    if (typeof custom === 'string') throw new Error(custom);
    assert.equal(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.1, 203.0.113.5' }), custom), '198.51.100.1');
  });
});
