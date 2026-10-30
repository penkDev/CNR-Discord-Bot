import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.js';

const SNOWFLAKE = '1234567890123456789';

test('players, links and playtime round trip', () => {
  const db = openDatabase(':memory:');
  db.applyPoll({
    results: [{ server: 'eu1', players: [{ uid: 'u1', username: 'Alice' }] }],
    delta: 0,
    nowIso: '2026-01-01T00:00:00.000Z',
    lastRunIso: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(db.getPlayerByUsername('Alice').uid, 'u1');
  db.upsertLink('d1', 'u1');
  assert.equal(db.getLinkOwner('u1'), 'd1');
  assert.deepEqual(db.linkedOnlineUsernames('eu1'), ['Alice']);
  assert.equal(db.topPlayers(10)[0].username, 'Alice');
  assert.equal(db.deleteLink('d1'), 1);
  assert.equal(db.getLinkByDiscordId('d1'), null);
  db.close();
});

test('19 digit message ids round trip exactly', () => {
  const db = openDatabase(':memory:');
  db.setOnlineMessageId('eu1', SNOWFLAKE);
  db.setLeaderboardMessageId(SNOWFLAKE);
  db.setVerificationMessage(SNOWFLAKE, '8876543210987654321');
  assert.equal(db.getOnlineMessageId('eu1'), SNOWFLAKE);
  assert.equal(db.getLeaderboardMessageId(), SNOWFLAKE);
  assert.equal(db.getVerificationMessageId(), SNOWFLAKE);
  assert.equal(db.getOnlineMessageId('missing'), null);
  db.setLeaderboardMessageId('1234567890123456780');
  assert.equal(db.getLeaderboardMessageId(), '1234567890123456780');
  db.close();
});

test('a database created by the python bot stays readable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cnr-db-'));
  const path = join(directory, 'players.db');
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE players (uid TEXT PRIMARY KEY, username TEXT, playtime INTEGER DEFAULT 0, last_seen TEXT, server TEXT, is_online INTEGER DEFAULT 0);
      CREATE TABLE online_users_embed (server TEXT PRIMARY KEY, message_id INTEGER);
      CREATE TABLE leaderboard_embed (id INTEGER PRIMARY KEY CHECK (id = 1), message_id INTEGER);
      INSERT INTO players (uid, username, playtime) VALUES ('u1', 'Old', 500);
      INSERT INTO online_users_embed (server, message_id) VALUES ('eu1', ${SNOWFLAKE});
      INSERT INTO leaderboard_embed (id, message_id) VALUES (1, ${SNOWFLAKE});
    `);
    legacy.close();

    const db = openDatabase(path);
    assert.equal(db.getPlayerByUid('u1').playtime, 500);
    assert.equal(db.getOnlineMessageId('eu1'), SNOWFLAKE);
    assert.equal(db.getLeaderboardMessageId(), SNOWFLAKE);
    db.setOnlineMessageId('eu1', '1234567890123456780');
    assert.equal(db.getOnlineMessageId('eu1'), '1234567890123456780');
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('transaction rolls back on error', () => {
  const db = openDatabase(':memory:');
  assert.throws(() => db.transaction(() => {
    db.upsertLink('d1', 'u1');
    throw new Error('boom');
  }), /boom/);
  assert.equal(db.getLinkByDiscordId('d1'), null);
  db.close();
});

test('warnings are stored newest first and can be cleared', () => {
  const db = openDatabase(':memory:');
  db.addWarning('d1', 'm1', 'first', '2026-01-01T00:00:00.000Z');
  db.addWarning('d1', 'm1', 'second', '2026-01-02T00:00:00.000Z');
  db.addWarning('d2', 'm1', 'other', '2026-01-02T00:00:00.000Z');
  assert.equal(db.countWarnings('d1'), 2);
  assert.deepEqual(db.listWarnings('d1', 10).map((warning) => warning.reason), ['second', 'first']);
  assert.equal(db.listWarnings('d1', 1).length, 1);
  assert.equal(db.clearWarnings('d1'), 2);
  assert.equal(db.countWarnings('d1'), 0);
  assert.equal(db.countWarnings('d2'), 1);
  db.close();
});
