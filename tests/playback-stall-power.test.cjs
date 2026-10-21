const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('./helpers/app-text.cjs');
const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
function load(context, name, next) {
  const start = source.indexOf('  function ' + name + '(');
  assert.notEqual(start, -1, name + ' must exist');
  const end = source.indexOf('  function ' + next + '(', start);
  assert.notEqual(end, -1);
  vm.runInContext(source.slice(start, end), context);
}
function fixture() {
  let now = 1000;
  const video = {currentTime: 40, duration: 120, readyState: 4, paused: false, ended: false, seeking: false,
    classList: {contains: () => false},
    getAttribute: () => '/media/current', pause() { this.paused = true; }};
  const playback = {started: true, episode: 2, vid: 'video', generation: 7, owner: 1, position: 0,
    item: {series_id: 'series'}, lastWrite: 0, presentation: {position: 30, waiting: true, lastAdvanceAt: 1000, bufferingSince: 1000}};
  const writes = [], refreshes = [], powers = [], statuses = [];
  const layer = {classList: {add() {}, remove() {}}};
  const context = vm.createContext({Date: {now: () => now}, Promise, Number, Math, activePlayback: playback,
    feedGeneration: 7, accountEpoch: 1, applicationInBackground: false, applicationHidden: () => false,
    isPlaybackPage: () => true, currentPlaybackPresentation: () => true, finishPlaybackPreparation() {},
    clearRangeStallTimer() {}, markPlaybackStarted() {}, document: {getElementById: id => id === 'danmaku-layer' ? layer : video},
    changeLibrary: data => { writes.push(data); return Promise.resolve(true); }, basicDrama: x => x,
    playbackInfoRequest: null, window: {HongguoTVPower: {setActive: x => powers.push(x)}},
    recoverPlaybackAfterError: (p, stall) => { refreshes.push({p, stall}); return true; },
    playbackDebug() {}, setPlayerStatus: (...args) => statuses.push(args), resetDanmaku() {},
    updatePlaybackControls() {}, scheduleControlsHide() {}, saveProgress() {}, releasePlaybackAudio() {}});
  return {context, video, playback, writes, refreshes, powers, statuses, now: value => {now = value;}};
}
test('a drifting media clock cannot clear a real buffering state or advance its anchor', () => {
  const f = fixture(); load(f.context, 'checkPlaybackProgress', 'fallbackRangePlayback');
  f.context.checkPlaybackProgress(f.video);
  assert.equal(f.playback.presentation.waiting, true);
  assert.equal(f.playback.presentation.position, 30);
});
test('forced progress saves during buffering cannot overwrite a safe resume point', async () => {
  const f = fixture(); load(f.context, 'saveProgress', 'resetEndRecommendations');
  await f.context.saveProgress(true);
  assert.equal(f.writes.length, 0);
  assert.equal(f.playback.lastWrite, 0);
});
test('buffering for eight seconds recovers even while currentTime advances', () => {
  const f = fixture(); load(f.context, 'watchPlayback', 'clearRangeTransitionHint');
  f.now(9000); f.context.watchPlayback();
  assert.equal(f.refreshes.length, 1);
  assert.equal(f.refreshes[0].stall, true);
});
test('pause and background time cannot trigger a stalled-session restart', () => {
  for (const mode of ['pause', 'background']) {
    const f = fixture(); load(f.context, 'watchPlayback', 'clearRangeTransitionHint');
    if (mode === 'pause') f.video.paused = true; else f.context.applicationInBackground = true;
    f.now(60000); f.context.watchPlayback();
    assert.equal(f.refreshes.length, 0);
  }
});
test('recovering from a drifting buffer seeks back before saving or revealing the timeline', () => {
  const f = fixture(); load(f.context, 'markPlaybackStarted', 'checkPlaybackProgress');
  f.context.markPlaybackStarted(f.playback);
  assert.equal(f.video.currentTime, 30);
  assert.equal(f.playback.presentation.waiting, true);
  assert.equal(f.playback.presentation.resyncing, true);
  f.context.markPlaybackStarted(f.playback);
  assert.equal(f.playback.presentation.waiting, false);
  assert.equal(f.playback.presentation.resyncing, false);
  assert.equal(f.playback.presentation.position, 30);
});
test('a repeated premature playing callback cannot unlock a drifting buffer', () => {
  const f = fixture(); load(f.context, 'markPlaybackStarted', 'checkPlaybackProgress');
  f.context.markPlaybackStarted(f.playback);
  f.video.currentTime = 40;
  f.context.markPlaybackStarted(f.playback);
  assert.equal(f.playback.presentation.waiting, true);
  assert.equal(f.playback.presentation.position, 30);
});
test('a stale seek acknowledgement cannot overwrite the last watched position', () => {
  const f = fixture();
  f.playback.presentation.resyncing = true;
  f.playback.presentation.resyncTarget = 30;
  load(f.context, 'recordPlaybackSeek', 'readPlaybackFrames');
  assert.equal(f.context.recordPlaybackSeek(f.playback, f.video, true), false);
  assert.equal(f.playback.presentation.position, 30);
  f.video.currentTime = 31;
  assert.equal(f.context.recordPlaybackSeek(f.playback, f.video, true), true);
  assert.equal(f.playback.presentation.position, 30);
});
test('both editions keep the screen on during buffering and release it when paused or backgrounded', () => {
  const f = fixture(); load(f.context, 'updatePlaybackPower', 'watchPlayback');
  f.context.updatePlaybackPower();
  assert.equal(f.powers.at(-1), true);
  f.video.paused = true; f.context.updatePlaybackPower(); assert.equal(f.powers.at(-1), false);
  f.video.paused = false; f.context.applicationInBackground = true;
  f.context.updatePlaybackPower(); assert.equal(f.powers.at(-1), false);
});
test('failure and source preparation have distinct screen-on ownership', () => {
  const f = fixture(); load(f.context, 'updatePlaybackPower', 'watchPlayback');
  f.playback.presentation.failed = true; f.context.updatePlaybackPower();
  assert.equal(f.powers.at(-1), false);
  f.context.activePlayback = null; f.context.playbackInfoRequest = {};
  f.context.updatePlaybackPower(); assert.equal(f.powers.at(-1), true);
  f.context.playbackInfoRequest = null; f.context.updatePlaybackPower(); assert.equal(f.powers.at(-1), false);
});
test('Android host explicitly owns and clears the common screen-on flag', () => {
  const host = fs.readFileSync(require.resolve('../android/app/src/main/java/rocks/aston/hongguotv/MainActivity.java'), 'utf8');
  assert.match(host, /addJavascriptInterface\(new PlaybackPowerBridge\(\), "HongguoTVPower"\)/);
  assert.match(host, /addFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/);
  assert.match(host, /clearFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/);
  const pause = host.slice(host.indexOf('protected void onPause()'), host.indexOf('protected void onResume()'));
  assert.match(pause, /setPlaybackScreenOn\(false\)/);
});

test('HUD position stays at the stable frame while the underlying clock drifts', () => {
  const f = fixture();
  const label = {}, span = {style: {}};
  const progress = {setAttribute(name, value) { this[name] = value; }, querySelector: () => span};
  f.context.document.getElementById = id => id === 'hero-video' ? f.video : progress;
  f.context.document.querySelector = () => label;
  f.context.clockText = String; f.context.setControlIcon = () => {};
  f.context.playbackAudioHold = null; f.context.playbackPreferences = {}; f.context.playbackQuality = '';
  f.context.shell = {classList: {contains: () => false}};
  load(f.context, 'updatePlaybackControls', 'savePlaybackPreferences');
  f.context.updatePlaybackControls();
  assert.equal(progress['aria-valuenow'], '30');
  assert.equal(span.style.width, '25%');
});

test('an exhausted stall budget pauses and exposes manual retry instead of looping', () => {
  const f = fixture();
  f.context.recoverPlaybackAfterError = () => false;
  load(f.context, 'watchPlayback', 'clearRangeTransitionHint');
  f.now(9000); f.context.watchPlayback();
  assert.equal(f.video.paused, true);
  assert.equal(f.statuses[0][1], true);
});

test('a motionless READY clock is also a stall and an old generation is ignored', () => {
  const f = fixture(); f.playback.presentation.waiting = false;
  load(f.context, 'watchPlayback', 'clearRangeTransitionHint');
  f.now(9000); f.context.watchPlayback(); assert.equal(f.refreshes.length, 1);
  f.context.feedGeneration++; f.context.watchPlayback(); assert.equal(f.refreshes.length, 1);
});

test('remote rewind during buffering is relative to the last watched position', () => {
  const f = fixture(); let selected;
  f.context.seekTo = position => { selected = position; return true; };
  load(f.context, 'seekBy', 'syncNativePlayerBounds');
  assert.equal(f.context.seekBy(-10, true), true);
  assert.equal(selected, 20);
});
test('a manual seek replaces an in-flight automatic resync target', () => {
  const f = fixture();
  f.playback.presentation.resyncing = true;
  f.playback.presentation.resyncTarget = 30;
  f.context.showNotice = () => {};
  f.context.clockText = String;
  f.context.revealControls = () => {};
  load(f.context, 'seekTo', 'syncNativePlayerBounds');
  assert.equal(f.context.seekTo(55), true);
  assert.equal(f.playback.presentation.resyncing, false);
  assert.equal(f.playback.presentation.resyncTarget, null);
});

test('switching quality while buffering retains the last watched position', async () => {
  const f = fixture(); const positions = [];
  Object.assign(f.context, {episodePrefetch: {cancel() {}}, qualityPrevious: null, qualityEpoch: 0,
    playbackQuality: '720P', playbackPreferences: {quality: '720P'}, qualityRequest: null, playerOptionsOpen: true,
    playbackRequest: null, URLSearchParams, rangePlaybackEnabled: () => false,
    fetchData: () => Promise.resolve({path: '/media/new-quality', quality: '1080P', mode: 'full'}),
    bindPlaybackPresentation() {}, stageNativePlaybackStartPosition: position => positions.push(position),
    savePlaybackPreferences() {}, closePlayerOptions() {}, playMedia: () => Promise.resolve()});
  f.video.load = () => {};
  load(f.context, 'switchQuality', 'sendDanmaku');
  f.context.switchQuality('1080P');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(positions, [30]);
  assert.equal(f.playback.position, 30);
});

test('buffering explains recovery once without repeated live announcements', () => {
  const f = fixture(); load(f.context, 'watchPlayback', 'clearRangeTransitionHint');
  f.now(4500); f.context.watchPlayback(); f.context.watchPlayback();
  assert.equal(f.statuses.length, 1);
  assert.match(f.statuses[0][0], /自动重连/);
  assert.equal(f.refreshes.length, 0);
});

test('buffering keeps visible remote controls available until playback resumes', () => {
  const f = fixture(); const timers = [];
  Object.assign(f.context, {clearTimeout() {}, setTimeout: fn => { timers.push(fn); return 1; },
    controlsTimer: null, shell: {classList: {contains: () => false}}, detailModalOpen: false,
    confirmOpen: false, playerOptionsOpen: false, discussionOpen: false, zoneOf: () => 'controls'});
  load(f.context, 'scheduleControlsHide', 'revealControls');
  f.context.scheduleControlsHide(); assert.equal(timers.length, 0);
  f.playback.presentation.waiting = false;
  f.context.scheduleControlsHide(); assert.equal(timers.length, 1);
});

test('remote seek feedback reports the clamped target near episode boundaries', () => {
  const f = fixture(); const notices = [];
  f.context.showNotice = message => notices.push(message);
  f.context.clockText = position => String(position);
  f.context.revealControls = () => {};
  load(f.context, 'seekTo', 'syncNativePlayerBounds');
  assert.equal(f.context.seekBy(-50, true), true);
  assert.equal(f.video.currentTime, 0);
  assert.match(notices.at(-1), /0/);
  assert.equal(f.context.seekTo(500), true);
  assert.equal(f.video.currentTime, 119.75);
  assert.match(notices.at(-1), /119.75/);
  const count = notices.length; f.video.duration = NaN;
  assert.equal(f.context.seekTo(10), false); assert.equal(notices.length, count);
});

test('settings controls have unique IDs so remote focus and decode state target one element', () => {
  const html = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});
