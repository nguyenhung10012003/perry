import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from './errors.js';
import { requireManageableGuild } from './guild-access.js';
import { readSession } from './session.js';
import { createFakeWorld, seedSession } from './testing/fakes.js';

const A = '100000000000000001';
const B = '100000000000000002';
const C = '100000000000000003';

async function setup() {
  const world = createFakeWorld();
  world.discord.guilds = [
    { id: A, name: 'Alpha', icon: null, owner: false, permissions: String(0x20) },
    { id: B, name: 'Beta', icon: null, owner: false, permissions: '0' },
    { id: C, name: 'Gamma', icon: null, owner: true, permissions: '0' },
  ];
  world.bridge.botGuildList = { v: 1, at: Date.now(), guilds: [{ id: A, name: 'Alpha', icon: null }] };
  const seeded = await seedSession(world);
  const read = await readSession(world.deps, seeded.sessionId);
  if (!read.ok) throw new Error('session not readable');
  return { world, session: read.session };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (err) {
    return err instanceof ApiError ? `${err.status} ${err.code}` : String(err);
  }
}

describe('requireManageableGuild', () => {
  it('a manageable guild with the bot passes', async () => {
    const { world, session } = await setup();
    const access = await requireManageableGuild(world.deps, session, A);
    assert.equal(access.botGuild.name, 'Alpha');
  });

  it('403 without Manage Server, 400 for a non-snowflake, 404 with an invite when the bot is absent', async () => {
    const { world, session } = await setup();
    assert.equal(await code(requireManageableGuild(world.deps, session, B)), '403 forbidden');
    assert.equal(await code(requireManageableGuild(world.deps, session, '999999999999999999')), '403 forbidden');
    assert.equal(await code(requireManageableGuild(world.deps, session, 'abc')), '400 invalid_params');
    try {
      await requireManageableGuild(world.deps, session, C);
      assert.fail('expected bot_not_in_guild');
    } catch (err) {
      assert.ok(err instanceof ApiError && err.code === 'bot_not_in_guild');
      assert.match(err.options.inviteUrl ?? '', /guild_id=100000000000000003/);
    }
  });

  it('503 bot_unavailable without the botguilds key', async () => {
    const { world, session } = await setup();
    world.bridge.botGuildList = null;
    assert.equal(await code(requireManageableGuild(world.deps, session, A)), '503 bot_unavailable');
  });

  it('the user guild list is cached for 60 s', async () => {
    const { world, session } = await setup();
    await requireManageableGuild(world.deps, session, A);
    await requireManageableGuild(world.deps, session, A);
    assert.equal(world.discord.calls.filter((call) => call === 'getUserGuilds').length, 1);
    world.state.now += 61_000;
    await requireManageableGuild(world.deps, session, A);
    assert.equal(world.discord.calls.filter((call) => call === 'getUserGuilds').length, 2);
  });
});
