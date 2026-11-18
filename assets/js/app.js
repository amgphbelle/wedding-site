/* Wedding site: invitation code → RSVP card + details. Names, date and place appear only once a code checks out. */
(function () {
  var CFG = window.WEDDING_CONFIG || {};
  var API = window.WeddingAPI;
  var CODE_KEY = 'wedding-code';
  var card = document.getElementById('rsvp-card');
  var detailsEl = document.getElementById('details');
  var state = { code: '', data: null };

  /* ---------- tiny DOM helpers (all guest text goes in as text, never as HTML) ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function show(nodes) {
    if (!show.keepCompact) card.classList.remove('compact');
    card.innerHTML = '';
    nodes.forEach(function (n) { if (n) card.appendChild(n); });
    card.classList.remove('fade-in'); void card.offsetWidth; card.classList.add('fade-in');
  }
  function ornament() {
    return el('div', { class: 'ornament', 'aria-hidden': 'true' }, [el('span'), el('i', { text: '✦' }), el('span')]);
  }
  function linkify(text) {
    var frag = document.createDocumentFragment(), re = /(https?:\/\/[^\s]+)/g, last = 0, m;
    text = String(text || '');
    while ((m = re.exec(text))) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(el('a', { href: m[1], target: '_blank', rel: 'noopener', text: m[1] }));
      last = m.index + m[1].length;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
  function multiline(text) {
    var p = el('p');
    String(text || '').split('\n').forEach(function (line, i) { if (i) p.appendChild(el('br')); p.appendChild(linkify(line)); });
    return p;
  }

  /* ---------- states ---------- */
  // badCode: a code that didn't check out. It goes back in the box and in the message so the guest can spot a typo.
  function renderCodeEntry(message, badCode, focus) {
    var input = el('input', { id: 'code', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '12', placeholder: 'Your code', 'aria-describedby': 'code-help' });
    var shown = '';
    if (badCode) {
      shown = String(badCode).trim().toUpperCase();
      if (shown.length > 24) shown = shown.slice(0, 24) + '…';
      input.value = shown;
      input.setAttribute('aria-invalid', 'true');
      var picked = false;
      input.addEventListener('focus', function () { if (!picked) { picked = true; input.select(); } });   // easy to fix or type over
    }
    var form = el('form', { class: 'code-form', onsubmit: function (e) { e.preventDefault(); var c = input.value.trim(); if (c) load(c, true); } }, [
      el('label', { for: 'code', class: 'field-label', text: 'Invitation code' }),
      el('div', { class: 'code-row' }, [input, el('button', { type: 'submit', class: 'btn', text: 'Continue' })])
    ]);
    show([
      el('h2', { class: 'card-title', text: 'RSVP' }), ornament(),
      el('p', { id: 'code-help', class: 'lead', text: 'Please open the personal link we sent you, or enter the invitation code from it.' }),
      badCode ? el('p', { class: 'alert', role: 'alert' }, ['We couldn’t find the code ', el('strong', { class: 'bad-code' + (shown.length > 12 ? ' long' : ''), text: shown }), '. Please check it against your invitation.'])
        : message ? el('p', { class: 'alert', role: 'alert', text: message }) : null,
      form
    ]);
    if (badCode && focus) { input.focus(); input.select(); }
  }

  function renderLoading() {
    show([el('div', { class: 'loading', role: 'status' }, [el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('span', { text: 'Finding your invitation…' })])]);
  }

  function seatBadge(n) {
    return el('div', { class: 'seat-card', role: 'note', 'aria-label': n + (n === 1 ? ' seat' : ' seats') + ' reserved in your honor' }, [
      el('span', { class: 'seat-num', 'aria-hidden': 'true', text: String(n) }),
      el('span', { class: 'seat-text', 'aria-hidden': 'true' }, [n === 1 ? 'Seat reserved' : 'Seats reserved', el('br'), 'in your honor'])
    ]);
  }

  // match saved answers to invited guests by name first (in case rows were re-sorted), then by position
  function matchAnswers(invite, response) {
    var answers = new Array(invite.guests.length), pool = (response ? response.guests : []).slice();
    invite.guests.forEach(function (g, i) {
      for (var j = 0; j < pool.length; j++) if (pool[j] && pool[j].name === g.name) { answers[i] = pool[j]; pool[j] = null; return; }
    });
    invite.guests.forEach(function (g, i) {
      if (answers[i]) return;
      for (var j = 0; j < pool.length; j++) if (pool[j]) { answers[i] = pool[j]; pool[j] = null; return; }
    });
    return answers;
  }

  function renderForm() {
    var d = state.data, inv = d.invite, prev = d.response, answers = matchAnswers(inv, prev);
    var rows = inv.guests.map(function (g, i) {
      var a = answers[i] || {}, group = 'g' + i;
      function choice(val, text) {
        var id = group + '-' + val;
        return el('label', { class: 'choice choice-' + val, for: id }, [
          el('input', { type: 'radio', name: group, id: id, value: val, checked: a.attending === val, required: true }),
          el('span', { text: text })
        ]);
      }
      return el('fieldset', { class: 'guest', 'data-i': i }, [
        el('legend', { class: 'sr-only', text: g.name }),
        el('div', { class: 'guest-head' }, [el('span', { class: 'guest-name', text: g.name })]),
        el('div', { class: 'choices' }, [choice('yes', 'Joyfully accepts'), choice('no', 'Regretfully declines')])
      ]);
    });
    var email = el('input', { id: 'email', type: 'email', autocomplete: 'email', maxlength: '120', placeholder: 'you@example.com', value: (prev && prev.email) || inv.email || '' });
    var msg = el('textarea', { id: 'message', rows: '3', maxlength: '1000', placeholder: 'A note for ' + (coupleNames() || 'the couple') });
    msg.value = (prev && prev.message) || '';
    var status = el('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
    var submit = el('button', { type: 'submit', class: 'btn btn-wide', text: prev ? 'Update RSVP' : 'Send RSVP' });
    var form = el('form', { class: 'rsvp-form', novalidate: true, onsubmit: onSubmit }, rows.concat([
      el('div', { class: 'field' }, [el('label', { for: 'email', class: 'field-label' }, ['Email ', el('span', { class: 'optional', text: '(optional — we’ll email you a confirmation)' })]), email]),
      el('div', { class: 'field' }, [el('label', { for: 'message', class: 'field-label' }, ['Message ', el('span', { class: 'optional', text: '(optional)' })]), msg]),
      status, submit
    ]));

    function onSubmit(e) {
      e.preventDefault();
      status.textContent = ''; status.className = 'form-status';
      var guests = [], missing = false;
      rows.forEach(function (row) {
        var picked = row.querySelector('input[type=radio]:checked');
        row.classList.toggle('needs', !picked);
        if (!picked) missing = true;
        guests.push({ attending: picked ? picked.value : '' });
      });
      if (missing) return fail('Please choose an answer for everyone.');
      var em = email.value.trim();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return fail('That email address doesn’t look right.');
      submit.disabled = true; submit.textContent = 'Sending…';
      API.rsvp({ code: inv.code, guests: guests, email: em, message: msg.value.trim() }).then(function (res) {
        if (!res.ok) {
          submit.disabled = false; submit.textContent = prev ? 'Update RSVP' : 'Send RSVP';
          if (res.error === 'closed') { state.data.closed = true; return renderSummaryOrClosed(); }
          return fail(errorText(res.error));
        }
        state.data.response = res.response;
        state.data.details = res.details || null;
        if (res.deadlineText) setDeadline(res.deadlineText);
        renderSummary({ justSent: true, emailSent: res.emailSent });
        if (state.data.details) renderDetails(state.data.details);
        setTimeout(function () { scrollToEl(card); }, 60);
      }).catch(function () {
        submit.disabled = false; submit.textContent = prev ? 'Update RSVP' : 'Send RSVP';
        fail('We couldn’t send your RSVP. Please check your connection and try again.');
      });
    }
    function fail(t) { status.textContent = t; status.className = 'form-status alert'; return false; }

    show([
      el('p', { class: 'eyebrow', text: prev ? 'Update your RSVP' : 'You are invited' }),
      el('h2', { class: 'party', text: inv.party }), ornament(),
      seatBadge(inv.guests.length),
      d.seatNote ? el('p', { class: 'seat-note', text: d.seatNote }) : null,
      el('p', { class: 'lead', text: 'Kindly reply for each guest by ' + currentDeadline() + '. You’ll find all the details below.' }),
      form,
      el('p', { class: 'switch' }, [el('a', { href: '#', onclick: switchCode, text: 'Not you? Use a different code' })])
    ]);
  }

  function renderSummary(opts) {
    opts = opts || {};
    var d = state.data, inv = d.invite, r = d.response, yes = r.guests.some(function (g) { return g.attending === 'yes'; });
    var chips = el('ul', { class: 'answers-compact' }, r.guests.map(function (g) {
      return el('li', { class: g.attending === 'yes' ? 'is-yes' : 'is-no' }, [
        el('span', { class: 'answer-name', text: g.name }),
        el('span', { class: 'answer-val', text: g.attending === 'yes' ? 'Attending' : 'Not attending' })
      ]);
    }));
    var nodes = [el('p', { class: 'eyebrow', text: opts.justSent ? inv.party : 'Your RSVP' })];
    if (opts.justSent) {
      nodes.push(el('h2', { class: 'card-title script', text: 'Thank you!' }));
      nodes.push(el('p', { class: 'lead', text: yes ? 'We can’t wait to celebrate with you.' : 'We’ll miss you, and we’re grateful you let us know.' }));
    } else {
      nodes.push(el('h2', { class: 'party party-small', text: inv.party }));
    }
    var sc = seatBadge(inv.guests.length); sc.classList.add('seat-card-small'); nodes.push(sc);
    nodes.push(chips);
    if (opts.justSent && r.message) nodes.push(el('blockquote', { class: 'note' }, [multiline(r.message)]));
    if (opts.emailSent) {
      var from = coupleNames() || 'us';
      nodes.push(el('p', { class: 'small email-note' }, [
        'A confirmation from ' + from + ' is on its way to ', el('strong', { text: r.email }), '. ',
        'If it’s not in your inbox in a few minutes, please check your ', el('strong', { text: 'Spam' }), ' or ', el('strong', { text: 'Promotions' }),
        ' folder and mark it “Not spam”.'
      ]));
    }
    nodes.push(d.closed
      ? el('p', { class: 'small muted', text: 'RSVPs are now closed. If something has changed, please contact us directly.' })
      : el('p', { class: 'small muted' }, [
          'You can change your response until ' + currentDeadline() + '. ',
          el('button', { type: 'button', class: 'link-btn', text: 'Change my response', onclick: renderForm })
        ]));
    nodes.push(el('p', { class: 'switch' }, [el('a', { href: '#', onclick: switchCode, text: 'Not you? Use a different code' })]));
    show.keepCompact = true; card.classList.add('compact');
    show(nodes); show.keepCompact = false;
    updateFloat();
  }

  function renderClosed() {
    show([
      el('p', { class: 'eyebrow', text: state.data.invite.party }),
      el('h2', { class: 'card-title', text: 'RSVPs are closed' }), ornament(),
      el('p', { class: 'lead', text: 'The RSVP deadline has passed. If you’d still like to reply, please contact us directly.' }),
      el('p', { class: 'switch' }, [el('a', { href: '#', onclick: switchCode, text: 'Use a different code' })])
    ]);
  }

  function renderSummaryOrClosed() {
    if (state.data.response) renderSummary(); else if (state.data.closed) renderClosed(); else renderForm();
    updateFloat();
  }

  /* ---------- pinned RSVP button while reading the details ---------- */
  var floatBtn = document.getElementById('rsvp-float'), cardInView = true;
  function updateFloat() {
    var need = !!(state.data && !state.data.response && !state.data.closed);
    floatBtn.hidden = !(need && !cardInView);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { cardInView = entries[0].isIntersecting; updateFloat(); }, { threshold: 0.05 }).observe(card);
  }
  floatBtn.addEventListener('click', function (e) { e.preventDefault(); scrollToEl(card); });

  function renderError(message, title) {
    show([
      el('h2', { class: 'card-title', text: title || 'Something went wrong' }), ornament(),
      el('p', { class: 'lead', text: typeof message === 'string' ? message : 'We couldn’t reach our RSVP service. Please check your connection and try again.' }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn', text: 'Try again', onclick: function () { load(state.code); } })])
    ]);
  }

  /* ---------- details (only for a valid code) ---------- */
  function renderDetails(details) {
    detailsEl.innerHTML = '';
    if (!details || !details.sections || !details.sections.length) { detailsEl.hidden = true; return; }
    detailsEl.appendChild(el('div', { class: 'details-head' }, [
      el('p', { class: 'eyebrow', text: 'For our guests' }),
      el('h2', { class: 'section-title', text: 'The Celebration' }), ornament()
    ]));
    details.sections.forEach(function (sec) {
      var items = sec.items;
      var isGallery = items.length > 0 && items.every(function (it) { return it.image && !it.text && !it.time && !it.address; });
      var isTimeline = !isGallery && items.length > 1 && items.every(function (it) { return it.time && !it.text && !it.address && !it.image; });
      var block = el('section', { class: 'detail-section' + (isTimeline ? ' timeline' : '') + (isGallery ? ' gallery' : '') }, [el('h3', { class: 'detail-title', text: sec.title })]);
      if (isGallery) {
        var grid = el('div', { class: 'gallery-grid' + (items.length === 1 ? ' one' : '') });
        items.forEach(function (it) { grid.appendChild(photo(it.image, it.heading, 'portrait')); });
        block.appendChild(grid);
      } else {
        items.forEach(function (it) {
          var mapHref = it.map || (it.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(it.address) : '');
          block.appendChild(el('div', { class: 'detail-item' + (it.image ? ' has-photo' : '') }, [
            it.image ? photo(it.image, it.heading, 'wide') : null,
            it.time ? el('div', { class: 'detail-time', text: it.time }) : null,
            el('div', { class: 'detail-body' }, [
              it.heading ? el('h4', { text: it.heading }) : null,
              it.text ? multiline(it.text) : null,
              it.address ? el('p', { class: 'address', text: it.address }) : null,
              mapHref ? el('a', { class: 'map-link', href: mapHref, target: '_blank', rel: 'noopener', text: 'Open in Google Maps' }) : null
            ])
          ]));
        });
      }
      detailsEl.appendChild(block);
    });
    detailsEl.hidden = false;
  }

  /* ---------- private photos: fetched through the script after the text is on screen ---------- */
  var photoCache = {}, photoQueue = [], photoBusy = 0;
  function photo(id, caption, shape) {
    var fig = el('figure', { class: 'photo photo-' + shape + ' is-loading' });
    var btn = el('button', { type: 'button', class: 'photo-btn', 'aria-label': 'View photo' + (caption ? ': ' + caption : '') });
    fig.appendChild(btn);
    if (caption && shape === 'portrait') fig.appendChild(el('figcaption', { text: caption }));
    var start = function () { queuePhoto(id, function (url) {
      if (!url) { fig.classList.remove('is-loading'); fig.classList.add('is-missing'); return; }
      var img = el('img', { src: url, alt: caption || '', loading: 'lazy', decoding: 'async' });
      img.onload = function () { fig.classList.remove('is-loading'); };
      btn.appendChild(img);
      btn.onclick = function () { openLightbox(url, caption); };
    }); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) { if (ents[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '400px' });
      io.observe(fig);
    } else start();
    return fig;
  }
  function queuePhoto(id, cb) {
    var key = 'wedding-photo:' + id;
    if (photoCache[id]) return cb(photoCache[id]);
    try { var saved = localStorage.getItem(key); if (saved) { photoCache[id] = saved; return cb(saved); } } catch (e) {}
    photoQueue.push({ id: id, key: key, cb: cb }); pump();
  }
  function pump() {
    while (photoBusy < 2 && photoQueue.length) {
      var job = photoQueue.shift(); photoBusy++;
      (function (job) {
        var code = state.code;
        API.image(code, job.id).then(function (res) {
          var url = res && res.ok ? 'data:' + res.mime + ';base64,' + res.data : '';
          if (url) { photoCache[job.id] = url; try { localStorage.setItem(job.key, url); } catch (e) { /* storage full: fine */ } }
          job.cb(url);
        }).catch(function () { job.cb(''); }).then(function () { photoBusy--; pump(); });
      })(job);
    }
  }
  var lightbox = null;
  function openLightbox(url, caption) {
    if (!lightbox) {
      lightbox = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo', tabindex: '-1' });
      lightbox.addEventListener('click', closeLightbox);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });
      document.body.appendChild(lightbox);
    }
    lightbox.innerHTML = '';
    lightbox.appendChild(el('img', { src: url, alt: caption || '' }));
    if (caption) lightbox.appendChild(el('p', { text: caption }));
    lightbox.appendChild(el('button', { type: 'button', class: 'lightbox-close', 'aria-label': 'Close', text: '×' }));
    lightbox.hidden = false; document.body.classList.add('no-scroll'); lightbox.focus();
  }
  function closeLightbox() { if (lightbox) { lightbox.hidden = true; document.body.classList.remove('no-scroll'); } }

  /* ---------- flow ---------- */
  function load(code, typed) {
    state.code = String(code || '').trim();
    renderLoading();
    API.invite(state.code).then(function (res) {
      if (!res.ok) {
        splashReady(false);
        if (res.error === 'busy') return renderError('Our RSVP page is taking a short break. Please try again in about 10 minutes.', 'Just a moment');
        if (res.error === 'not_found') {
          forget();
          hideCouple();
          renderDetails(null);
          return renderCodeEntry('', state.code, typed);   // focus the box only if they typed it; on a phone that opens the keyboard
        }
        return renderError();
      }
      state.data = res;
      state.code = res.invite.code;
      showCouple(res.couple);
      splashReady(!!(res.couple && res.couple.names && res.couple.names.length));
      remember(state.code);
      if (!/[?&]preview=1/.test(location.search) && API.visit) API.visit(state.code);   // background; previews from the dashboard aren't counted
      setDeadline(res.deadlineText || '');
      renderSummaryOrClosed();
      renderDetails(res.details || null);
    }).catch(function () { splashReady(false); renderError(); });
  }

  function switchCode(e) {
    if (e) e.preventDefault();
    forget(); state.data = null; hideCouple(); renderDetails(null); renderCodeEntry(); updateFloat();
    var input = document.getElementById('code'); if (input) input.focus();
  }
  function remember(code) {
    try { localStorage.setItem(CODE_KEY, code); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.set('c', code); u.searchParams.delete('code'); history.replaceState(null, '', u); } catch (e) {}
  }
  function forget() {
    try { localStorage.removeItem(CODE_KEY); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.delete('c'); u.searchParams.delete('code'); history.replaceState(null, '', u); } catch (e) {}
  }
  function currentDeadline() { return (state.data && state.data.deadlineText) || 'the deadline'; }
  function setDeadline(t) {
    ['deadline-text', 'float-deadline'].forEach(function (id) { var n = document.getElementById(id); if (n) n.textContent = t || ''; });
    var line = document.getElementById('deadline-line'); if (line) line.hidden = !t;   // only shown once a code checks out
  }
  function errorText(code) {
    return ({
      incomplete: 'Please choose an answer for everyone.',
      bad_email: 'That email address doesn’t look right.',
      busy: 'Our RSVP page is taking a short break. Please try again in about 10 minutes.',
      not_found: 'This invitation code is no longer valid.'
    })[code] || 'Something went wrong. Please try again.';
  }
  function scrollToEl(n) {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    n.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- names, date and place (only once a code checks out) ---------- */
  var DEFAULT_TITLE = document.title;
  function setText(id, t) { var n = document.getElementById(id); if (n) n.textContent = t || ''; }
  function showCouple(c) {
    var names = (c && c.names) || [];
    if (!names.length) { hideCouple(); return; }   // nothing set in the Sheet yet
    var full = c.full || names.join(' & '), two = names.length > 1;
    setText('name-1', names[0]); setText('name-2', two ? names[1] : '');
    setText('splash-name-1', names[0]); setText('splash-name-2', two ? names[1] : '');
    ['amp', 'splash-amp'].forEach(function (id) { var n = document.getElementById(id); if (n) n.hidden = !two; });
    setText('date-text', c.dateText); setText('splash-date', c.dateText);
    setText('city-text', c.place); setText('splash-place', c.place);
    setText('footer-text', [full, c.dateText].filter(Boolean).join(' · '));
    document.title = [full, c.dateText].filter(Boolean).join(' · ');
    document.getElementById('hero').classList.remove('locked');
  }
  function coupleNames() {
    var c = state.data && state.data.couple;
    return c ? (c.full || (c.names || []).join(' & ')) : '';
  }
  function hideCouple() {
    ['name-1', 'name-2', 'date-text', 'city-text', 'footer-text', 'splash-name-1', 'splash-name-2', 'splash-date', 'splash-place']
      .forEach(function (id) { setText(id, ''); });
    document.getElementById('hero').classList.add('locked');
    setDeadline('');
    document.title = DEFAULT_TITLE;
  }

  /* ---------- monogram loading screen ----------
     The monogram starts writing itself on a full screen while the invitation loads. Once we know
     whether the code is good, the screen fades and the monogram glides into its place at the top,
     still writing, so nobody waits for the drawing to finish. Once per visit; tap or a key skips it. */
  var SPLASH_KEY = 'wedding-splash-seen';
  var SPLASH_MIN = 1500, CAPTION_AT = 900, CAPTION_HOLD = 1800, SLOW_AT = 4000, GIVE_UP = 11000;
  var splash = null;
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function startSplash() {
    var node = document.getElementById('splash');
    if (!node) return;
    if (!document.documentElement.classList.contains('splash-on')) { node.parentNode.removeChild(node); return; }
    try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch (e) {}
    splash = { node: node, t0: now(), timers: [], settled: false, done: false };
    document.body.classList.add('no-scroll');
    node.addEventListener('click', function () { endSplash(true); });
    document.addEventListener('keydown', splashKey);
    splash.timers.push(setTimeout(function () { if (splash && !splash.settled && state.code) node.classList.add('slow'); }, SLOW_AT));
    splash.timers.push(setTimeout(function () { endSplash(true); }, GIVE_UP));
  }
  function splashKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endSplash(true); }
  }
  // called once we know whether the code checked out (or that there's no code)
  function splashReady(verified) {
    if (!splash || splash.done || splash.settled) return;
    var sp = splash, t = now() - sp.t0, wait;
    sp.settled = true;
    sp.node.classList.remove('slow');
    if (verified) {
      var showAt = Math.max(t, CAPTION_AT);
      sp.timers.push(setTimeout(function () { sp.node.classList.add('verified'); }, showAt - t));
      wait = showAt + (t > 3000 ? CAPTION_HOLD * 0.65 : CAPTION_HOLD) - t;   // shorter if they've already waited
    } else {
      wait = Math.max(0, SPLASH_MIN - t);
    }
    sp.timers.push(setTimeout(function () { endSplash(false); }, wait));
  }
  function whenFontsReady(fn) {
    var called = false;
    function go() { if (!called) { called = true; fn(); } }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
    setTimeout(go, 300);
  }
  function endSplash(skipped) {
    if (!splash || splash.done) return;
    var sp = splash, node = sp.node;
    sp.done = true;
    sp.timers.forEach(clearTimeout);
    document.removeEventListener('keydown', splashKey);
    var canvas = document.getElementById('monogram'), fallback = document.getElementById('monogram-fallback');
    var spot = fallback.parentNode;
    var drawing = canvas && !canvas.hidden && canvas.parentNode !== spot;
    var dur = skipped ? 550 : 1000;
    function finish() {
      if (canvas) {
        if (canvas.parentNode !== spot) spot.insertBefore(canvas, fallback);
        canvas.style.transition = canvas.style.transform = canvas.style.transformOrigin = '';
        if (!canvas.hidden) fallback.hidden = true;
      }
      fallback.style.visibility = '';
      if (node.parentNode) node.parentNode.removeChild(node);
      document.documentElement.classList.remove('splash-on');
      document.body.classList.remove('no-scroll');
      splash = null;
    }
    node.querySelector('.splash-bg').style.transitionDuration = Math.round(dur * 0.75) + 'ms';
    node.classList.add('leaving');
    if (!drawing) { setTimeout(finish, dur * 0.75); return; }
    whenFontsReady(function () {
      var a = canvas.getBoundingClientRect(), b = fallback.getBoundingClientRect();
      canvas.style.transformOrigin = '0 0';
      canvas.style.transition = 'transform ' + dur + 'ms cubic-bezier(.6, 0, .3, 1)';
      void canvas.offsetWidth;
      canvas.style.transform = 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + (b.width / a.width) + ')';
      setTimeout(finish, dur + 40);
    });
  }

  /* ---------- monogram ---------- */
  function startMonogram() {
    var canvas = document.getElementById('monogram');
    var fallback = document.getElementById('monogram-fallback');
    if (!canvas || !window.MonogramPlayer || !window.MONOGRAM_DATA) return;
    var spot = fallback.parentNode, mark = splash && splash.node.querySelector('.splash-mark');
    if (mark) { mark.appendChild(canvas); fallback.style.visibility = 'hidden'; }   // keep its place so the glide knows where to land
    var player = new MonogramPlayer(canvas, window.MONOGRAM_DATA);
    player.load().then(function () {
      canvas.hidden = false;
      if (canvas.parentNode === spot) fallback.hidden = true; else canvas.parentNode.classList.add('drawing');
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) player.showFinal(); else player.play();
      canvas.addEventListener('click', function () { if (!splash) player.play(); });
    }).catch(function () {   // keep the static image
      if (canvas.parentNode !== spot) { canvas.parentNode.classList.add('failed'); spot.insertBefore(canvas, fallback); }
    });
  }

  /* ---------- start ---------- */
  function init() {

    if (API.isDemo) {
      var bar = document.getElementById('demo-bar');
      bar.hidden = false;
      bar.querySelectorAll('[data-code]').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); load(a.getAttribute('data-code')); scrollToEl(card); });
      });
      document.getElementById('demo-reset').addEventListener('click', function (e) {
        e.preventDefault(); API.reset(); switchCode();
      });
    }
    startSplash();
    startMonogram();
    var params = new URLSearchParams(location.search);
    var code = params.get('c') || params.get('code');
    if (!code) { try { code = localStorage.getItem(CODE_KEY); } catch (e) {} }
    if (code) load(code); else { renderCodeEntry(); splashReady(false); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
