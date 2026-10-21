const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/index.html'), 'utf8');
const css = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.css'), 'utf8');

test('episode changes do not install a full-screen black transition', () => {
  assert.doesNotMatch(html, /id="episode-transition"/);
  assert.doesNotMatch(html, /episode-transition\.js/);
  assert.doesNotMatch(css, /\.episode-transition/);
  assert.doesNotMatch(app, /HongguoEpisodeTransition|episodeTransition/);
});

test('natural continuation starts the prepared episode directly', () => {
  const start = app.indexOf('  function continueAfterEpisode(');
  const end = app.indexOf('  function updateDanmakuStats(', start);
  const body = app.slice(start, end);
  assert.match(body, /playFeedItem\(feedIndex, playback\.episode \+ 1, 0, playback\)/);
  assert.doesNotMatch(body, /episodeTransition/);
});
