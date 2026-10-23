import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeHtml, html, plainPage } from './html.js';

describe('html escaping', () => {
  it('escapes interpolated values, keeps nested html``', () => {
    assert.equal(escapeHtml(`<script>"x"&'y'</script>`), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
    const inner = html`<b>${'<i>'}</b>`;
    assert.equal(html`<p>${inner}${'&'}</p>`.value, '<p><b>&lt;i&gt;</b>&amp;</p>');
  });

  it('the plain page escapes its texts and links /auth.css', () => {
    const page = plainPage({ lang: 'vi', title: '<x>', body: 'a & b', linkHref: '/auth/login', linkText: 'Thử lại' });
    assert.ok(page.includes('<html lang="vi">'));
    assert.ok(page.includes('<h1>&lt;x&gt;</h1>'));
    assert.ok(page.includes('a &amp; b'));
    assert.ok(page.includes('href="/auth.css"'));
    assert.ok(!page.includes('<script'));
  });
});
