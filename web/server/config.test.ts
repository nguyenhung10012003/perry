import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWebConfig, PUBLIC_URL_RE, publicUrlProblem } from './config.js';

// Acceptance 29a: the same table runs through scripts/lib/common.sh public_url_valid, setup.sh and doctor.sh.
const ACCEPTED = [
  'https://perry.example.com',
  'https://perry.example.com:8443',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
];
const REJECTED = [
  'http://perry.example.com',
  'https://perry.example.com/',
  'https://perry.example.com/x',
  'ftp://a',
  'https://a:99999',
  '',
];

const BASE = {
  NODE_ENV: 'production',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'fakesecretfakesecret0',
  PUBLIC_URL: 'https://perry.example.com',
  SESSION_SECRET: 'a'.repeat(64),
  DATABASE_URL: 'postgres://perry:pw@postgres:5432/perry',
  REDIS_URL: 'redis://:pw@redis:6379',
};

describe('PUBLIC_URL rule', () => {
  for (const value of ACCEPTED) {
    it(`accepts ${value}`, () => assert.equal(publicUrlProblem(value), null));
  }
  for (const value of REJECTED) {
    it(`rejects ${JSON.stringify(value)}`, () => assert.notEqual(publicUrlProblem(value), null));
  }
  it('the exported regex alone matches https://a:99999 (the port range is a separate check)', () => {
    assert.equal(PUBLIC_URL_RE.test('https://a:99999'), true);
  });
  it('a trailing slash gets a hint', () => {
    assert.match(publicUrlProblem('https://perry.example.com/') ?? '', /remove the path or trailing slash/);
  });
});

describe('parseWebConfig', () => {
  it('derives the redirect URI and the cookie mode from PUBLIC_URL', () => {
    const parsed = parseWebConfig(BASE);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.config.redirectUri, 'https://perry.example.com/auth/callback');
    assert.equal(parsed.config.secureCookies, true);
    assert.equal(parsed.config.port, 3000);
    assert.equal(parsed.config.host, '127.0.0.1');
    assert.equal(parsed.config.dev, false);
  });

  it('lists the names of missing or invalid variables, never their values', () => {
    const parsed = parseWebConfig({
      ...BASE,
      PUBLIC_URL: undefined,
      SESSION_SECRET: 'shortsecretvalue',
      WEB_PORT: '70000',
      WEB_TRUST_PROXY: 'x',
    });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).sort();
    assert.deepEqual(names, ['PUBLIC_URL', 'SESSION_SECRET', 'WEB_PORT', 'WEB_TRUST_PROXY']);
    assert.ok(!JSON.stringify(parsed.error.issues.map((issue) => issue.message)).includes('shortsecretvalue'));
  });

  it('requires the client secret and rejects a malformed one', () => {
    assert.equal(parseWebConfig({ ...BASE, DISCORD_CLIENT_SECRET: '' }).ok, false);
    assert.equal(parseWebConfig({ ...BASE, DISCORD_CLIENT_SECRET: 'has spaces in it!!' }).ok, false);
  });
});
