import 'server-only';

/**
 * Bot permissions of the invite link (v1.4): View Channel, Send Messages, Embed Links, Connect, Speak, Use Application
 * Commands, Kick Members, Ban Members, Moderate Members, Manage Messages, Read Message History, Manage Roles and
 * Manage Server (AutoMod rules). The same integer is in scripts/setup.sh and both READMEs.
 */
export const INVITE_PERMISSIONS = '1101930785830';

/** The bot invite; with a guild id the server is preselected. */
export function inviteUrl(clientId: string, guildId?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
    permissions: INVITE_PERMISSIONS,
  });
  if (guildId !== undefined) {
    params.set('guild_id', guildId);
    params.set('disable_guild_select', 'true');
  }
  return `https://discord.com/oauth2/authorize?${params.toString().replace(/\+/g, '%20')}`;
}
