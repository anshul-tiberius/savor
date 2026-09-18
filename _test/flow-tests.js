// Onboarding flow regression tests.
//
// Load in _test/harness.html and run with: await __TESTS.runAll()
// Each case drives the real app code through the stubs in _test/stubs.js.
//
// Every test here started life as a bug reported from a real device. Keep it
// that way: reproduce first, then fix.
(function () {
  const results = [];
  const T = window.__T;

  function check(name, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name: name, pass: pass, actual: actual, expected: expected });
    return pass;
  }

  // Tests share one page, so app-level singletons have to be reset between
  // them or later cases inherit an already-started conversation.
  function resetApp(opts) {
    opts = opts || {};
    if (!opts.keepStorage) localStorage.clear();
    window._handledAuthFor = null;
    window._onboardingStarting = false;
    appState.chatMessages = [];
    appState.micTurn = null;
    appState.micQuickFails = 0;
    appState.micNeedsGesture = false;
    appState.micContinuousUnsupported = false;
    appState.isRecording = false;
    appState.isSpeaking = false;
    appState.isTyping = false;
    const wrap = document.getElementById('chat-messages');
    if (wrap) wrap.innerHTML = '';
    T.reset();
  }

  const tests = {
    // Supabase v2 fires INITIAL_SESSION and SIGNED_IN back to back on load.
    // Both used to run loadUserData, starting onboarding twice.
    async doubleAuthEventStartsOneConversation() {
      resetApp();
      T.apiQueue = ['Greeting A. Name?', 'Greeting B. Name?'];
      T.fireAuth('INITIAL_SESSION');
      T.fireAuth('SIGNED_IN');
      await T.sleep(400);
      check('one greeting bubble', document.querySelectorAll('#chat-messages .msg.savor').length, 1);
      check('one onboarding API call', T.apiCalls.filter(c => c.mode === 'onboarding').length, 1);
    },

    // iOS delivers a trailing result after stop(). It used to repopulate the
    // composer and re-arm the silence timer, sending the same answer twice.
    async lateResultAfterSendIsIgnored() {
      T.finishSpeech();
      await T.sleep(400);
      const mic = T.activeMic;
      if (!mic) { results.push({ name: 'mic opened', pass: false, actual: null, expected: 'a mic' }); return; }
      mic._emit([{ transcript: 'I am 35 years old', isFinal: true }]);
      await T.sleep(2200);
      const sendsAfterFirst = T.apiCalls.filter(c => c.mode === 'onboarding').length;
      mic._emit([{ transcript: 'I am 35 years old', isFinal: true }]);
      await T.sleep(2200);
      check('one user bubble', document.querySelectorAll('.msg.user').length, 1);
      check('late result sent nothing', T.apiCalls.filter(c => c.mode === 'onboarding').length, sendsAfterFirst);
    },

    // Recognition that dies instantly was refused by the browser. Retry once
    // without continuous, then stop auto-opening rather than flickering.
    async instantDeathFallsBackThenStopsRetrying() {
      resetApp();
      T.apiQueue = ['How old are you?'];
      T.fireAuth('INITIAL_SESSION');
      await T.sleep(300);
      T.finishSpeech();
      await T.sleep(400);

      const first = T.activeMic;
      check('first attempt is continuous', first.continuous, true);
      first.stop();
      await T.sleep(200);
      check('retried without continuous', (T.micInstances[1] || {}).continuous, false);

      const second = T.activeMic;
      if (second && second !== first) second.stop();
      await T.sleep(200);
      check('gives up auto-opening', appState.micNeedsGesture, true);
      check('status prompts a tap', document.getElementById('chat-status').textContent, 'Tap the mic to answer');

      const before = T.micInstances.length;
      handoffToUser();
      await T.sleep(500);
      check('no further auto-attempts', T.micInstances.length, before);
    },

    // With continuous off, the browser ends the turn itself. That has to send.
    async nonContinuousEndSendsTheAnswer() {
      resetApp();
      T.apiQueue = ['How old are you?', 'Perfect! Which city?'];
      appState.micContinuousUnsupported = true;
      T.fireAuth('INITIAL_SESSION');
      await T.sleep(300);
      T.finishSpeech();
      await T.sleep(400);
      const mic = T.activeMic;
      mic._emit([{ transcript: 'I am 35', isFinal: true }]);
      await T.sleep(300);
      mic.stop();
      await T.sleep(400);
      check('answer was sent once', document.querySelectorAll('.msg.user').length, 1);
      check('conversation persisted', !!localStorage.getItem('wtc_onboarding'), true);
    },

    // iOS evicts backgrounded tabs. The reload used to restart onboarding.
    async evictedTabResumesInstead() {
      // Seed a conversation as if one had been in progress before eviction.
      resetApp();
      localStorage.setItem('wtc_onboarding', JSON.stringify({
        at: Date.now(),
        messages: [
          { role: 'assistant', content: 'How old are you?' },
          { role: 'user', content: 'I am 35' },
          { role: 'assistant', content: 'Perfect! Which city?' },
        ],
      }));
      T.apiQueue = ['FRESH GREETING - should not be requested'];
      T.fireAuth('INITIAL_SESSION');
      await T.sleep(500);
      check('history restored', appState.chatMessages.length, 3);
      check('no fresh greeting fetched', T.apiCalls.filter(c => c.mode === 'onboarding').length, 0);
      check('history not re-spoken', T.utterances.length, 0);
    },
  };

  window.__TESTS = {
    list: Object.keys(tests),
    async run(name) {
      results.length = 0;
      await tests[name]();
      return results.slice();
    },
    async runAll() {
      results.length = 0;
      const order = ['doubleAuthEventStartsOneConversation', 'lateResultAfterSendIsIgnored',
                     'instantDeathFallsBackThenStopsRetrying', 'nonContinuousEndSendsTheAnswer',
                     'evictedTabResumesInstead'];
      for (const n of order) {
        try { await tests[n](); }
        catch (e) { results.push({ name: n + ' (threw)', pass: false, actual: String(e && e.message), expected: 'no throw' }); }
      }
      const failed = results.filter(r => !r.pass);
      return {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        failures: failed,
      };
    },
  };
})();
