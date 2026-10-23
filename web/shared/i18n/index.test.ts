import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { en, localeFromAcceptLanguage, negotiateLocale, vi } from './index.js';

function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (Array.isArray(value)) return value.map(shape);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]).sort());
  }
  return typeof value;
}

describe('negotiateLocale (W1)', () => {
  it('?lang, then the cookie, then Accept-Language, then DEFAULT_LOCALE, then English', () => {
    assert.equal(negotiateLocale({ query: 'vi', cookie: 'en', acceptLanguage: 'en' }), 'vi');
    assert.equal(negotiateLocale({ query: 'fr', cookie: 'vi', acceptLanguage: 'en' }), 'vi');
    assert.equal(negotiateLocale({ cookie: 'xx', acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' }), 'vi');
    assert.equal(negotiateLocale({ acceptLanguage: 'fr-FR', defaultLocale: 'vi' }), 'vi');
    assert.equal(negotiateLocale({}), 'en');
  });

  it('Accept-Language honours weights and skips q=0', () => {
    assert.equal(localeFromAcceptLanguage('fr;q=1, en;q=0.5, vi;q=0.8'), 'vi');
    assert.equal(localeFromAcceptLanguage('vi;q=0, en;q=0.1'), 'en');
    assert.equal(localeFromAcceptLanguage('*'), undefined);
    assert.equal(localeFromAcceptLanguage(null), undefined);
  });
});

describe('catalogs', () => {
  it('vi has the same keys and value kinds as en', () => {
    assert.deepEqual(shape(vi), shape(en));
  });

  it('every API error code and issue code has a message in both languages', () => {
    for (const catalog of [en, vi]) {
      for (const message of [...Object.values(catalog.errors.codes), ...Object.values(catalog.errors.issues)]) {
        assert.ok(message.length > 0);
      }
    }
  });
});
