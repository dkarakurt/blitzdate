/* fink. tanıtım sitesi: sayfaya özel davranış.
   Kurallar (isimler, mesafe, karar, buzkıran, kafe seçimi, snap süresi) uygulamanın kendi
   src/logic dosyalarından paketlenen FinkLogic'ten gelir. Motor (scrollcraft.js) dokunulmadan
   kullanılır; bu dosya yalnızca --sc-p okur. */
(function () {
  'use strict';
  var L = window.FinkLogic;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var store = {
    get: function (k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* yok say */ } }
  };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function avatar(id, size) {
    var s = el('span', 'ava ava--' + size);
    s.style.setProperty('--c', id.color);
    s.innerHTML = '<svg aria-hidden="true"><use href="#a-' + id.kind + '"/></svg>';
    return s;
  }
  function progress(act) {
    var v = parseFloat(act.style.getPropertyValue('--sc-p'));
    return isNaN(v) ? 0 : v;
  }

  /* ================================================================
     İMZA: kapıda verilen, bir kez değiştirilebilen kimlik
     ================================================================ */
  function pick(avoid) {
    var id;
    do {
      id = { adj: Math.floor(Math.random() * L.ADJECTIVES.length), ani: Math.floor(Math.random() * L.ANIMALS.length) };
    } while (avoid && avoid.some(function (a) { return a && a.adj === id.adj && a.ani === id.ani; }));
    return id;
  }
  function parse(s) { try { var o = JSON.parse(s); return o && typeof o.adj === 'number' ? o : null; } catch (e) { return null; } }
  var meIdx = parse(store.get('fink.me')) || pick();
  var rerolled = store.get('fink.rerolled') === '1';
  // Karşı taraf: senden farklı bir hayvan
  var themIdx = parse(store.get('fink.them'));
  if (!themIdx || themIdx.ani === meIdx.ani) {
    do { themIdx = pick([meIdx]); } while (themIdx.ani === meIdx.ani);
  }
  store.set('fink.me', JSON.stringify(meIdx));
  store.set('fink.them', JSON.stringify(themIdx));
  var me = L.identityFor(meIdx.adj, meIdx.ani);
  var them = L.identityFor(themIdx.adj, themIdx.ani);

  function paintIdentity() {
    $$('[data-me-name]').forEach(function (n) { n.textContent = me.name; });
    $$('[data-them-name]').forEach(function (n) { n.textContent = them.name; });
    $$('[data-me-ava]').forEach(function (n) { n.style.setProperty('--c', me.color); n.querySelector('use').setAttribute('href', '#a-' + me.kind); });
    $$('[data-them-ava]').forEach(function (n) { n.style.setProperty('--c', them.color); n.querySelector('use').setAttribute('href', '#a-' + them.kind); });
  }
  var rerollBtn = $('[data-reroll]');
  function paintReroll() {
    if (!rerollBtn) return;
    rerollBtn.disabled = rerolled;
    rerollBtn.textContent = rerolled ? 'Değiştirme hakkın kullanıldı' : 'Bir kez değiştir';
  }
  if (rerollBtn) {
    rerollBtn.addEventListener('click', function () {
      if (rerolled) return;
      var next;
      do { next = pick([meIdx]); } while (next.ani === themIdx.ani);
      meIdx = next;
      me = L.identityFor(meIdx.adj, meIdx.ani);
      rerolled = true;
      store.set('fink.me', JSON.stringify(meIdx));
      store.set('fink.rerolled', '1');
      paintIdentity();
      paintReroll();
      buildRadar();
      buildMap();
      renderChat(true);
    });
  }
  paintIdentity();
  paintReroll();

  /* ================================================================
     Örnek senaryo: konumlar (metre cinsinden ofsetlerle)
     ================================================================ */
  var ORIGIN = { lat: 40.9903, lng: 29.0290 };
  function at(dx, dy) {
    return { lat: ORIGIN.lat + dy / 111320, lng: ORIGIN.lng + dx / (111320 * Math.cos(ORIGIN.lat * Math.PI / 180)) };
  }
  var THEM_DX = 420, THEM_DY = -300;
  var THEM_POS = at(THEM_DX, THEM_DY);
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

  /* ================================================================
     2 · Radar
     ================================================================ */
  var radarAct = $('#radar');
  var radarBox = $('[data-radar]');
  var nearList = $('[data-near]');
  var radarStatus = $('[data-radar-status]');
  var people = [];
  function buildRadar() {
    if (!radarBox) return;
    $$('.blip', radarBox).forEach(function (b) { b.remove(); });
    nearList.textContent = '';
    var others = [[12, 5, -230, 150], [61, 2, 520, 330], [33, 6, -610, -470]];
    var list = others.map(function (o) { return { id: L.identityFor(o[0], o[1]), pos: at(o[2], o[3]), struck: false }; })
      .filter(function (p) { return p.id.name !== me.name && p.id.name !== them.name; });
    list.splice(1, 0, { id: them, pos: THEM_POS, struck: true });
    people = list.map(function (p, i) {
      var d = L.distanceMeters(ORIGIN, p.pos);
      // yön gizli: açı gerçek yön değildir; kişiler daireye eşit aralıkla, isimden türeyen küçük bir sapmayla yerleşir
      var ang = (i / list.length) * Math.PI * 2 + hash(p.id.name) * 0.9 - 0.45 - Math.PI / 2;
      var r = (0.24 + 0.76 * Math.min(1, d / L.RADAR_RADIUS_M)) * 0.47;   // merkezdeki "Sen"in üstüne binmesin
      var blip = el('div', 'blip');
      blip.style.left = (50 + Math.cos(ang) * r * 100) + '%';
      blip.style.top = (50 + Math.sin(ang) * r * 100) + '%';
      blip.appendChild(avatar(p.id, 's'));
      blip.appendChild(el('span', 'blip__d', L.formatDistance(d)));
      radarBox.appendChild(blip);
      var li = el('li');
      li.appendChild(avatar(p.id, 'xs'));
      var n = el('span', 'near__n');
      n.appendChild(el('b', null, p.id.name));
      var sub = el('span', null, L.formatDistance(d));
      n.appendChild(sub);
      li.appendChild(n);
      var btn = el('button', 'pill-btn', 'Çarp');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (p.struck) { document.getElementById('strike').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }
        else { radarStatus.textContent = 'Bu örnekte eşleşme ' + them.name + ' ile.'; }
      });
      li.appendChild(btn);
      return { p: p, d: d, blip: blip, li: li, sub: sub, btn: btn, at: [0.06, 0.16, 0.28, 0.4][i] || 0.4 };
    }).sort(function (a, b) { return a.d - b.d; });
    people.forEach(function (x) { nearList.appendChild(x.li); });
    lastRadar = -1;
  }
  var lastRadar = -1;
  function tickRadar(p, now) {
    if (!radarBox) return;
    var sweep = reduce ? 40 : (p * 720 + now * 0.04) % 360;
    radarBox.style.setProperty('--sweep', sweep.toFixed(1) + 'deg');
    var key = Math.round(p * 100);
    if (key === lastRadar) return;
    lastRadar = key;
    var on = 0;
    var struckOn = p > 0.56, pressed = p > 0.8;
    people.forEach(function (x) {
      var vis = p > x.at;
      if (vis) on++;
      x.blip.classList.toggle('is-on', vis);
      x.li.classList.toggle('is-on', vis);
      var s = x.p.struck && struckOn;
      x.blip.classList.toggle('is-struck', s);
      x.li.classList.toggle('is-struck', s);
      x.sub.textContent = s ? 'Sana çarptı · ' + L.formatDistance(x.d) : L.formatDistance(x.d);
      if (x.p.struck) {
        x.btn.classList.toggle('is-pressed', pressed);
        x.btn.textContent = pressed ? 'Çarptın' : 'Çarp';
      }
    });
    radarStatus.textContent = pressed ? 'Strike!' : struckOn ? them.name + ' sana çarptı' : on ? '1 km içinde ' + on + ' kişi çevrimiçi' : 'Radar taranıyor';
  }

  /* ================================================================
     3 · Strike geri sayımı
     ================================================================ */
  var strikeAct = $('#strike');
  var strikeCount = $('[data-strike-count]');
  var lastCount = '';
  function tickStrike(p) {
    var t = (p - 0.5) / 0.42;
    var txt = t < 0 ? 'İkiniz de çarptınız' : t >= 1 ? 'Oda açıldı' : 'Oda açılıyor · ' + Math.max(1, 3 - Math.floor(t * 3));
    if (txt !== lastCount) { strikeCount.textContent = txt; lastCount = txt; }
  }

  /* ================================================================
     4 · FinkRoom: 90 saniye kaydırmanın altında (DORUK)
     ================================================================ */
  var roomAct = $('#oda');
  var room = $('[data-room]');
  var chat = $('[data-chat]');
  var clock = $('[data-clock]');
  var clockN = $('[data-clock-n]');
  var roomSub = $('[data-room-sub]');
  var verdict = $('[data-verdict]');
  var verdictH = $('[data-verdict-h]');
  var verdictThem = $('[data-verdict-them]');
  var iceQ = $('[data-ice-q]');
  var P0 = 0.04, P1 = 0.74;                 // saat bu aralıkta 90'dan 0'a akar
  var iceIdx = 0;
  var userMsgs = [];                        // ziyaretçinin kendi yazdıkları (kaydırmayla silinmez)
  var userVote = null;
  var userSentIce = false;
  var elapsed = 0, lastSig = '';
  // Senaryo: geçen saniyeye göre gelen mesajlar
  function script() {
    return [
      { e: 0, from: 'sys', text: 'Oda açıldı. 90 saniyeniz var.' },
      { e: 4, from: 'them', text: 'Selam! Radarda en yakın sen miydin?' },
      { e: 10, from: 'me', ice: true, text: L.ICEBREAKERS[0], skip: userSentIce },
      { e: 17, from: 'them', text: 'Yenir. Hatta en güzel yeri. Bunu tartışırız ama.' },
      { e: 28, from: 'me', text: 'Tamam, ilk tartışma konumuz belli.' },
      { e: 40, from: 'them', ice: true, text: L.ICEBREAKERS[3] },
      { e: 51, from: 'me', text: 'Simit. Yanında çayla.' },
      { e: 63, from: 'them', text: 'Yakındaysan bir çay içilir o zaman.' },
      { e: 77, from: 'me', text: 'Saat azalıyor, karar anı geliyor.' }
    ].filter(function (m) { return !m.skip; });
  }
  function bubble(m) {
    var li = el('li', 'msg msg--' + m.from);
    if (m.ice) li.appendChild(el('span', 'msg__ice', 'Buzkıran'));
    li.appendChild(document.createTextNode(m.text));
    return li;
  }
  function outcomeNow(p) {
    var themVote = p > 0.82 ? 'continue' : null;
    var myVote = userVote || (p > 0.88 ? 'continue' : null);
    // Oda süresi bitince karar penceresi açılır; karar penceresinin kendisi bu senaryoda dolmaz,
    // bu yüzden uygulamadaki kurala "karar süresi doldu: hayır" geçilir. Biri Bitir derse oda kapanır.
    return { themVote: themVote, myVote: myVote, result: L.decide(myVote, themVote, false) };
  }
  function renderChat(force, p) {
    p = p == null ? progress(roomAct) : p;
    var oc = outcomeNow(p);
    var msgs = script().filter(function (m) { return m.e <= elapsed; }).concat(userMsgs);
    msgs.sort(function (a, b) { return a.e - b.e; });
    if (elapsed >= L.ROOM_SECONDS) msgs.push({ e: 90, from: 'sys', text: 'Süre doldu.' });
    if (oc.result === 'continue' && p > 0.9) msgs.push({ e: 91, from: 'sys', text: 'İkiniz de Devam dediniz. Süre duvarı yıkıldı.' });
    if (oc.result === 'closed' && userVote === 'leave') msgs.push({ e: 91, from: 'sys', text: 'Oda kapandı. Kimse kimseye bir şey borçlu değil.' });
    var view = msgs.slice(-7);
    var sig = view.map(function (m) { return m.from + m.text; }).join('|');
    if (!force && sig === lastSig) return;
    lastSig = sig;
    chat.textContent = '';
    view.forEach(function (m) { chat.appendChild(bubble(m)); });
    // Sığmayan en eski balonları kaldır: yarım kesilmiş balon kalmasın
    var top = chat.getBoundingClientRect().top;
    while (chat.children.length > 1 && chat.firstChild.getBoundingClientRect().top < top - 1) chat.removeChild(chat.firstChild);
  }
  var lastRoomKey = '';
  function tickRoom(p) {
    var t = clamp((p - P0) / (P1 - P0), 0, 1);
    var left = Math.ceil(L.ROOM_SECONDS * (1 - t) - 1e-9);
    elapsed = L.ROOM_SECONDS - left;
    var oc = outcomeNow(p);
    var broken = oc.result === 'continue' && p > 0.9;
    var brk = broken ? clamp((p - 0.9) / 0.08, 0, 1) : 0;
    var timeUp = left <= 0;
    var key = left + '|' + oc.themVote + '|' + oc.myVote + '|' + oc.result + '|' + Math.round(brk * 40);
    if (key === lastRoomKey) return;
    lastRoomKey = key;

    clock.classList.toggle('is-urgent', L.isUrgent(left) && !broken && left > 0);
    clock.classList.toggle('is-broken', broken);
    clock.style.setProperty('--brk', brk.toFixed(3));
    clock.style.setProperty('--off', (100 * (1 - L.ringProgress(left))).toFixed(2));
    clockN.textContent = broken ? '∞' : String(left);
    clock.setAttribute('aria-label', broken ? 'Süre yok, sohbet süresiz' : 'Kalan süre ' + left + ' saniye');
    roomSub.textContent = broken ? 'Süresiz sohbet · yine isimsiz' : oc.result === 'closed' ? 'Oda kapandı' : timeUp ? 'Karar zamanı' : 'FinkRoom';

    var deciding = timeUp && !broken && oc.result !== 'closed';
    verdict.hidden = !deciding;
    if (deciding) {
      verdictH.textContent = 'Süre doldu. Devam mı?';
      verdictThem.classList.toggle('is-yes', !!oc.themVote);
      verdictThem.textContent = oc.themVote ? them.name + ': Devam' : them.name + ' karar veriyor';
      $$('[data-vote]', verdict).forEach(function (b) { b.classList.toggle('is-chosen', b.getAttribute('data-vote') === oc.myVote); });
    }
    room.classList.toggle('is-timeup', timeUp && !broken);
    room.classList.toggle('is-closed', oc.result === 'closed' && userVote === 'leave');
    renderChat(false, p);
  }
  $('[data-ice-next]').addEventListener('click', function () {
    iceIdx = L.nextIcebreaker(iceIdx);
    iceQ.textContent = L.ICEBREAKERS[iceIdx];
  });
  function postMine(text, ice) {
    var clean = L.sanitizeMessage(text);
    if (!clean) return;
    userMsgs.push({ e: elapsed + 0.5 + userMsgs.length * 0.01, from: 'me', text: clean, ice: !!ice });
    if (ice) userSentIce = true;
    renderChat(true);
    // Örnek senaryoda karşı taraf kısa bir cevap verir
    var replies = ['İyi soru. Düşünüyorum.', 'Ha ha, önce sen cevapla.', 'Bunu yüz yüze konuşmak lazım.'];
    var reply = replies[userMsgs.length % replies.length];
    window.setTimeout(function () {
      userMsgs.push({ e: elapsed + 0.6 + userMsgs.length * 0.01, from: 'them', text: reply });
      renderChat(true);
    }, reduce ? 300 : 1300);
  }
  $('[data-ice-send]').addEventListener('click', function () {
    postMine(L.ICEBREAKERS[iceIdx], true);
    iceIdx = L.nextIcebreaker(iceIdx);
    iceQ.textContent = L.ICEBREAKERS[iceIdx];
  });
  $('[data-compose]').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = this.querySelector('input');
    postMine(input.value, false);
    input.value = '';
  });
  $$('[data-vote]').forEach(function (b) {
    b.addEventListener('click', function () {
      userVote = b.getAttribute('data-vote');
      lastRoomKey = '';
      tickRoom(progress(roomAct));
    });
  });

  /* ================================================================
     5 · FinkSnap: tek kare, 5 saniye
     ================================================================ */
  var snapFrame = $('[data-snap]');
  var canvas = $('[data-snap-canvas]');
  function paintSnap() {
    var c = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2B2456'); g.addColorStop(0.55, '#1A1640'); g.addColorStop(1, '#0E0C20');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    var seed = 7;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var tints = ['255,255,0', '255,92,138', '92,225,255', '255,178,63'];
    for (var i = 0; i < 46; i++) {
      var x = rnd() * w, y = rnd() * h * 0.62, r = 10 + rnd() * 46, a = 0.05 + rnd() * 0.22;
      var rg = c.createRadialGradient(x, y, 0, x, y, r);
      var col = tints[Math.floor(rnd() * tints.length)];
      rg.addColorStop(0, 'rgba(' + col + ',' + a + ')'); rg.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    // masa ve bir bardak çay: örnek kare
    c.fillStyle = '#251F4A'; c.fillRect(0, h * 0.7, w, h * 0.3);
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, h * 0.7, w, 3);
    var cx = w * 0.56, cy = h * 0.78;
    c.fillStyle = 'rgba(255,178,63,0.85)';
    c.beginPath(); c.moveTo(cx - 34, cy - 92); c.quadraticCurveTo(cx - 44, cy - 20, cx - 26, cy + 10); c.lineTo(cx + 26, cy + 10); c.quadraticCurveTo(cx + 44, cy - 20, cx + 34, cy - 92); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 3; c.stroke();
    c.fillStyle = 'rgba(237,235,242,0.9)'; c.beginPath(); c.ellipse(cx, cy + 16, 66, 12, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(237,235,242,0.35)'; c.lineWidth = 3;
    for (var s = 0; s < 3; s++) { c.beginPath(); c.moveTo(cx - 14 + s * 14, cy - 104); c.bezierCurveTo(cx - 30 + s * 14, cy - 130, cx + s * 14, cy - 140, cx - 16 + s * 14, cy - 170); c.stroke(); }
    // kenar karartma
    var v = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,6,20,0.55)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }
  if (canvas && snapFrame) {
    paintSnap();
    snapFrame.classList.add('is-sealed');
    var seal = $('[data-snap-seal]'), ring = $('[data-snap-ring]'), ringN = $('[data-snap-n]'), gone = $('[data-snap-gone]');
    $('[data-snap-open]').addEventListener('click', function () {
      snapFrame.classList.remove('is-sealed');
      seal.hidden = true;
      ring.hidden = false;
      var t0 = performance.now();
      (function step(now) {
        var leftMs = Math.max(0, L.SNAP_VIEW_MS - (now - t0));
        ringN.textContent = String(Math.ceil(leftMs / 1000));
        ring.style.setProperty('--off', (100 * (1 - leftMs / L.SNAP_VIEW_MS)).toFixed(2));
        if (leftMs > 0) { requestAnimationFrame(step); return; }
        ring.hidden = true;
        burn(function () {
          gone.hidden = false;
          var link = gone.querySelector('a');
          if (link) link.focus({ preventScroll: true });
        });
      })(t0);
    });
  }
  function burn(done) {
    var c = canvas.getContext('2d');
    if (reduce) { canvas.style.opacity = '0'; done(); return; }
    var cell = 12, cols = Math.ceil(canvas.width / cell), rows = Math.ceil(canvas.height / cell);
    var order = [];
    for (var i = 0; i < cols * rows; i++) order.push(i);
    for (var j = order.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var tmp = order[j]; order[j] = order[k]; order[k] = tmp; }
    var t0 = performance.now(), dur = 950, cleared = 0;
    c.fillStyle = '#14122B';
    (function step(now) {
      var target = Math.floor(clamp((now - t0) / dur, 0, 1) * order.length);
      for (; cleared < target; cleared++) {
        var idx = order[cleared];
        c.fillRect((idx % cols) * cell, Math.floor(idx / cols) * cell, cell, cell);
      }
      if (cleared < order.length) requestAnimationFrame(step); else done();
    })(t0);
  }

  /* ================================================================
     6 · FinkMeet: ikinize de 700 m içinde (uygulamadaki sıralama kuralı)
     ================================================================ */
  var VENUES = [
    { id: 'v1', name: 'Köşe Kahve', dx: 190, dy: -140, tags: ['Açık hava', 'Wi-Fi'] },
    { id: 'v2', name: 'Mavi Kapı', dx: 309, dy: -12, tags: ['Sessiz'] },
    { id: 'v3', name: 'Çınaraltı Çay Bahçesi', dx: 106, dy: -296, tags: ['Açık hava'] },
    { id: 'v4', name: 'Rıhtım Kahvesi', dx: -420, dy: 260, tags: ['Deniz kenarı'] },
    { id: 'v5', name: 'Avlu', dx: 820, dy: -620, tags: ['Wi-Fi'] },
    { id: 'v6', name: 'Ada Fırını', dx: 250, dy: -190, tags: [], kind: 'other' },
    { id: 'v7', name: 'Kitap ve Fincan', dx: 520, dy: 120, tags: ['Sessiz', 'Wi-Fi'] }
  ].map(function (v) {
    return { id: v.id, name: v.name, kind: v.kind || 'cafe', isPublic: true, tags: v.tags, location: at(v.dx, v.dy), _dx: v.dx, _dy: v.dy };
  });
  var picks = L.nearbyCafes(ORIGIN, THEM_POS, VENUES);
  var cafesOl = $('[data-cafes]');
  if (cafesOl) {
    picks.forEach(function (s, i) {
      var li = el('li');
      li.appendChild(el('span', 'cafes__i', String(i + 1)));
      var n = el('span', 'cafes__n', s.venue.name);
      if (s.venue.tags.length) n.appendChild(el('span', 'cafes__t', s.venue.tags.join(' · ')));
      li.appendChild(n);
      li.appendChild(el('span', 'cafes__w', 'Sana ' + L.walkingMinutes(s.toA) + ' dk · Ona ' + L.walkingMinutes(s.toB) + ' dk'));
      cafesOl.appendChild(li);
    });
  }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function buildMap() {
    var map = $('[data-map]');
    if (!map) return;
    map.textContent = '';
    var themDx = THEM_DX, themDy = THEM_DY;
    var mx = themDx / 2, my = themDy / 2;
    var k = 0.36;                                   // piksel / metre
    var X = function (dx) { return 300 + (dx - mx) * k; };
    var Y = function (dy) { return 300 + (dy - my) * k; };
    var R = L.CAFE_MAX_WALK_M * k;
    [[0, 0], [themDx, themDy]].forEach(function (p) {
      svg('circle', { cx: X(p[0]), cy: Y(p[1]), r: R, fill: 'rgba(255,255,0,0.035)', stroke: '#332F5C', 'stroke-width': 1.5, 'stroke-dasharray': '6 7' }, map);
    });
    var chosen = picks.map(function (s) { return s.venue.id; });
    VENUES.forEach(function (v) {
      if (chosen.indexOf(v.id) >= 0) return;
      svg('circle', { cx: X(v._dx), cy: Y(v._dy), r: 5, fill: '#4A456F' }, map);
    });
    picks.forEach(function (s, i) {
      var v = s.venue, x = X(v._dx), y = Y(v._dy);
      svg('line', { x1: X(0), y1: Y(0), x2: x, y2: y, stroke: 'rgba(255,255,0,0.28)', 'stroke-width': 1.5 }, map);
      svg('line', { x1: X(themDx), y1: Y(themDy), x2: x, y2: y, stroke: 'rgba(255,92,138,0.28)', 'stroke-width': 1.5 }, map);
      svg('circle', { cx: x, cy: y, r: 15, fill: '#FFFF00' }, map);
      var t = svg('text', { x: x, y: y + 5, 'text-anchor': 'middle', style: 'fill:#14122B;font-family:Fredoka,system-ui;font-size:15px' }, map);
      t.textContent = String(i + 1);
      var left = x > 300;
      var lb = svg('text', { x: left ? x + 22 : x - 22, y: y + 5, 'text-anchor': left ? 'start' : 'end' }, map);
      lb.textContent = v.name;
    });
    function person(dx, dy, id, label, ring) {
      var g = svg('g', {}, map);
      svg('circle', { cx: X(dx), cy: Y(dy), r: 24, fill: id.color, stroke: ring, 'stroke-width': 4 }, g);
      var u = svg('use', { href: '#a-' + id.kind, x: X(dx) - 13, y: Y(dy) - 13, width: 26, height: 26, style: 'color:#14122B' }, g);
      u.setAttribute('class', 'map-ava');
      var t = svg('text', { x: X(dx), y: Y(dy) + 44, 'text-anchor': 'middle', class: 'lbl-soft' }, g);
      t.textContent = label;
    }
    person(0, 0, me, 'Sen', '#14122B');
    person(themDx, themDy, them, them.name, '#FF5C8A');
  }
  buildMap();

  /* ================================================================
     İkinci Şans: gerçek veda şablonları
     ================================================================ */
  var fw = $('[data-farewell]');
  if (fw) {
    var out = el('p', 'fw__out');
    out.setAttribute('aria-live', 'polite');
    L.FAREWELL_TEMPLATES.forEach(function (text, i) {
      var lab = el('label', 'fw');
      var r = document.createElement('input');
      r.type = 'radio'; r.name = 'fw'; r.value = String(i); r.checked = i === 0;
      lab.appendChild(r);
      lab.appendChild(el('span', null, text));
      r.addEventListener('change', function () { paintOut(i); });
      fw.appendChild(lab);
    });
    fw.appendChild(out);
    var paintOut = function (i) {
      out.textContent = '';
      out.appendChild(document.createTextNode('Karşı tarafa giden: '));
      out.appendChild(el('b', null, L.FAREWELL_TEMPLATES[i]));
    };
    paintOut(0);
  }

  /* ================================================================
     7 · Kapanış: 18+ onayı ve indirme
     ================================================================ */
  var adult = $('[data-adult]');
  var dl = $('[data-download]');
  var hint = $('[data-onb-hint]');
  function paintDl() {
    var ok = adult.checked;
    dl.setAttribute('aria-disabled', ok ? 'false' : 'true');
    hint.textContent = ok ? 'İndirme GitHub üzerinden başlar.' : 'İndirmek için 18 yaş onayı gerekli.';
  }
  if (adult && dl) {
    adult.addEventListener('change', paintDl);
    dl.addEventListener('click', function (e) {
      if (adult.checked) return;
      e.preventDefault();
      hint.textContent = 'Önce 18 yaşından büyük olduğunu onayla.';
      adult.focus();
    });
    paintDl();
  }

  /* ================================================================
     Üst çubuk: akıştaki yerin
     ================================================================ */
  var tabs = $$('[data-tab]');
  var scenes = ['radar', 'strike', 'oda', 'snap', 'meet'].map(function (id) { return document.getElementById(id); });
  var lastTab = null;
  function tickTabs() {
    var mid = window.innerHeight * 0.5, cur = null;
    scenes.forEach(function (s) { if (!s) return; var r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) cur = s.id; });
    if (cur === lastTab) return;
    lastTab = cur;
    tabs.forEach(function (t) { if (t.getAttribute('data-tab') === cur) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current'); });
  }

  /* ================================================================
     Açılış: işaretçiye hafif tepki (yalnızca ince işaretçide)
     ================================================================ */
  var hero = $('.hero');
  var mx = 0, my = 0, tx = 0, ty = 0;
  if (finePointer && !reduce && hero) {
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* ================================================================
     Tek döngü
     ================================================================ */
  function inView(node) { if (!node) return false; var r = node.getBoundingClientRect(); return r.bottom > -50 && r.top < window.innerHeight + 50; }
  function frame(now) {
    if (hero && (tx || ty || mx || my) && inView(hero)) {
      mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
      hero.style.setProperty('--mx', mx.toFixed(3));
      hero.style.setProperty('--my', my.toFixed(3));
    }
    if (inView(radarAct)) tickRadar(progress(radarAct), now);
    if (inView(strikeAct)) tickStrike(progress(strikeAct));
    if (inView(roomAct)) tickRoom(progress(roomAct));
    tickTabs();
    requestAnimationFrame(frame);
  }

  buildRadar();
  ScrollCraft.mount(document.body);
  tickRoom(0);
  requestAnimationFrame(frame);
})();
