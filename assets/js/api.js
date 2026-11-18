/*
 * Talks to the Google Apps Script backend, or to a built-in demo backend when
 * config.apiUrl is empty. Both return the same shapes.
 */
(function () {
  var CFG = window.WEDDING_CONFIG || {};
  var DEMO = !CFG.apiUrl;

  /* ---------------- live backend (Google Apps Script) ---------------- */
  function get(params) {
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(CFG.apiUrl + (CFG.apiUrl.indexOf('?') >= 0 ? '&' : '?') + q, { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.json(); });
  }
  function post(body) {
    // text/plain keeps this a "simple" request, which Apps Script accepts from any website
    return fetch(CFG.apiUrl, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  var live = {
    invite: function (code) { return get({ action: 'invite', code: code }); },
    rsvp: function (payload) { payload.action = 'rsvp'; return post(payload); },
    admin: function (token) { return post({ action: 'admin', token: token }); },
    image: function (code, id) { return get({ action: 'image', code: code, id: id }); }
  };

  /* ---------------- demo backend (sample data, saved in this browser) ---------------- */
  var KEY = 'wedding-demo-state-v1';
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.invitations) return s; } catch (e) {}
    return JSON.parse(JSON.stringify(window.WEDDING_DEMO_DATA));
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clean(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function later(v) { return new Promise(function (res) { setTimeout(function () { res(JSON.parse(JSON.stringify(v))); }, 450); }); }
  function find(s, code) { code = clean(code); return s.invitations.filter(function (i) { return i.code === code && i.active !== false; })[0]; }

  var demo = {
    invite: function (code) {
      var s = load(), inv = find(s, code);
      if (!inv) return later({ ok: false, error: 'not_found' });
      var resp = s.responses[inv.code] || null;
      var out = {
        ok: true,
        invite: { code: inv.code, party: inv.party, email: inv.email || '', guests: inv.guests.map(function (g) { return { name: g }; }) },
        seatNote: s.seatNote || '',
        response: resp, deadline: s.deadline, deadlineText: s.deadlineText, closed: false,
        details: s.details
      };
      return later(out);
    },
    rsvp: function (p) {
      var s = load(), inv = find(s, p.code);
      if (!inv) return later({ ok: false, error: 'not_found' });
      var given = p.guests || [];
      if (given.length !== inv.guests.length) return later({ ok: false, error: 'bad_request' });
      var guests = [];
      for (var i = 0; i < inv.guests.length; i++) {
        var a = String((given[i] || {}).attending || '');
        if (a !== 'yes' && a !== 'no') return later({ ok: false, error: 'incomplete' });
        var name = inv.guests[i];
        guests.push({ name: name, attending: a });
      }
      var email = String(p.email || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return later({ ok: false, error: 'bad_email' });
      var resp = { guests: guests, email: email, message: String(p.message || '').trim().slice(0, 1000), updated: new Date().toISOString() };
      s.responses[inv.code] = resp; save(s);
      return later({ ok: true, response: resp, emailSent: !!email, deadline: s.deadline, deadlineText: s.deadlineText, details: s.details });
    },
    admin: function () {
      var s = load(), st = { invitations: 0, seats: 0, responded: 0, attending: 0, declined: 0, awaiting: 0 };
      var list = s.invitations.map(function (inv) {
        var r = s.responses[inv.code] || null;
        if (inv.active !== false) {
          st.invitations++; st.seats += inv.guests.length;
          if (r) { st.responded++; r.guests.forEach(function (g) { if (g.attending === 'yes') st.attending++; else st.declined++; }); }
          else st.awaiting += inv.guests.length;
        }
        return { code: inv.code, party: inv.party, active: inv.active !== false, invited: inv.guests.slice(), response: r };
      });
      return later({ ok: true, admin: 'demo@example.com', stats: st, invitations: list, siteUrl: CFG.siteUrl || '../wedding-site/index.html', deadline: s.deadline, deadlineText: s.deadlineText, closed: false, generated: new Date().toISOString() });
    },
    image: function (code, id) {
      return demoImages().then(function (imgs) {
        var url = imgs[id];
        if (!find(load(), code) || !url) return { ok: false, error: 'not_found' };
        var m = /^data:([^;]+);base64,(.*)$/.exec(url);
        return later({ ok: true, mime: m[1], data: m[2] });
      });
    },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };

  // placeholder photos are only downloaded in demo mode
  var demoImgPromise = null;
  function demoImages() {
    if (window.WEDDING_DEMO_IMAGES) return Promise.resolve(window.WEDDING_DEMO_IMAGES);
    return demoImgPromise || (demoImgPromise = new Promise(function (res) {
      var s = document.createElement('script'); s.src = 'assets/js/demo-images.js';
      s.onload = function () { res(window.WEDDING_DEMO_IMAGES || {}); }; s.onerror = function () { res({}); };
      document.head.appendChild(s);
    }));
  }

  window.WeddingAPI = DEMO ? demo : live;
  window.WeddingAPI.isDemo = DEMO;
})();
