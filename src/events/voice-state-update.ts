import { Events } from 'discord.js';
import { handleVoiceStateUpdate } from '../music/lifecycle.js';
import type { BotEvent } from './index.js';

export const voiceStateUpdate: BotEvent<Events.VoiceStateUpdate> = {
  name: Events.VoiceStateUpdate,
  execute(client, oldState, newState) {
    handleVoiceStateUpdate(client, oldState, newState);
  },
};
