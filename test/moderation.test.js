import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../src/db.js';
import {
  buildProfanityRegex,
  describeWarning,
  getModerationBlocker,
  issueWarning,
} from '../src/services/moderation.js';

const member = (id, position) => ({ id, roles: { highest: { position } } });
const OWNER = 'owner';
const BOT = 'bot';

const blocker = (overrides) => getModerationBlocker({
  ownerId: OWNER,
  botId: BOT,
  actor: member('mod', 5),
  target: member('target', 2),
  ...overrides,
});

test('hierarchy check', () => {
  assert.equal(blocker({}), null);
  assert.match(blocker({ target: member(OWNER, 1) }), /owner/);
  assert.match(blocker({ target: member(BOT, 1) }), /bot/);
  assert.match(blocker({ target: member('mod', 5) }), /yourself/);
  assert.match(blocker({ target: member('peer', 5) }), /equal to or above/);
  assert.match(blocker({ target: member('boss', 9) }), /equal to or above/);
  assert.match(blocker({ botCanAct: false }), /I cannot moderate/);
});

test('the owner may moderate anyone except themselves', () => {
  assert.equal(blocker({ actor: member(OWNER, 1), target: member('boss', 9) }), null);
  assert.match(blocker({ actor: member(OWNER, 1), target: member(OWNER, 1) }), /owner/);
});

const setup = (overrides = {}) => {
  const db = openDatabase(':memory:');
  const config = { moderation: { warnTimeoutThreshold: 3, warnTimeoutMinutes: 60, ...overrides } };
  const timeouts = [];
  const target = {
    id: 'victim',
    timeout: async (ms, reason) => { timeouts.push({ ms, reason }); },
  };
  return { db, config, timeouts, target };
};

test('no timeout below the threshold, timeout from the threshold on', async () => {
  const { db, config, timeouts, target } = setup();
  const warn = () => issueWarning({ db, config }, { member: target, moderatorId: 'mod', reason: 'spam' });

  assert.deepEqual(await warn(), { count: 1, timeoutApplied: false, timeoutError: null });
  assert.deepEqual(await warn(), { count: 2, timeoutApplied: false, timeoutError: null });
  assert.equal(timeouts.length, 0);

  const third = await warn();
  assert.equal(third.count, 3);
  assert.equal(third.timeoutApplied, true);
  assert.deepEqual(timeouts.map((entry) => entry.ms), [60 * 60_000]);

  await warn();
  assert.equal(timeouts.length, 2);
  db.close();
});

test('a failing timeout keeps the warning and reports the error', async () => {
  const { db, config, target } = setup({ warnTimeoutThreshold: 1 });
  target.timeout = async () => { throw new Error('Missing Permissions'); };
  const result = await issueWarning({ db, config }, { member: target, moderatorId: 'mod', reason: 'spam' });
  assert.equal(result.timeoutApplied, false);
  assert.equal(result.timeoutError, 'Missing Permissions');
  assert.equal(db.countWarnings('victim'), 1);
  assert.match(describeWarning(result, config), /Timeout failed: Missing Permissions/);
  db.close();
});

test('describeWarning', () => {
  const config = { moderation: { warnTimeoutMinutes: 60 } };
  assert.equal(describeWarning({ timeoutApplied: true }, config), 'Timeout applied for 60 minutes.');
  assert.equal(describeWarning({ timeoutApplied: false, timeoutError: null }, config), 'No timeout applied.');
});

test('clearing warnings resets the count', async () => {
  const { db, config, target } = setup();
  await issueWarning({ db, config }, { member: target, moderatorId: 'mod', reason: 'a' });
  await issueWarning({ db, config }, { member: target, moderatorId: 'mod', reason: 'b' });
  assert.equal(db.clearWarnings('victim'), 2);
  const result = await issueWarning({ db, config }, { member: target, moderatorId: 'mod', reason: 'c' });
  assert.equal(result.count, 1);
  db.close();
});

test('profanity regex matches whole words case insensitively', () => {
  const regex = buildProfanityRegex(['bad', 'worse']);
  assert.equal(regex.exec('This is BAD!')?.[0], 'BAD');
  assert.equal(regex.exec('a worse day')?.[0], 'worse');
  assert.equal(regex.exec('badge of honor'), null);
  assert.equal(regex.exec('bad_word'), null);
  assert.equal(regex.exec('nothing here'), null);
});

test('regex characters in words are literal', () => {
  const regex = buildProfanityRegex(['a+b', 'c.d', '(x)']);
  assert.equal(regex.exec('say a+b now')?.[0], 'a+b');
  assert.equal(regex.exec('aab'), null);
  assert.equal(regex.exec('cxd'), null);
  assert.equal(regex.exec('c.d')?.[0], 'c.d');
  assert.equal(regex.exec('hi (x) there')?.[0], '(x)');
});

test('profanity regex handles unicode', () => {
  const regex = buildProfanityRegex(['scheiße', 'über']);
  assert.equal(regex.exec('so eine Scheiße')?.[0], 'Scheiße');
  assert.equal(regex.exec('ÜBER alles')?.[0], 'ÜBER');
  assert.equal(regex.exec('Überzeugung'), null);
});

test('empty word list builds no regex', () => {
  assert.equal(buildProfanityRegex([]), null);
  assert.equal(buildProfanityRegex(['  ', '']), null);
});
