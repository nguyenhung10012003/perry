import type { Command } from "../types/command.js";
import { help } from "./general/help.js";
import { ping } from "./general/ping.js";
import { ban } from "./moderation/ban.js";
import { modCase } from "./moderation/case.js";
import { kick } from "./moderation/kick.js";
import { purge } from "./moderation/purge.js";
import { timeout } from "./moderation/timeout.js";
import { unban } from "./moderation/unban.js";
import { warn } from "./moderation/warn.js";
import { warnings } from "./moderation/warnings.js";
import { autoplay } from "./music/autoplay.js";
import { clear } from "./music/clear.js";
import { filter } from "./music/filter.js";
import { forward } from "./music/forward.js";
import { join } from "./music/join.js";
import { leave } from "./music/leave.js";
import { loop } from "./music/loop.js";
import { lyrics } from "./music/lyrics.js";
import { move } from "./music/move.js";
import { nowplaying } from "./music/nowplaying.js";
import { pause } from "./music/pause.js";
import { play } from "./music/play.js";
import { previous } from "./music/previous.js";
import { queue } from "./music/queue.js";
import { radio } from "./music/radio.js";
import { remove } from "./music/remove.js";
import { resume } from "./music/resume.js";
import { rewind } from "./music/rewind.js";
import { seek } from "./music/seek.js";
import { shuffle } from "./music/shuffle.js";
import { similar } from "./music/similar.js";
import { skip } from "./music/skip.js";
import { stop } from "./music/stop.js";
import { volume } from "./music/volume.js";
import { settings } from "./settings/settings.js";

/** Explicit command registry (no directory scanning), grouped by category. */
export const commands: Command[] = [
  // general
  ping,
  help,
  // music
  play,
  pause,
  resume,
  skip,
  previous,
  stop,
  leave,
  join,
  queue,
  nowplaying,
  volume,
  seek,
  forward,
  rewind,
  loop,
  shuffle,
  remove,
  clear,
  move,
  filter,
  lyrics,
  autoplay,
  radio,
  similar,
  // moderation
  ban,
  unban,
  kick,
  timeout,
  warn,
  warnings,
  modCase,
  purge,
  // settings
  settings,
];
