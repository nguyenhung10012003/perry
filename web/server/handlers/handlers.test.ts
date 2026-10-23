import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultSettings } from '../../../src/settings/guild-settings.js';
import { deriveSealKey, open } from '../crypto.js';
import type { HandlerFactory } from '../handler.js';
import { createFakeWorld, fakeGuildMeta, fakeRequest, routeContext, seedSession } from '../testing/fakes.js';
import type { FakeRequestInit, FakeWorld } from '../testing/fakes.js';
import { callback, login, logout } from './auth.js';
import { putRule } from './automod.js';
import { getGuild, getGuildData, listGuilds } from './guilds.js';
import { healthz } from './health.js';
import { getLeaderboard, putRewards } from './leveling.js';
import { getPublicLeaderboard } from './public.js';
import { getSession } from './session.js';
import { patchGeneral, patchLeveling, patchModeration } from './settings.js';

const A = '100000000000000001';
const B = '100000000000000002';
const C = '100000000000000003';
const GENERAL = '300000000000000001';
const READ_ONLY = '300000000000000002';
const VOICE = '300000000000000003';
const GONE = '399999999999999999';
const MEMBER = '400000000000000001';

function world(): FakeWorld {
  const w = createFakeWorld();
  w.discord.guilds = [
    { id: A, name: 'Alpha', icon: null, owner: false, permissions: String(0x20) },
    { id: B, name: 'Beta', icon: null, owner: false, permissions: '0' },
    { id: C, name: 'Gamma', icon: null, owner: true, permissions: '0' },
  ];
  w.bridge.botGuildList = { v: 1, at: Date.now(), guilds: [{ id: A, name: 'Alpha', icon: null }] };
  w.bridge.meta.set(A, fakeGuildMeta(A));
  return w;
}

async function call(
  w: FakeWorld,
  factory: HandlerFactory,
  path: string,
  init: FakeRequestInit = {},
  params: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers; text: string }> {
  const response = await factory(w.deps)(fakeRequest(path, init), routeContext(params));
  const text = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: response.status, body, headers: response.headers, text };
}

const patch = (w: FakeWorld, factory: HandlerFactory, guildId: string, init: FakeRequestInit) =>
  call(w, factory, `/api/guilds/${guildId}/x`, { method: 'PATCH', ...init }, { guildId });

describe('authentication and CSRF', () => {
  it('401 without a session; every API response is no-store JSON', async () => {
    const w = world();
    for (const factory of [getSession, listGuilds]) {
      const result = await call(w, factory, '/api/x');
      assert.equal(result.status, 401);
      assert.equal(result.body.error, 'unauthorized');
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.match(result.headers.get('content-type') ?? '', /^application\/json/);
    }
  });

  it('GET /api/session returns the user and the CSRF token, never the access token', async () => {
    const w = world();
    const session = await seedSession(w);
    const result = await call(w, getSession, '/api/session', { session });
    assert.equal(result.status, 200);
    assert.equal(result.body.csrfToken, session.csrfToken);
    assert.ok(!result.text.includes('stub-access-token'));
    assert.ok(!result.text.includes('v1.'));
  });

  it('403 csrf_failed for a missing token, a wrong token and a foreign Origin', async () => {
    const w = world();
    const session = await seedSession(w);
    const body = { json: { defaultVolume: 50 } };
    for (const init of [{ csrf: false as const }, { csrf: 'x'.repeat(43) }, { origin: 'https://evil.example' }]) {
      const result = await patch(w, patchGeneral, A, { session, ...body, ...init });
      assert.equal(result.status, 403);
      assert.equal(result.body.error, 'csrf_failed');
    }
    assert.equal(w.writes.length, 0);
  });

  it('a session sealed with another SESSION_SECRET answers 401 session_expired and is deleted', async () => {
    const w = world();
    const session = await seedSession(w);
    Object.assign(w.deps, { sealKey: deriveSealKey('another-secret-'.repeat(4)) });
    const first = await call(w, getSession, '/api/session', { session });
    assert.equal(first.status, 401);
    assert.equal(first.body.error, 'session_expired');
    const second = await call(w, getSession, '/api/session', { session });
    assert.equal(second.body.error, 'unauthorized');
  });

  it('503 storage_unavailable while Redis is down', async () => {
    const w = world();
    const session = await seedSession(w);
    w.cache.up = false;
    const result = await call(w, getSession, '/api/session', { session });
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'storage_unavailable');
  });
});

describe('guild access (DP-10 (b))', () => {
  it('GET /api/guilds lists manageable guilds, the ones with the bot first', async () => {
    const w = world();
    const session = await seedSession(w);
    const result = await call(w, listGuilds, '/api/guilds', { session });
    assert.equal(result.status, 200);
    const guilds = result.body.guilds as { id: string; botPresent: boolean; inviteUrl: string | null }[];
    assert.deepEqual(
      guilds.map((guild) => [guild.id, guild.botPresent]),
      [
        [A, true],
        [C, false],
      ],
    );
    assert.match(guilds[1]?.inviteUrl ?? '', /guild_id=100000000000000003/);
  });

  it('403 forbidden, 404 bot_not_in_guild with inviteUrl', async () => {
    const w = world();
    const session = await seedSession(w);
    const forbidden = await patch(w, patchGeneral, B, { session, json: { defaultVolume: 50 } });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error, 'forbidden');
    const absent = await patch(w, patchGeneral, C, { session, json: { defaultVolume: 50 } });
    assert.equal(absent.status, 404);
    assert.equal(absent.body.error, 'bot_not_in_guild');
    assert.match(String(absent.body.inviteUrl), /guild_id=100000000000000003/);
  });

  it('acceptance 25d: without botguilds, routes 9, 10 and an id-less PATCH answer 503 bot_unavailable', async () => {
    const w = world();
    const session = await seedSession(w);
    w.bridge.botGuildList = null;
    const list = await call(w, listGuilds, '/api/guilds', { session });
    const guild = await call(w, getGuild, `/api/guilds/${A}`, { session }, { guildId: A });
    const saved = await patch(w, patchGeneral, A, { session, json: { defaultVolume: 50 } });
    for (const result of [list, guild, saved]) {
      assert.equal(result.status, 503);
      assert.equal(result.body.error, 'bot_unavailable');
      assert.equal(result.headers.get('retry-after'), '5');
    }
    assert.equal(w.writes.length, 0);
  });

  it('GET /api/guilds/:id returns the three sections and the rewards', async () => {
    const w = world();
    const session = await seedSession(w);
    w.rewards.set(A, [{ level: 5, roleId: MEMBER }]);
    const result = await call(w, getGuild, `/api/guilds/${A}`, { session }, { guildId: A });
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.body).sort(), ['general', 'guild', 'leveling', 'moderation']);
    assert.deepEqual((result.body.leveling as { rewards: unknown }).rewards, [{ level: 5, roleId: MEMBER }]);
  });

  it('GET /api/guilds/:id/discord is cached in gmeta (one bridge request) until ?refresh=1', async () => {
    const w = world();
    const session = await seedSession(w);
    await call(w, getGuildData, `/api/guilds/${A}/discord`, { session }, { guildId: A });
    await call(w, getGuildData, `/api/guilds/${A}/discord`, { session }, { guildId: A });
    assert.equal(w.bridge.requests.filter((r) => r === `gmeta ${A}`).length, 1);
    const refreshed = await call(w, getGuildData, `/api/guilds/${A}/discord?refresh=1`, { session }, { guildId: A });
    assert.equal(refreshed.status, 200);
    assert.equal(w.bridge.requests.filter((r) => r === `gmeta ${A}`).length, 2);
  });
});

describe('settings PATCH', () => {
  it('a valid PATCH returns 200 and writes the patch', async () => {
    const w = world();
    const session = await seedSession(w);
    const result = await patch(w, patchGeneral, A, { session, json: { defaultVolume: 50, language: 'vi' } });
    assert.equal(result.status, 200);
    assert.deepEqual(w.writes, [{ guildId: A, patch: { defaultVolume: 50, language: 'vi' } }]);
    assert.equal((result.body.general as { defaultVolume: number }).defaultVolume, 50);
    // An id-less patch needs no bridge round trip.
    assert.equal(w.bridge.requests.length, 0);
  });

  it('400 with issue paths, unknown keys, 415 and 413 (also chunked)', async () => {
    const w = world();
    const session = await seedSession(w);
    const range = await patch(w, patchGeneral, A, { session, json: { defaultVolume: 999 } });
    assert.equal(range.status, 400);
    assert.equal(range.body.error, 'invalid_body');
    assert.equal((range.body.issues as { path: string }[])[0]?.path, 'defaultVolume');
    const unknown = await patch(w, patchGeneral, A, { session, json: { x: 1 } });
    assert.equal(unknown.status, 400);
    const plain = await patch(w, patchGeneral, A, { session, body: '{}', headers: { 'content-type': 'text/plain' } });
    assert.equal(plain.status, 415);
    const big = { defaultVolume: 50, pad: 'x'.repeat(20_000) };
    const large = await patch(w, patchGeneral, A, { session, json: big });
    assert.equal(large.status, 413);
    assert.equal(large.body.error, 'payload_too_large');
    const chunks = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i += 1) controller.enqueue(new TextEncoder().encode('x'.repeat(5000)));
        controller.close();
      },
    });
    const chunked = await patch(w, patchGeneral, A, { session, body: chunks, headers: { 'content-type': 'application/json' } });
    assert.equal(chunked.status, 413);
  });

  it('acceptance 25a: bot_cannot_post, kept stale ids dropped, added unknown ids rejected', async () => {
    const w = world();
    const session = await seedSession(w);
    const cannot = await patch(w, patchModeration, A, { session, json: { modLogChannelId: READ_ONLY } });
    assert.equal(cannot.status, 400);
    assert.deepEqual(cannot.body.issues, [
      { path: 'modLogChannelId', code: 'bot_cannot_post', message: 'the bot cannot post embeds in this channel' },
    ]);
    w.settings.set(A, { ...defaultSettings(), xpIgnoredChannelIds: [GONE] });
    const kept = await patch(w, patchLeveling, A, { session, json: { xpIgnoredChannelIds: [GONE, VOICE] } });
    assert.equal(kept.status, 200);
    assert.deepEqual(w.settings.get(A)?.xpIgnoredChannelIds, [VOICE]);
    const added = await patch(w, patchLeveling, A, { session, json: { xpIgnoredChannelIds: [VOICE, GONE] } });
    assert.equal(added.status, 400);
    assert.equal((added.body.issues as { code: string }[])[0]?.code, 'unknown_channel');
    const fine = await patch(w, patchModeration, A, { session, json: { modLogChannelId: GENERAL } });
    assert.equal(fine.status, 200);
  });

  it('hiding the public leaderboard clears its cached pages', async () => {
    const w = world();
    const session = await seedSession(w);
    await w.cache.set(w.deps.keys.webPublicLeaderboard(A, 1), '{}', 30);
    await w.cache.set(w.deps.keys.webPublicLeaderboard(A, 40), '{}', 30);
    const result = await patch(w, patchLeveling, A, { session, json: { leaderboardPublic: false } });
    assert.equal(result.status, 200);
    assert.equal(w.cache.entries.has(w.deps.keys.webPublicLeaderboard(A, 1)), false);
    assert.equal(w.cache.entries.has(w.deps.keys.webPublicLeaderboard(A, 40)), false);
  });

  it('503 storage_unavailable or schema_outdated while Postgres is down', async () => {
    const w = world();
    const session = await seedSession(w);
    w.state.pgUp = false;
    assert.equal((await patch(w, patchGeneral, A, { session, json: { defaultVolume: 5 } })).body.error, 'storage_unavailable');
    w.state.schemaOutdated = true;
    assert.equal((await patch(w, patchGeneral, A, { session, json: { defaultVolume: 5 } })).body.error, 'schema_outdated');
  });
});

describe('rewards, leaderboard and AutoMod', () => {
  const put = (w: FakeWorld, init: FakeRequestInit) =>
    call(w, putRewards, `/api/guilds/${A}/leveling/rewards`, { method: 'PUT', ...init }, { guildId: A });

  it('PUT rewards: 200, role checks, 26 rewards and duplicate levels are rejected, conflict maps to 409', async () => {
    const w = world();
    const session = await seedSession(w);
    const ok = await put(w, { session, json: { rewards: [{ level: 5, roleId: MEMBER }] } });
    assert.equal(ok.status, 200);
    assert.deepEqual(w.rewards.get(A), [{ level: 5, roleId: MEMBER }]);
    const managed = await put(w, { session, json: { rewards: [{ level: 5, roleId: '400000000000000002' }] } });
    assert.equal((managed.body.issues as { code: string }[])[0]?.code, 'role_managed');
    const high = await put(w, { session, json: { rewards: [{ level: 5, roleId: '400000000000000003' }] } });
    assert.equal((high.body.issues as { code: string }[])[0]?.code, 'role_not_assignable');
    const many = Array.from({ length: 26 }, (_, i) => ({ level: i + 1, roleId: `4${String(i).padStart(17, '0')}` }));
    assert.equal((await put(w, { session, json: { rewards: many } })).status, 400);
    const duplicate = await put(w, { session, json: { rewards: [{ level: 5, roleId: MEMBER }, { level: 5, roleId: '400000000000000004' }] } });
    assert.equal((duplicate.body.issues as { path: string }[])[0]?.path, 'rewards.1.level');
    w.state.rewardConflict = true;
    const conflict = await put(w, { session, json: { rewards: [] } });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, 'conflict');
  });

  it('leaderboard pages of 25, ordered by XP then user id; a page past the end shows the last page', async () => {
    const w = world();
    const session = await seedSession(w);
    w.members.set(
      A,
      Array.from({ length: 30 }, (_, i) => ({
        guildId: A,
        userId: `5${String(i).padStart(17, '0')}`,
        xp: i === 0 ? 500 : 100,
        level: 1,
        username: `u${i}`,
        avatar: null,
        updatedAt: new Date(),
      })),
    );
    const result = await call(w, getLeaderboard, `/api/guilds/${A}/leaderboard?page=101`, { session }, { guildId: A });
    assert.equal(result.status, 400);
    const last = await call(w, getLeaderboard, `/api/guilds/${A}/leaderboard?page=99`, { session }, { guildId: A });
    assert.equal(last.body.page, 2);
    assert.equal(last.body.totalPages, 2);
    assert.equal((last.body.entries as unknown[]).length, 5);
    const first = await call(w, getLeaderboard, `/api/guilds/${A}/leaderboard`, { session }, { guildId: A });
    const entries = first.body.entries as { rank: number; userId: string; xp: number }[];
    assert.equal(entries[0]?.xp, 500);
    assert.equal(entries[1]?.userId, '500000000000000001');
  });

  it('public leaderboard: 404 while disabled, 200 after enabling, then served from the 30 s cache', async () => {
    const w = world();
    const request = () =>
      call(w, getPublicLeaderboard, `/api/public/leaderboard/${A}`, {}, { guildId: A });
    assert.equal((await request()).status, 404);
    w.settings.set(A, { ...defaultSettings(), leaderboardPublic: true });
    const enabled = await request();
    assert.equal(enabled.status, 200);
    assert.equal((enabled.body.guild as { name: string }).name, 'Alpha');
    w.settings.set(A, { ...defaultSettings(), leaderboardPublic: true });
    w.state.pgUp = false;
    assert.equal((await request()).status, 200);
    const other = await call(w, getPublicLeaderboard, `/api/public/leaderboard/${C}`, {}, { guildId: C });
    assert.equal(other.status, 404);
  });

  it('AutoMod PUT: 1000 Vietnamese keywords of 60 characters pass, 300 KB answers 413, unknown exempt channel 400', async () => {
    const w = world();
    const session = await seedSession(w);
    const body = {
      enabled: true,
      keywords: Array.from({ length: 1000 }, () => 'ạ'.repeat(60)),
      allowList: [],
      alertChannelId: null,
      timeoutSeconds: 0,
      exemptRoleIds: [],
      exemptChannelIds: [VOICE],
    };
    const path = `/api/guilds/${A}/automod/keywords`;
    const ok = await call(w, putRule, path, { method: 'PUT', session, json: body }, { guildId: A, kind: 'keywords' });
    assert.equal(ok.status, 200);
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 180_000);
    const huge = { ...body, allowList: ['x'.repeat(300_000)] };
    const tooLarge = await call(w, putRule, path, { method: 'PUT', session, json: huge }, { guildId: A, kind: 'keywords' });
    assert.equal(tooLarge.status, 413);
    const unknown = await call(
      w,
      putRule,
      path,
      { method: 'PUT', session, json: { ...body, exemptChannelIds: [GONE] } },
      { guildId: A, kind: 'keywords' },
    );
    assert.equal(unknown.status, 400);
    assert.equal((unknown.body.issues as { code: string }[])[0]?.code, 'unknown_channel');
    const wrongKind = await call(w, putRule, path, { method: 'PUT', session, json: body }, { guildId: A, kind: 'mentions' });
    assert.equal(wrongKind.status, 400);
    const bad = await call(w, putRule, path, { method: 'PUT', session, json: body }, { guildId: A, kind: 'everything' });
    assert.equal(bad.body.error, 'invalid_params');
    w.bridge.automod.set(A, { available: false, rules: { keywords: null, invites: null, mentions: null, presets: null } });
    const missing = await call(w, putRule, path, { method: 'PUT', session, json: body }, { guildId: A, kind: 'keywords' });
    assert.equal(missing.status, 409);
    assert.equal(missing.body.error, 'bot_missing_permission');
  });
});

describe('OAuth login, callback and logout', () => {
  async function startLogin(w: FakeWorld): Promise<{ state: string; cookie: string }> {
    const result = await call(w, login, '/auth/login?returnTo=%2Fdashboard%2F100000000000000001');
    assert.equal(result.status, 302);
    const location = new URL(result.headers.get('location') ?? '');
    const state = location.searchParams.get('state') ?? '';
    assert.equal(state.length, 43);
    const setCookie = result.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /^perry_oauth=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=600; SameSite=Lax; HttpOnly$/);
    return { state, cookie: `perry_oauth=${state}` };
  }

  it('login redirects to Discord with a state; https uses __Host- cookies with Secure', async () => {
    const w = world();
    await startLogin(w);
    const secure = createFakeWorld({ PUBLIC_URL: 'https://perry.example.com' });
    const result = await call(secure, login, '/auth/login');
    assert.match(result.headers.get('set-cookie') ?? '', /^__Host-perry_oauth=.*; HttpOnly; Secure$/);
  });

  it('the success path sets the session cookie, stores a sealed token and redirects to returnTo', async () => {
    const w = world();
    const { state, cookie } = await startLogin(w);
    const result = await call(w, callback, `/auth/callback?code=abc123&state=${state}`, { headers: { cookie } });
    assert.equal(result.status, 302);
    assert.equal(result.headers.get('location'), 'http://localhost:3000/dashboard/100000000000000001');
    const cookies = result.headers.getSetCookie();
    assert.ok(cookies.some((value) => value.startsWith('perry_oauth=; Path=/; Max-Age=0')));
    const session = cookies.find((value) => value.startsWith('perry_sid='));
    assert.match(session ?? '', /^perry_sid=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; SameSite=Lax; HttpOnly$/);
    const stored = [...w.cache.entries.entries()].find(([key]) => key.includes(':web:sess:'));
    assert.ok(stored !== undefined);
    assert.ok(!stored[1].value.includes('stub-access-token-0001'));
    const record = JSON.parse(stored[1].value) as { accessToken: string };
    assert.equal(open(w.deps.sealKey, record.accessToken), 'stub-access-token-0001');
  });

  it('missing, mismatched, reused and expired states answer 400 HTML', async () => {
    const w = world();
    const missing = await call(w, callback, '/auth/callback?code=abc');
    assert.equal(missing.status, 400);
    assert.match(missing.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(missing.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    const { state, cookie } = await startLogin(w);
    const mismatch = await call(w, callback, `/auth/callback?code=abc&state=${'x'.repeat(43)}`, { headers: { cookie } });
    assert.equal(mismatch.status, 400);
    assert.equal((await call(w, callback, `/auth/callback?code=abc&state=${state}`, { headers: { cookie } })).status, 302);
    const reused = await call(w, callback, `/auth/callback?code=abc&state=${state}`, { headers: { cookie } });
    assert.equal(reused.status, 400);
    const second = await startLogin(w);
    w.state.now += 601_000;
    const expired = await call(w, callback, `/auth/callback?code=abc&state=${second.state}`, { headers: { cookie: second.cookie } });
    assert.equal(expired.status, 400);
  });

  it('a cancelled login, a foreign issuer, a bad code and a Discord failure', async () => {
    const w = world();
    const cancelled = await call(w, callback, '/auth/callback?error=access_denied');
    assert.equal(cancelled.headers.get('location'), 'http://localhost:3000/?login=cancelled');
    let next = await startLogin(w);
    const issuer = await call(w, callback, `/auth/callback?code=abc&state=${next.state}&iss=https://evil.example`, {
      headers: { cookie: next.cookie },
    });
    assert.equal(issuer.status, 400);
    next = await startLogin(w);
    const code = await call(w, callback, `/auth/callback?code=${encodeURIComponent('a b')}&state=${next.state}`, {
      headers: { cookie: next.cookie },
    });
    assert.equal(code.status, 400);
    next = await startLogin(w);
    w.discord.token = new Error('down');
    const failed = await call(w, callback, `/auth/callback?code=abc&state=${next.state}`, { headers: { cookie: next.cookie } });
    assert.equal(failed.status, 502);
  });

  it('acceptance 25c: logout without a body, with {} and with {"x":1}', async () => {
    const w = world();
    const first = await seedSession(w);
    const bare = await call(w, logout, '/auth/logout', { method: 'POST', session: first });
    assert.equal(bare.status, 204);
    assert.match(bare.headers.get('set-cookie') ?? '', /^perry_sid=; Path=\/; Max-Age=0/);
    assert.deepEqual(w.discord.revoked, ['stub-access-token-0001']);
    assert.equal((await call(w, getSession, '/api/session', { session: first })).status, 401);
    const second = await seedSession(w);
    assert.equal((await call(w, logout, '/auth/logout', { method: 'POST', session: second, json: {} })).status, 204);
    const third = await seedSession(w);
    const extra = await call(w, logout, '/auth/logout', { method: 'POST', session: third, json: { x: 1 } });
    assert.equal(extra.status, 400);
    const noCsrf = await call(w, logout, '/auth/logout', { method: 'POST', session: third, csrf: false });
    assert.equal(noCsrf.status, 403);
  });

  it('the 21st login within 10 minutes from one IP answers 429 with Retry-After', async () => {
    const w = world();
    for (let i = 0; i < 20; i += 1) assert.equal((await call(w, login, '/auth/login')).status, 302);
    const limited = await call(w, login, '/auth/login');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '600');
  });
});

describe('healthz', () => {
  it('200 when both backends are up, 503 degraded otherwise', async () => {
    const w = world();
    assert.deepEqual((await call(w, healthz, '/healthz')).body, { status: 'ok' });
    w.state.pgUp = false;
    const degraded = await call(w, healthz, '/healthz');
    assert.equal(degraded.status, 503);
    assert.deepEqual(degraded.body, { status: 'degraded', postgres: 'down', redis: 'up' });
  });
});
