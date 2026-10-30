import { Events } from 'discord.js';
import { registerCommands } from '../registerCommands.js';
import { updateLeaderboard } from '../services/leaderboard.js';
import { updateOnlineEmbeds } from '../services/onlineEmbeds.js';
import { TICK_SECONDS, pollOnce } from '../services/playtimeTracker.js';
import { ensureVerificationMessage } from '../services/verification.js';
import { startLoop } from '../utils/loop.js';

const LEADERBOARD_INTERVAL_MS = 2 * 60 * 1000;

export const name = Events.ClientReady;
export const once = true;

export async function execute(ctx, client) {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands(ctx);

  if (ctx.config.verification.enabled) {
    await ensureVerificationMessage(ctx).catch((error) => console.error('Verification message setup failed:', error));
  }

  ctx.loops.push(
    startLoop(async () => {
      await pollOnce(ctx);
      await updateOnlineEmbeds(ctx);
    }, TICK_SECONDS * 1000),
    startLoop(() => updateLeaderboard(ctx), LEADERBOARD_INTERVAL_MS),
  );
}
