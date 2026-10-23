import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { XpMessageFacts } from './eligibility.js';
import { isXpEligible } from './eligibility.js';

const CHANNEL = '100000000000000001';
const THREAD_PARENT = '100000000000000002';
const CATEGORY = '100000000000000003';
const ROLE = '200000000000000001';
const OTHER = '300000000000000001';

const message = (overrides: Partial<XpMessageFacts> = {}): XpMessageFacts => ({
  inGuild: true,
  authorIsBot: false,
  isWebhook: false,
  isSystem: false,
  channelIds: [CHANNEL, CATEGORY],
  roleIds: [ROLE],
  ...overrides,
});

const settings = {
  levelingEnabled: true,
  xpIgnoredChannelIds: [] as string[],
  xpIgnoredRoleIds: [] as string[],
};

describe('isXpEligible', () => {
  // Acceptance 14.
  it('accepts a normal guild message', () => {
    assert.equal(isXpEligible(message(), settings), true);
  });

  it('accepts a message when other channels and roles are ignored', () => {
    assert.equal(isXpEligible(message(), { ...settings, xpIgnoredChannelIds: [OTHER], xpIgnoredRoleIds: [OTHER] }), true);
  });

  for (const [name, facts] of [
    ['a DM', message({ inGuild: false })],
    ['a bot author', message({ authorIsBot: true })],
    ['a webhook', message({ isWebhook: true })],
    ['a system message', message({ isSystem: true })],
  ] as const) {
    it(`rejects ${name}`, () => {
      assert.equal(isXpEligible(facts, settings), false);
    });
  }

  it('rejects every message while leveling is disabled', () => {
    assert.equal(isXpEligible(message(), { ...settings, levelingEnabled: false }), false);
  });

  it('rejects an ignored channel', () => {
    assert.equal(isXpEligible(message(), { ...settings, xpIgnoredChannelIds: [CHANNEL] }), false);
  });

  it('rejects a thread whose parent channel is ignored', () => {
    const thread = message({ channelIds: ['100000000000000009', THREAD_PARENT, CATEGORY] });
    assert.equal(isXpEligible(thread, { ...settings, xpIgnoredChannelIds: [THREAD_PARENT] }), false);
  });

  it('rejects a channel in an ignored category', () => {
    assert.equal(isXpEligible(message(), { ...settings, xpIgnoredChannelIds: [CATEGORY] }), false);
  });

  it('rejects a member with an ignored role', () => {
    assert.equal(isXpEligible(message({ roleIds: [OTHER, ROLE] }), { ...settings, xpIgnoredRoleIds: [ROLE] }), false);
  });
});
