import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertSecondsToHms, restartCountdown } from '../src/utils/time.js';

test('convertSecondsToHms', () => {
  assert.equal(convertSecondsToHms(0), '0h 0m 0s');
  assert.equal(convertSecondsToHms(3725), '1h 2m 5s');
  assert.equal(convertSecondsToHms(360000), '100h 0m 0s');
});

test('restartCountdown on Saturday 23:59 is zero', () => {
  assert.equal(restartCountdown('Saturday 23:59'), '0h, 0m');
});

test('restartCountdown keeps the original minutes-as-seconds math', () => {
  // Monday 14:30 is 7769 minutes before Saturday 23:59, shown as 7769 seconds (129 min).
  assert.equal(restartCountdown('Monday 14:30'), '2h, 9m');
  assert.equal(restartCountdown('Friday 23:59'), '0h, 24m');
});

test('restartCountdown wraps to the next week after the target', () => {
  // Sunday 00:00 is one minute past the target, so 7 * 1440 - 1 = 10079 remaining (167 min).
  assert.equal(restartCountdown('Sunday 00:00'), '2h, 47m');
});

test('restartCountdown rejects garbage', () => {
  for (const input of ['', 'garbage', 'Funday 10:00', 'Monday', 'Monday 10', 'Monday 10:aa', 'Monday 10:00:00', null, undefined, 42]) {
    assert.equal(restartCountdown(input), 'N/A', String(input));
  }
});
