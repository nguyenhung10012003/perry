import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeUrl, sanitizeReturnTo } from './oauth.js';
import { fakeConfig } from './testing/fakes.js';

describe('sanitizeReturnTo', () => {
  const cases: [string | null, string][] = [
    ['/dashboard', '/dashboard'],
    ['/dashboard/100000000000000001/leveling', '/dashboard/100000000000000001/leveling'],
    ['/leaderboard/100000000000000001', '/leaderboard/100000000000000001'],
    [null, '/dashboard'],
    ['', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/dashboard//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['/admin', '/dashboard'],
    ['/dashboard?x=1', '/dashboard'],
    ['/dashboard/../auth', '/dashboard'],
    [`/dashboard/${'a'.repeat(181)}`, '/dashboard'],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => assert.equal(sanitizeReturnTo(input), expected));
  }
});

describe('authorizeUrl', () => {
  it('authorization code flow with identify guilds, the derived redirect URI and the state', () => {
    const url = new URL(authorizeUrl(fakeConfig(), 's'.repeat(43)));
    assert.equal(url.origin + url.pathname, 'https://discord.com/oauth2/authorize');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), '123456789012345678');
    assert.equal(url.searchParams.get('scope'), 'identify guilds');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/callback');
    assert.equal(url.searchParams.get('state'), 's'.repeat(43));
    assert.equal(url.searchParams.get('prompt'), null);
    assert.ok(url.search.includes('scope=identify%20guilds'));
  });
});
