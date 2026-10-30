import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

const commandsFolder = new URL('../src/commands/', import.meta.url);
const eventsFolder = new URL('../src/events/', import.meta.url);

const EXPECTED = [
  'ban', 'clearwarnings', 'kick', 'link', 'listallmembers', 'mute',
  'playtime', 'removelinks', 'resetleaderboard', 'unlink', 'warn', 'warnings',
];

const load = (folder) => Promise.all(
  readdirSync(folder).filter((file) => file.endsWith('.js')).map((file) => import(new URL(file, folder).href)),
);

test('every command exports data and execute, names are unique and complete', async () => {
  const modules = await load(commandsFolder);
  const names = modules.map((module) => {
    assert.equal(typeof module.execute, 'function');
    assert.equal(typeof module.data?.toJSON, 'function');
    return module.data.name;
  });
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), EXPECTED);
});

test('command definitions serialize and moderation commands are permission gated', async () => {
  const modules = await load(commandsFolder);
  const byName = new Map(modules.map((module) => [module.data.name, module.data.toJSON()]));
  for (const json of byName.values()) assert.ok(json.description.length > 0);
  for (const name of ['kick', 'ban', 'mute', 'warn', 'warnings', 'clearwarnings', 'unlink', 'removelinks']) {
    assert.ok(byName.get(name).default_member_permissions, name);
  }
  assert.deepEqual(byName.get('mute').options.find((option) => option.name === 'duration').choices.map((choice) => choice.name), [
    '1 minute', '5 minutes', '10 minutes', '30 minutes', '1 hour', '4 hours', '10 hours', '1 day', '1 week',
  ]);
});

test('every event exports name and execute', async () => {
  const modules = await load(eventsFolder);
  assert.equal(modules.length, 5);
  for (const module of modules) {
    assert.ok(module.name);
    assert.equal(typeof module.execute, 'function');
  }
});
