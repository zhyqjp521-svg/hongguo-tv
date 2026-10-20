const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../core/cmd/hongguotv/ui/playback-recovery.js');

test('refreshes a failed non-MPV source once and then stops', () => {
  const recovery = create({maxAttempts: 1});
  assert.equal(recovery.next({native: ''}), 'refresh');
  assert.equal(recovery.attempts(), 1);
  assert.equal(recovery.next({native: ''}), 'stop');
});

test('never automatically rebuilds an MPV session', () => {
  const recovery = create({maxAttempts: 1});
  assert.equal(recovery.next({native: 'mpv'}), 'stop');
  assert.equal(recovery.attempts(), 0);
});

test('reset starts a new bounded recovery window', () => {
  const recovery = create({maxAttempts: 1});
  assert.equal(recovery.next({}), 'refresh');
  recovery.reset();
  assert.equal(recovery.next({}), 'refresh');
});

test('MPV stalls may refresh at most three times while generic MPV errors still stop', () => {
  const recovery = create({maxAttempts: 3});
  assert.equal(recovery.next({native: 'mpv'}), 'stop');
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal(recovery.next({native: 'mpv', stalled: true}), 'refresh');
    assert.equal(recovery.attempts(), attempt);
  }
  assert.equal(recovery.next({native: 'mpv', stalled: true}), 'stop');
});
