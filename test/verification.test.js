import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CaptchaStore, generateCode, renderCaptcha } from '../src/services/verification.js';

test('generated codes have five alphanumeric characters', () => {
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    const code = generateCode();
    assert.match(code, /^[A-Za-z0-9]{5}$/);
    codes.add(code);
  }
  assert.ok(codes.size > 150);
});

test('captcha image is a png', async () => {
  const buffer = await renderCaptcha('Ab3Zq');
  assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('correct code is accepted once', () => {
  const store = new CaptchaStore();
  const token = store.create('u1', 'Ab3Zq');
  assert.equal(store.redeem(token, 'u1', ' Ab3Zq '), 'ok');
  assert.equal(store.redeem(token, 'u1', 'Ab3Zq'), 'invalid');
});

test('comparison is case sensitive and a wrong code consumes the captcha', () => {
  const store = new CaptchaStore();
  const token = store.create('u1', 'Ab3Zq');
  assert.equal(store.redeem(token, 'u1', 'ab3zq'), 'incorrect');
  assert.equal(store.redeem(token, 'u1', 'Ab3Zq'), 'invalid');
});

test('another user cannot use or burn a token', () => {
  const store = new CaptchaStore();
  const token = store.create('u1', 'Ab3Zq');
  assert.equal(store.redeem(token, 'u2', 'Ab3Zq'), 'invalid');
  assert.equal(store.redeem(token, 'u1', 'Ab3Zq'), 'ok');
});

test('captchas expire after the ttl', () => {
  const ttl = 5 * 60 * 1000;
  let now = 1000;
  const store = new CaptchaStore(ttl, () => now);

  const valid = store.create('u1', 'Ab3Zq');
  now += ttl - 1;
  assert.equal(store.redeem(valid, 'u1', 'Ab3Zq'), 'ok');

  const expiring = store.create('u1', 'Ab3Zq');
  now += ttl;
  assert.equal(store.redeem(expiring, 'u1', 'Ab3Zq'), 'expired');
  assert.equal(store.redeem(expiring, 'u1', 'Ab3Zq'), 'invalid');
});

test('a new captcha replaces the open one of the same user', () => {
  const store = new CaptchaStore();
  const first = store.create('u1', 'AAAAA');
  const second = store.create('u1', 'BBBBB');
  assert.equal(store.redeem(first, 'u1', 'AAAAA'), 'invalid');
  assert.equal(store.redeem(second, 'u1', 'BBBBB'), 'ok');
});
