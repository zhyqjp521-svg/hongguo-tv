const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const file = require('node:path').join(__dirname, '../core/cmd/hongguotv/ui/episode-transition.js');
function fixture(reduced = false) {
  assert.ok(fs.existsSync(file), 'episode fade controller must be implemented');
  const controller = require(file);
  const names = new Set(), timers = new Map(); let now = 0, next = 0;
  const panel = {classList:{add: x => names.add(x), remove: (...xs) => xs.forEach(x => names.delete(x))},setAttribute(k,v){this[k]=v}};
  const hero = {classList:panel.classList}, title = {textContent:''};
  const context = {generation:1,owner:7};
  const api = controller.create({panel,hero,title,isCurrent:x=>x.generation===context.generation&&x.owner===context.owner,
    reducedMotion:()=>reduced,setTimeout:(fn,delay)=>{timers.set(++next,{fn,at:now+delay});return next},clearTimeout:id=>timers.delete(id)});
  const advance = ms => {now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}};
  return {api,names,panel,title,context,advance,timers};
}
test('natural continuation reaches black before adopting the next source and stays covered while loading',async()=>{
  const f=fixture();let settled=false;
  const black=f.api.begin({...f.context},'第2集').then(x=>{settled=x;return x});
  assert.equal(f.title.textContent,'第2集');assert.ok(f.names.has('is-active'));
  f.advance(199);await Promise.resolve();assert.equal(settled,false);
  f.advance(1);assert.equal(await black,true);
  f.context.generation=2;assert.equal(f.api.adopt({...f.context}),true);
  f.advance(30000);assert.ok(f.api.matches(f.context));assert.ok(f.names.has('is-active'));
});
test('first usable frame fades in once and releases only after the fade finishes',async()=>{
  const f=fixture();const black=f.api.begin({...f.context},'第2集');f.advance(200);await black;
  let revealed=false;const ready=f.api.reveal(f.context).then(x=>{revealed=x;return x});
  assert.ok(f.names.has('is-revealing'));
  f.advance(279);await Promise.resolve();assert.equal(revealed,false);
  f.advance(1);assert.equal(await ready,true);assert.equal(f.api.matches(f.context),false);
  assert.equal(f.panel['aria-hidden'],'true');assert.equal(f.names.has('is-active'),false);
});
test('waiting during fade-in restores black and an old reveal cannot unmask it',async()=>{
  const f=fixture();const black=f.api.begin({...f.context},'第2集');f.advance(200);await black;
  const reveal=f.api.reveal(f.context);f.advance(100);f.api.hold(f.context);
  assert.equal(await reveal,false);f.advance(1000);assert.ok(f.names.has('is-active'));
  assert.equal(f.names.has('is-revealing'),false);
  const retry=f.api.reveal(f.context);f.advance(280);assert.equal(await retry,true);
});
test('leaving or changing account cancels the pending fade without retaining a black screen',async()=>{
  for(const kind of ['generation','owner','cancel']) {
    const f=fixture();const pending=f.api.begin({...f.context},'第2集');
    if(kind==='cancel')f.api.cancel();else f.context[kind]++;
    f.advance(200);assert.equal(await pending,false);assert.equal(f.names.has('is-active'),false);
  }
});
test('rapid switches settle the prior promise and reduced motion keeps a short opacity transition',async()=>{
  const f=fixture(true);const old=f.api.begin({...f.context},'第2集');const fresh=f.api.begin({...f.context},'第3集');
  assert.equal(await old,false);f.advance(80);assert.equal(await fresh,true);
  const ready=f.api.reveal(f.context);f.advance(80);assert.equal(await ready,true);
});
test('integration keeps natural continuation covered until first frame and suppresses duplicate loading overlays',()=>{
  const app=fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'),'utf8');
  const start=app.slice(app.indexOf('  function continueAfterEpisode('),app.indexOf('  function offerNextSeasonReservation('));
  assert.match(start,/episodeTransition\.begin/);
  const audio=app.slice(app.indexOf('  function releasePresentedAudio('),app.indexOf('  function waitForPlaybackPaint('));
  assert.match(audio,/episodeTransition\.reveal/);
  const css=fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.css'),'utf8');
  assert.match(css,/has-episode-fade \.player-status\.is-loading/);
});
