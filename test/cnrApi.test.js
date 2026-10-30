import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlayers } from '../src/services/cnrApi.js';

test('parsePlayers reads both username formats and skips incomplete entries', () => {
  const players = parsePlayers([
    { Uid: 'a', Username: 'Plain' },
    { Uid: 'b', Username: { Username: 'Nested' } },
    { Uid: 'c' },
    { Username: 'NoUid' },
    { Uid: 'd', Username: {} },
    null,
  ]);
  assert.deepEqual(players, [
    { uid: 'a', username: 'Plain' },
    { uid: 'b', username: 'Nested' },
  ]);
});

test('parsePlayers returns null for non array responses and [] for an empty server', () => {
  assert.equal(parsePlayers(null), null);
  assert.equal(parsePlayers({ error: 'x' }), null);
  assert.deepEqual(parsePlayers([]), []);
});
