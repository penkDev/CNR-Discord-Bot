import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../src/db.js';
import { TICK_SECONDS, cappedDelta, pollOnce } from '../src/services/playtimeTracker.js';
import { startLoop } from '../src/utils/loop.js';

const config = { endpoints: new Map([['eu1', 'url-eu1'], ['us1', 'url-us1']]) };
const fetcher = (byServer) => async (server) => byServer[server] ?? null;
const player = (uid) => ({ uid, username: `name-${uid}` });
const iso = (seconds) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
const at = (seconds) => new Date(iso(seconds));

test('cappedDelta limits downtime credit to two ticks', () => {
  assert.equal(cappedDelta(0), 0);
  assert.equal(cappedDelta(61.9), 61);
  assert.equal(cappedDelta(3 * 3600), 2 * TICK_SECONDS);
  assert.equal(cappedDelta(-5), 0);
});

test('first poll creates players without playtime and stores last_run', async () => {
  const db = openDatabase(':memory:');
  assert.equal(await pollOnce({ config, db }, { now: at(0), fetchServerPlayers: fetcher({ eu1: [player('a')], us1: [] }) }), true);
  assert.equal(db.getPlayerByUid('a').playtime, 0);
  assert.equal(db.getLastRun(), iso(0));
  db.close();
});

test('online players gain the elapsed time, capped after downtime', async () => {
  const db = openDatabase(':memory:');
  const fetchServerPlayers = fetcher({ eu1: [player('a')], us1: [] });
  await pollOnce({ config, db }, { now: at(0), fetchServerPlayers });
  await pollOnce({ config, db }, { now: at(60), fetchServerPlayers });
  assert.equal(db.getPlayerByUid('a').playtime, 60);
  await pollOnce({ config, db }, { now: at(60 + 5 * 3600), fetchServerPlayers });
  assert.equal(db.getPlayerByUid('a').playtime, 60 + 2 * TICK_SECONDS);
  db.close();
});

test('players that left a queried server go offline', async () => {
  const db = openDatabase(':memory:');
  await pollOnce({ config, db }, { now: at(0), fetchServerPlayers: fetcher({ eu1: [player('a'), player('b')], us1: [] }) });
  await pollOnce({ config, db }, { now: at(60), fetchServerPlayers: fetcher({ eu1: [player('a')], us1: [] }) });
  assert.equal(db.getPlayerByUid('a').is_online, 1);
  assert.equal(db.getPlayerByUid('b').is_online, 0);
  db.close();
});

test('a failed server keeps its players online while other servers update', async () => {
  const db = openDatabase(':memory:');
  await pollOnce({ config, db }, { now: at(0), fetchServerPlayers: fetcher({ eu1: [player('a')], us1: [player('b')] }) });
  await pollOnce({ config, db }, { now: at(60), fetchServerPlayers: fetcher({ eu1: [], us1: [player('b')] }) });
  assert.equal(db.getPlayerByUid('a').is_online, 0);
  assert.equal(db.getPlayerByUid('b').is_online, 1);

  await pollOnce({ config, db }, { now: at(120), fetchServerPlayers: fetcher({ eu1: [player('a')], us1: [player('b')] }) });
  await pollOnce({ config, db }, { now: at(180), fetchServerPlayers: fetcher({ eu1: null, us1: [] }) });
  assert.equal(db.getPlayerByUid('a').is_online, 1);
  assert.equal(db.getPlayerByUid('a').playtime, 60);
  assert.equal(db.getPlayerByUid('b').is_online, 0);
  db.close();
});

test('a total outage changes nothing and keeps last_run', async () => {
  const db = openDatabase(':memory:');
  await pollOnce({ config, db }, { now: at(0), fetchServerPlayers: fetcher({ eu1: [player('a')], us1: [] }) });
  const result = await pollOnce({ config, db }, { now: at(60), fetchServerPlayers: fetcher({}) });
  assert.equal(result, false);
  assert.equal(db.getPlayerByUid('a').is_online, 1);
  assert.equal(db.getLastRun(), iso(0));
  db.close();
});

test('a player moving between servers stays online on the new server', async () => {
  const db = openDatabase(':memory:');
  await pollOnce({ config, db }, { now: at(0), fetchServerPlayers: fetcher({ eu1: [player('a')], us1: [] }) });
  await pollOnce({ config, db }, { now: at(60), fetchServerPlayers: fetcher({ eu1: [], us1: [player('a')] }) });
  const row = db.getPlayerByUid('a');
  assert.equal(row.is_online, 1);
  assert.equal(row.server, 'us1');
  db.close();
});

test('startLoop never overlaps runs and survives errors', async () => {
  let running = 0;
  let maxRunning = 0;
  let runs = 0;
  const errors = [];
  const loop = startLoop(async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    runs++;
    await new Promise((resolve) => setTimeout(resolve, 15));
    running--;
    if (runs === 2) throw new Error('boom');
  }, 2, (error) => errors.push(error.message));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await loop.stop();
  const finalRuns = runs;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(maxRunning, 1);
  assert.ok(finalRuns >= 3);
  assert.deepEqual(errors, ['boom']);
  assert.equal(runs, finalRuns);
});
