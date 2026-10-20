(function (root) {
  'use strict';

  // Keep automatic recovery deliberately small. A player error must not turn
  // into an unbounded source/player restart loop on a TV.
  function create(options) {
    options = options || {};
    var configured = Number(options.maxAttempts);
    var maximum = isFinite(configured) && configured >= 0 ? Math.floor(configured) : 1;
    var attempts = 0;
    return {
      reset: function () { attempts = 0; },
      next: function (context) {
        context = context || {};
        // Generic decoder/session errors still stop MPV. A measured playback
        // stall is recoverable through its existing fenced source-switch path.
        if (context.native === 'mpv' && !context.stalled) return 'stop';
        if (attempts < maximum) {
          attempts++;
          return 'refresh';
        }
        return 'stop';
      },
      attempts: function () { return attempts; }
    };
  }

  root.HongguoPlaybackRecovery = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = root.HongguoPlaybackRecovery;
})(typeof window !== 'undefined' ? window : globalThis);
