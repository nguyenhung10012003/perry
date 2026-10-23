import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clearCookie, cookieNames, parseCookies, serializeCookie } from './cookies.js';

describe('cookies', () => {
  it('__Host- names with Secure on https, plain names on http://localhost', () => {
    assert.deepEqual(cookieNames(true), { session: '__Host-perry_sid', oauth: '__Host-perry_oauth', lang: 'perry_lang' });
    assert.deepEqual(cookieNames(false), { session: 'perry_sid', oauth: 'perry_oauth', lang: 'perry_lang' });
    assert.equal(
      serializeCookie('__Host-perry_sid', 'abc', { maxAge: 60, httpOnly: true, secure: true }),
      '__Host-perry_sid=abc; Path=/; Max-Age=60; SameSite=Lax; HttpOnly; Secure',
    );
    assert.equal(
      serializeCookie('perry_sid', 'abc', { maxAge: 60, httpOnly: true, secure: false }),
      'perry_sid=abc; Path=/; Max-Age=60; SameSite=Lax; HttpOnly',
    );
    assert.equal(
      clearCookie('perry_oauth', { httpOnly: true, secure: false }),
      'perry_oauth=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly',
    );
  });

  it('rejects values that could inject attributes', () => {
    assert.throws(() => serializeCookie('perry_sid', 'a; Domain=evil', { maxAge: 1, httpOnly: true, secure: true }));
  });

  it('parses a Cookie header; the first value of a name wins', () => {
    const cookies = parseCookies('a=1; perry_sid=xyz; a=2; bad; =x; q="quoted"');
    assert.equal(cookies.get('a'), '1');
    assert.equal(cookies.get('perry_sid'), 'xyz');
    assert.equal(cookies.get('q'), 'quoted');
    assert.equal(parseCookies(null).size, 0);
  });
});
