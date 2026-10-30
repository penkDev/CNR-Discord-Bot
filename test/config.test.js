import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, parseConfig } from '../src/config.js';

const valid = `
bottoken: abc.def
guild_id: 1234567890123456789
staff_role_id: "111111111111111111"
crewmember_role_id: 222222222222222222
server_status_endpoint: "https://example.test/servers"
endpoints:
  eu1: "https://example.test/eu1"
  sea1: "https://example.test/sea1"
status_endpoints:
  'server_name EU1': 'https://example.test/info.json'
staff_logs_channel_id: 333333333333333333
online_users_channel_id: YOUR_ONLINE_USERS_CHANNEL_ID_HERE
`;

const problemsOf = (text) => {
  try {
    parseConfig(text);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  assert.fail('expected a ConfigError');
};

test('valid config is normalized', () => {
  const config = parseConfig(valid);
  assert.equal(config.botToken, 'abc.def');
  assert.equal(config.staffRoleId, '111111111111111111');
  assert.equal(config.channels.staffLogs, '333333333333333333');
  assert.equal(config.channels.onlineUsers, null);
  assert.deepEqual([...config.endpoints.keys()], ['eu1', 'sea1']);
  assert.equal(config.statusEndpoints.get('server_name EU1'), 'https://example.test/info.json');
  assert.equal(config.moderation.warnTimeoutThreshold, 3);
  assert.equal(config.moderation.warnTimeoutMinutes, 60);
  assert.equal(config.moderation.profanity.enabled, false);
  assert.match(config.images.footer, /^https:\/\/i\.pinimg\.com\//);
  assert.ok(config.warnings.some((warning) => warning.includes('online_users_channel_id')));
});

test('19 digit ids keep their exact value', () => {
  assert.equal(parseConfig(valid).guildId, '1234567890123456789');
});

test('placeholders and missing required fields are reported all at once', () => {
  const problems = problemsOf(valid
    .replace('bottoken: abc.def', 'bottoken: bot_token_here')
    .replace('guild_id: 1234567890123456789\n', '')
    .replace(/endpoints:\n {2}eu1.*\n {2}sea1.*\n/, ''));
  assert.equal(problems.length, 3);
  assert.ok(problems.some((problem) => problem.startsWith('bottoken')));
  assert.ok(problems.some((problem) => problem.startsWith('guild_id')));
  assert.ok(problems.some((problem) => problem.startsWith('endpoints')));
});

test('ids must be numeric', () => {
  const problems = problemsOf(valid.replace('crewmember_role_id: 222222222222222222', 'crewmember_role_id: abc'));
  assert.deepEqual(problems, ['crewmember_role_id is missing, still a placeholder or not a numeric ID']);
});

test('moderation values are validated', () => {
  assert.equal(problemsOf(`${valid}moderation:\n  warn_timeout_threshold: 0\n`).length, 1);
  assert.equal(problemsOf(`${valid}moderation:\n  warn_timeout_minutes: 40321\n`).length, 1);
  assert.equal(problemsOf(`${valid}moderation:\n  warn_timeout_minutes: 1.5\n`).length, 1);
  const config = parseConfig(`${valid}moderation:\n  warn_timeout_threshold: 5\n  warn_timeout_minutes: 40320\n  profanity:\n    enabled: true\n    words: [a+b]\n`);
  assert.equal(config.moderation.warnTimeoutThreshold, 5);
  assert.deepEqual(config.moderation.profanity, { enabled: true, words: ['a+b'] });
});

test('verification without ids is disabled with a warning', () => {
  const config = parseConfig(`${valid}verification:\n  enabled: true\n  verification_channel_id: channel_id_here\n`);
  assert.equal(config.verification.enabled, false);
  assert.ok(config.warnings.some((warning) => warning.includes('verification')));
});
