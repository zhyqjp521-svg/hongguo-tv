(function (root) {
  'use strict';
  function create(options) {
    var panel = options.panel, hero = options.hero, title = options.title;
    var later = options.setTimeout || setTimeout, clear = options.clearTimeout || clearTimeout;
    var session = null;
    function settle(record, value) {
      if (record.resolve) { var resolve = record.resolve; record.resolve = null; resolve(value); }
      clear(record.timer); record.timer = null;
    }
    function cancel() {
      if (session) settle(session, false);
      session = null;
      panel.classList.remove('is-active', 'is-revealing');
      hero.classList.remove('has-episode-fade');
      panel.setAttribute('aria-hidden', 'true');
    }
    function matches(context) {
      return !!(session && context && session.context.generation === context.generation && session.context.owner === context.owner);
    }
    function duration(normal) { return options.reducedMotion && options.reducedMotion() ? 80 : normal; }
    function wait(record, delay, complete) {
      record.promise = new Promise(function (resolve) {
        record.resolve = resolve;
        record.timer = later(function () {
          if (session !== record) return;
          if (!options.isCurrent(record.context)) { cancel(); return; }
          complete();
        }, delay);
      });
      return record.promise;
    }
    return {
      begin: function (context, label) {
        cancel();
        var record = { context: {generation: context.generation, owner: context.owner}, phase: 'out' };
        if (!options.isCurrent(record.context)) return Promise.resolve(false);
        session = record;
        title.textContent = label;
        hero.classList.add('has-episode-fade');
        panel.classList.add('is-active');
        panel.setAttribute('aria-hidden', 'false');
        return wait(record, duration(200), function () { record.phase = 'black'; settle(record, true); });
      },
      matches: matches,
      adopt: function (context) {
        if (!session || session.phase !== 'black' || session.context.owner !== context.owner) { cancel(); return false; }
        session.context = {generation: context.generation, owner: context.owner};
        return true;
      },
      reveal: function (context) {
        if (!matches(context)) return Promise.resolve(false);
        if (session.phase === 'in') return session.promise;
        if (session.phase !== 'black') return Promise.resolve(false);
        var record = session;
        record.phase = 'in'; panel.classList.add('is-revealing');
        return wait(record, duration(280), function () {
          settle(record, true); session = null;
          panel.classList.remove('is-active', 'is-revealing');
          hero.classList.remove('has-episode-fade');
          panel.setAttribute('aria-hidden', 'true');
        });
      },
      hold: function (context) {
        if (!matches(context) || session.phase !== 'in') return;
        settle(session, false); session.phase = 'black'; panel.classList.remove('is-revealing');
      },
      cancel: cancel
    };
  }
  root.HongguoEpisodeTransition = {create: create};
  if (typeof module === 'object' && module.exports) module.exports = root.HongguoEpisodeTransition;
})(typeof window !== 'undefined' ? window : globalThis);
