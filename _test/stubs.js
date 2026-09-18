// Test stubs for the onboarding flow.
//
// Injected into a copy of launch.html by _test/build-harness.js, immediately
// after the Supabase CDN tag and before the app's own script. Everything the
// onboarding flow touches that we cannot drive in a headless browser -- the
// mic, the speech synthesiser, the API and Supabase auth -- is replaced with a
// controllable fake, so the real application code runs unmodified.
//
// Drive it from the console (or a test script) via window.__T.
(function () {
  const T = {
    log: [],            // ordered trace of everything the app did
    apiCalls: [],       // {mode, body}
    apiQueue: [],       // scripted responses, consumed in order
    apiDelay: 10,
    micInstances: [],
    activeMic: null,
    utterances: [],
    activeUtterance: null,
    session: { user: { id: 'test-user', email: 'test@example.com' } },
    _authCb: null,
  };
  window.__T = T;
  const note = (s) => { T.log.push(s); };

  // ── Speech recognition ───────────────────────────────────────────────────
  function FakeRecognition() {
    this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1;
    this._started = false;
    T.micInstances.push(this);
  }
  FakeRecognition.prototype.start = function () {
    if (this._started) { note('mic.start(ALREADY_STARTED_THROW)'); throw new Error('already started'); }
    this._started = true; T.activeMic = this; note('mic.start');
  };
  FakeRecognition.prototype.stop = function () {
    if (!this._started) { note('mic.stop(noop)'); return; }
    this._started = false; note('mic.stop');
    if (this.onend) this.onend();
  };
  FakeRecognition.prototype.abort = FakeRecognition.prototype.stop;

  // chunks: [{transcript, isFinal}]
  FakeRecognition.prototype._emit = function (chunks) {
    const results = chunks.map(function (c) {
      const alt = [{ transcript: c.transcript, confidence: 0.9 }];
      alt.isFinal = !!c.isFinal;
      return alt;
    });
    results.resultIndex = 0;
    note('mic.result[' + chunks.map(c => (c.isFinal ? 'F:' : 'i:') + c.transcript).join('|') + ']');
    if (this.onresult) this.onresult({ results: results, resultIndex: 0 });
  };
  FakeRecognition.prototype._error = function (kind) {
    note('mic.error:' + kind);
    this._started = false;
    if (this.onerror) this.onerror({ error: kind });
  };
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;

  // ── Speech synthesis ─────────────────────────────────────────────────────
  const VOICES = [{ name: 'Rishi', lang: 'en-IN', localService: true }];
  // window.speechSynthesis is a read-only accessor, so a plain assignment is
  // silently ignored and the real synthesiser keeps being called.
  const fakeSynth = {
    _speaking: false,
    get speaking() { return this._speaking; },
    getVoices: function () { return VOICES; },
    speak: function (u) { this._speaking = true; T.utterances.push(u); T.activeUtterance = u; note('tts.speak'); },
    cancel: function () { if (this._speaking) note('tts.cancel'); this._speaking = false; },
    pause: function () {}, resume: function () {},
    onvoiceschanged: null,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fakeSynth, configurable: true, writable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.lang = ''; this.rate = 1; };

  T.finishSpeech = function () {
    const u = T.activeUtterance;
    fakeSynth._speaking = false;
    note('tts.end');
    if (u && u.onend) u.onend();
  };

  // ── API ──────────────────────────────────────────────────────────────────
  const realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (String(url).indexOf('/api/chat') === -1) return realFetch(url, opts);
    const body = JSON.parse((opts && opts.body) || '{}');
    T.apiCalls.push({ mode: body.mode, body: body });
    note('api:' + body.mode);
    const next = T.apiQueue.length ? T.apiQueue.shift() : 'Scripted reply. What next?';
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ text: next }); } });
      }, T.apiDelay);
    });
  };

  // ── Supabase ─────────────────────────────────────────────────────────────
  const chain = {
    select: function () { return this; }, eq: function () { return this; },
    order: function () { return this; }, limit: function () { return this; },
    maybeSingle: function () { return Promise.resolve({ data: null }); },
    upsert: function () { note('db.upsert'); return Promise.resolve({}); },
    insert: function () { return Promise.resolve({}); },
  };
  window.supabase = {
    createClient: function () {
      return {
        auth: {
          onAuthStateChange: function (cb) { T._authCb = cb; return { data: { subscription: { unsubscribe: function () {} } } }; },
          getSession: function () { return Promise.resolve({ data: { session: T.session } }); },
          signOut: function () { return Promise.resolve({}); },
          signInWithOAuth: function () { return Promise.resolve({}); },
        },
        from: function () { return Object.create(chain); },
      };
    },
  };

  // Fire the auth events Supabase v2 emits on load. Real iOS Safari has been
  // observed firing INITIAL_SESSION and SIGNED_IN back to back.
  T.fireAuth = function (event) {
    note('auth:' + event);
    if (T._authCb) return T._authCb(event, T.session);
  };

  T.reset = function () { T.log = []; T.apiCalls = []; T.micInstances = []; T.utterances = []; };
  T.trace = function () { return T.log.join('\n'); };
  T.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
})();
