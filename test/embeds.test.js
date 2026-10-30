import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLeaderboardEmbed } from '../src/services/leaderboard.js';
import { buildOnlineEmbed, formatPlayerList } from '../src/services/onlineEmbeds.js';

const config = { images: { footer: 'https://example.test/footer.gif', logs: 'https://example.test/logs.gif' } };

test('formatPlayerList handles empty and short lists', () => {
  assert.equal(formatPlayerList([]), 'No online players.');
  assert.equal(formatPlayerList(['a', 'b']), 'a\nb');
});

test('formatPlayerList cuts to the field limit and counts the rest', () => {
  const names = Array.from({ length: 300 }, (_, index) => `player-${index}`);
  const text = formatPlayerList(names);
  assert.ok(text.length <= 1024);
  const lines = text.split('\n');
  const hidden = Number(/^\+(\d+) more$/.exec(lines.at(-1))[1]);
  assert.equal(lines.length - 1 + hidden, 300);
  assert.ok(text.startsWith('player-0\nplayer-1\n'));
});

test('formatPlayerList with a single oversized name only shows the counter', () => {
  assert.equal(formatPlayerList(['x'.repeat(2000)]), '+1 more');
});

test('buildOnlineEmbed layout', () => {
  const json = buildOnlineEmbed(config, {
    server: 'eu1',
    status: { Players: 0, QueuedPlayers: 4 },
    restartTime: '2h, 9m',
    usernames: ['Alice'],
  }).toJSON();
  assert.equal(json.title, '🌐 Online Players - EU1');
  assert.equal(json.color, 0x00bfff);
  assert.deepEqual(json.fields.map((field) => [field.name, field.value, field.inline]), [
    ['Players Online', '`0`', true],
    ['Queue Length', '`4`', true],
    ['Time till restart', '`2h, 9m`', true],
    ['Online Users', 'Alice', false],
  ]);
  assert.equal(json.footer.text, 'CNR Crew Bot by penk');
  assert.equal(json.footer.icon_url, config.images.footer);
});

test('buildOnlineEmbed falls back to N/A and the empty text', () => {
  const json = buildOnlineEmbed(config, { server: 'sea1', status: undefined, restartTime: null, usernames: [] }).toJSON();
  assert.deepEqual(json.fields.map((field) => field.value), ['`N/A`', '`N/A`', '`N/A`', 'No online players.']);
});

test('buildLeaderboardEmbed lists ranks and handles no players', () => {
  const json = buildLeaderboardEmbed(config, [
    { username: 'Alice', playtime: 3725 },
    { username: 'Bob', playtime: 59 },
  ]).toJSON();
  assert.equal(json.title, '🏆 Top 10 Players by Playtime');
  assert.equal(json.color, 0xffd700);
  assert.equal(json.fields[0].value, '**1. Alice** - 1h 2m 5s\n**2. Bob** - 0h 0m 59s');
  assert.equal(buildLeaderboardEmbed(config, []).toJSON().fields[0].value, 'No players to display.');
});
