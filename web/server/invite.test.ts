import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INVITE_PERMISSIONS, inviteUrl } from './invite.js';

// Permission bit positions from the Discord API documentation (the web never imports discord.js).
const BITS = {
  KickMembers: 1,
  BanMembers: 2,
  ManageGuild: 5,
  ViewChannel: 10,
  SendMessages: 11,
  ManageMessages: 13,
  EmbedLinks: 14,
  ReadMessageHistory: 16,
  Connect: 20,
  Speak: 21,
  ManageRoles: 28,
  UseApplicationCommands: 31,
  ModerateMembers: 40,
};

describe('invite link', () => {
  it('the permission integer is the sum of the 13 bot permissions', () => {
    const sum = Object.values(BITS).reduce((total, bit) => total | (1n << BigInt(bit)), 0n);
    assert.equal(sum.toString(), INVITE_PERMISSIONS);
    assert.equal(INVITE_PERMISSIONS, '1101930785830');
  });

  it('builds the bot invite, optionally preselecting a guild', () => {
    assert.equal(
      inviteUrl('123456789012345678'),
      'https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=bot%20applications.commands&permissions=1101930785830',
    );
    assert.ok(
      inviteUrl('123456789012345678', '987654321098765432').endsWith('&guild_id=987654321098765432&disable_guild_select=true'),
    );
  });
});
