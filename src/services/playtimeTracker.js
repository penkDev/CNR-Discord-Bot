import { fetchPlayers } from './cnrApi.js';

export const TICK_SECONDS = 60;
const MAX_DELTA_SECONDS = 2 * TICK_SECONDS;

export function cappedDelta(elapsedSeconds) {
  return Math.max(0, Math.min(Math.floor(elapsedSeconds), MAX_DELTA_SECONDS));
}

/** Runs one poll. Returns false and leaves the state untouched when every server failed. */
export async function pollOnce({ config, db }, { now = new Date(), fetchServerPlayers = fetchPlayers } = {}) {
  const lastRun = db.getLastRun();
  const elapsedSeconds = lastRun ? (now - new Date(lastRun)) / 1000 : 0;

  const settled = await Promise.allSettled(
    [...config.endpoints].map(async ([server, url]) => ({ server, players: await fetchServerPlayers(server, url) })),
  );
  const results = settled
    .filter((outcome) => outcome.status === 'fulfilled' && outcome.value.players !== null)
    .map((outcome) => outcome.value);

  if (results.length === 0) {
    console.warn('No server could be queried, keeping the previous state.');
    return false;
  }

  db.applyPoll({
    results,
    delta: cappedDelta(Number.isNaN(elapsedSeconds) ? 0 : elapsedSeconds),
    nowIso: now.toISOString(),
    lastRunIso: now.toISOString(),
  });
  return true;
}
