import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { avatarUrl, guildIconUrl, guildInitials, hasManagePermission } from './discord.js';

describe('hasManagePermission', () => {
  it('owner, Manage Server or Administrator', () => {
    assert.equal(hasManagePermission({ owner: true, permissions: '0' }), true);
    assert.equal(hasManagePermission({ owner: false, permissions: String(0x20) }), true);
    assert.equal(hasManagePermission({ owner: false, permissions: String(0x8) }), true);
    assert.equal(hasManagePermission({ owner: false, permissions: String(0x10 | 0x4) }), false);
  });

  it('uses BigInt for bitfields above 2^53', () => {
    const big = (1n << 50n) | (1n << 40n) | 0x20n;
    assert.equal(hasManagePermission({ owner: false, permissions: big.toString() }), true);
    assert.equal(hasManagePermission({ owner: false, permissions: ((1n << 50n) | 0x10n).toString() }), false);
    assert.equal(hasManagePermission({ owner: false, permissions: 'abc' }), false);
  });
});

describe('CDN URLs', () => {
  const USER = '80351110224678912';
  it('avatar with a hash, default avatar without one', () => {
    assert.equal(avatarUrl(USER, 'a'.repeat(32)), `https://cdn.discordapp.com/avatars/${USER}/${'a'.repeat(32)}.png?size=64`);
    assert.match(avatarUrl(USER, null), /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
    assert.match(avatarUrl(USER, '../../evil'), /embed\/avatars/);
  });

  it('guild icon or null', () => {
    assert.equal(guildIconUrl(USER, null), null);
    assert.equal(guildIconUrl(USER, 'a_' + 'b'.repeat(32), 128), `https://cdn.discordapp.com/icons/${USER}/a_${'b'.repeat(32)}.png?size=128`);
    assert.equal(guildIconUrl(USER, 'x"><script>'), null);
  });

  it('initials', () => {
    assert.equal(guildInitials('perry music club'), 'PM');
    assert.equal(guildInitials('Đội hình'), 'ĐH');
  });
});
