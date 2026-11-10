// Thank-you wall (Team tab 'kudos', owner request 2026-11-10). Team members write sticky notes to thank each other:
// a colour, a font and size, a message from the library (English or Urdu) or their own words, emojis and stickers
// dragged onto the note, and optionally the person's email (they get the note by email when the owner has set up
// Gmail on Railway). Others react and comment. Internal only: the server answers nothing without the team code, which
// the browser keeps after the first time. A random key in this browser marks its own notes, comments and reactions.
// app.js calls Kudos.view() from render(); everything after that is painted here, inside #kd-root.
(function () {
  'use strict';
  const COLORS = [['yellow', 'Lemon'], ['pink', 'Rose'], ['mint', 'Mint'], ['sky', 'Sky'], ['lavender', 'Lavender'], ['peach', 'Peach'], ['lime', 'Lime'], ['white', 'Paper']];
  const FONTS = [['hand', 'Handwriting', 'Aa'], ['marker', 'Marker', 'Aa'], ['neat', 'Neat', 'Aa'], ['playful', 'Playful', 'Aa'], ['urdu', 'Urdu', 'اردو']];
  const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
  const EMOJIS = '😊 😄 🥰 🤩 😎 🙏 👏 🙌 💪 🤝 👍 ❤️ 💛 💚 💙 💜 🌟 ⭐ ✨ 🎉 🎊 🥳 🏆 🥇 🎯 🚀 🔥 💯 🌈 🌻 🌸 💐 🍰 ☕ 🍎 📚 ✏️ 🎓 🧠 💡 🦄 🐝 🌞 🎈 🎁 👑 💎'.split(' ');
  const STICKERS = '🏆 🥇 🌟 🎉 💐 🦄 🚀 🌈 👑 💯 🔥 🎈 🌻 🍰 ☕ 📚 🎓 💡 👏 ❤️ 🐝 🌞 💎 🎁'.split(' ');
  const STAMPS = ['THANK YOU', 'WOW!', 'SUPERSTAR', 'BRAVO!', 'TOP JOB', 'HERO', 'شکریہ', 'شاباش', 'زبردست'];
  const MAX_STICKERS = 8;

  // The message library: [group, [messages]]. Urdu messages switch the note to the Urdu font.
  const LIB = {
    en: [
      ['Thank you', [
        'Thank you for everything you do. It does not go unnoticed!',
        'Thank you for always being there when the team needs you.',
        'A big thank you for your patience and kindness this week.',
        'Thank you for making our work easier and our days brighter.',
        'Thanks for jumping in to help without being asked.',
        'Thank you for your hard work behind the scenes. We see it!',
        'Thank you for listening and for always finding a way.',
        'Your help made all the difference. Thank you!',
        'Thank you for showing up with a smile every single day.',
        'I could not have done it without you. Thank you!',
        'Thank you for sharing your time and your ideas so generously.',
        'Thank you for being so reliable. We can always count on you.',
        'Thanks for your calm in a busy week. It kept us all going.',
        'Thank you for the extra hours you put in. They mattered.',
        'Thank you for answering every question, again and again, with patience.',
        'A huge thank you from all of us!',
        'Thank you for believing in our teachers.',
        'Thank you for making every school visit count.',
      ]],
      ['Great work', [
        'Amazing work this week. Keep shining!',
        'Your work on this was outstanding. Well done!',
        'You nailed it! Brilliant job.',
        'Great job. Your effort really shows in the results.',
        'What a fantastic piece of work. Proud of you!',
        'You set the bar high, and then you raised it again.',
        'Your attention to detail is incredible. Great work!',
        'Superb planning and even better delivery. Well done!',
        'Your report was clear, careful and so useful. Thank you!',
        'You turned a hard week into a great one. Bravo!',
        'Top class work, as always.',
        'You made it look easy, but we know it was not. Great job!',
        'Excellent work. The whole team benefits from what you did.',
        'Your numbers this week speak for themselves. Well done!',
        'Brilliant session today. Everyone learned something.',
      ]],
      ['Team spirit', [
        'You make this team better just by being on it.',
        'Thank you for always lifting everyone around you.',
        'You are the glue that holds this team together.',
        'Working with you is a joy. Thank you for being a great teammate.',
        'Thanks for sharing the load. Teamwork makes the dream work!',
        'You always make new members feel welcome. Thank you!',
        'Your positive energy is contagious. Never change!',
        'Thank you for supporting me when I needed it most.',
        'You bring out the best in all of us.',
        'Thanks for always having our backs.',
        'Great teams are built by people like you.',
        'Thank you for cheering everyone on. It means a lot.',
        'You turned a group of people into a real team.',
        'Thank you for the kind words and the encouragement.',
      ]],
      ['Above and beyond', [
        'You went the extra mile, and everyone noticed. Thank you!',
        'Rain or shine, you never miss a school. You are a hero!',
        'Thank you for staying late to get it right.',
        'You did far more than anyone asked. Truly inspiring.',
        'Thank you for solving a problem nobody else could.',
        'Your dedication is remarkable. Thank you for going above and beyond.',
        'You stepped up when it mattered most. Thank you!',
        'Thank you for taking on extra work so others could rest.',
        'You never give up on a school or a teacher. Thank you!',
        'Thank you for turning a crisis into a success.',
        'Your commitment to children’s learning inspires us all.',
        'Thank you for always finding one more way to help.',
      ]],
      ['Coaching & teaching', [
        'Your feedback to teachers is clear, kind and practical. Thank you!',
        'Thank you for the great debrief. The teacher tried your idea the very next day!',
        'Your classroom visits are making a real difference.',
        'Thank you for believing every teacher can grow.',
        'Your coaching has changed how our teachers teach. Thank you!',
        'Thank you for making lesson plans come alive in the classroom.',
        'You make every teacher feel heard and supported.',
        'The children in your class are lucky to have you!',
        'Your lesson today was engaging from start to finish. Well done!',
        'Thank you for asking the questions that make teachers think.',
        'You model great teaching every single day.',
        'Thank you for your patience with every teacher and every child.',
        'Your classroom is full of curiosity and joy. Thank you!',
        'Thank you for trying new ideas and sharing what works.',
        'You make learning fun. The children can feel it!',
        'Thank you for using the lesson plans so well. Your class shows it!',
      ]],
      ['Growth', [
        'Your growth this term has been amazing to watch.',
        'You have come so far. Keep going!',
        'Every week you get better. So proud of your progress!',
        'Thank you for being open to feedback and trying new things.',
        'Your hard work is paying off. Well done!',
        'You took on a big challenge and grew with it. Bravo!',
        'You learn fast and share even faster. Thank you!',
        'Small steps every day, big results. Keep it up!',
        'Your confidence has grown so much. It shows in everything you do.',
        'From good to great, and you are not done yet!',
      ]],
      ['Fun', [
        'You are a star! 🌟',
        'High five! ✋ You did it!',
        'You are proof that hard work and a good heart win.',
        'Coffee is on me next time! ☕ Thank you!',
        'If there were a medal for awesome, you would win gold. 🥇',
        'Thank you for the laughs. They made the long days shorter!',
        'You rock! 🎸',
        'Keep calm and carry on being amazing.',
        'Our team’s secret superpower: you! 💪',
        'Warning: working with you may cause happiness. 😄',
        'Three cheers for you! Hip hip hooray! 🎉',
        'Legend. That is all. 👑',
      ]],
    ],
    ur: [
      ['شکریہ', [
        'آپ کی محنت اور لگن کا بہت بہت شکریہ!',
        'ہمیشہ ساتھ دینے کا دل سے شکریہ۔',
        'آپ کے تعاون کے بغیر یہ ممکن نہ تھا۔ شکریہ!',
        'آپ کی مسکراہٹ سے ہمارا دن روشن ہو جاتا ہے۔ شکریہ!',
        'وقت دینے اور ہر سوال کا صبر سے جواب دینے کا شکریہ۔',
        'آپ جیسے ساتھی خوش قسمتی سے ملتے ہیں۔ شکریہ!',
        'آپ کی مدد نے سب کچھ آسان بنا دیا۔ شکریہ!',
        'ہر اسکول کے دورے کو کامیاب بنانے کا شکریہ۔',
        'اساتذہ پر یقین رکھنے کا بہت شکریہ۔',
        'پوری ٹیم کی طرف سے آپ کا بہت شکریہ!',
      ]],
      ['شاباش', [
        'شاباش! آپ نے کمال کر دیا۔',
        'بہت خوب! آپ کی محنت رنگ لائی۔',
        'زبردست کام! ہمیں آپ پر فخر ہے۔',
        'آپ نے یہ کام بہترین انداز میں کیا۔ شاباش!',
        'آپ کی کارکردگی قابلِ تعریف ہے۔',
        'ہر ہفتے آپ پہلے سے بہتر ہو رہے ہیں۔ شاباش!',
        'آپ کی کلاس میں سیکھنے کا شوق صاف نظر آتا ہے۔ بہت خوب!',
        'آپ کی رہنمائی سے اساتذہ کو بہت فائدہ ہوا۔ شاباش!',
        'آپ نے مشکل کام کو آسان بنا دیا۔ زبردست!',
        'یوں ہی آگے بڑھتے رہیں۔ آپ ستارہ ہیں! 🌟',
      ]],
      ['ٹیم', [
        'آپ کی وجہ سے ہماری ٹیم مضبوط ہے۔',
        'آپ کے ساتھ کام کرنا خوشی کی بات ہے۔',
        'آپ ہمیشہ سب کا حوصلہ بڑھاتے ہیں۔ شکریہ!',
        'مشکل وقت میں ساتھ دینے کا بہت شکریہ۔',
        'آپ کی مثبت سوچ پوری ٹیم کو توانائی دیتی ہے۔',
        'آپ نے ہمیشہ اضافی محنت کی۔ ہم سب آپ کے شکر گزار ہیں۔',
        'آپ جیسے لوگوں سے ٹیم بنتی ہے۔',
        'بچوں کی تعلیم کے لیے آپ کی لگن ہم سب کے لیے مثال ہے۔',
      ]],
    ],
  };

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };
  const ss = (k) => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const ssSet = (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* storage blocked */ } };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isUrdu = (t) => /[؀-ۿ]/.test(t);
  function myKey() {
    let k = ls('kudos.key');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(k)) {
      const a = new Uint8Array(18); crypto.getRandomValues(a);
      k = [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
      lsSet('kudos.key', k);
    }
    return k;
  }

  const K = { code: ls('kudos.code'), items: null, err: '', at: 0, loading: false, q: '', sort: 'new', email: false, admin: false, reacts: ['👏', '❤️', '🎉', '🙌', '🌟'], fresh: null };

  let fontsAdded = false;
  function addFonts() {
    if (fontsAdded) return; fontsAdded = true;
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Patrick+Hand&family=Permanent+Marker&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap';
    document.head.appendChild(l);
  }

  async function api(path, body) {
    const headers = { 'x-team-code': K.code, 'x-kudos-key': myKey() };
    const adm = ss('kudos.admin'); if (adm) headers['x-admin-token'] = adm;
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.code === 'team') { K.code = ''; lsSet('kudos.code', ''); K.items = null; K.err = 'That team code is not right. Please check it with your team lead.'; paint(); throw new Error(K.err); }
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    return j;
  }
  async function load() {
    if (K.loading) return; K.loading = true;
    try { const j = await api('/api/kudos'); K.items = j.items || []; K.email = !!j.email; K.admin = !!j.admin; K.reacts = j.reacts || K.reacts; K.err = ''; K.at = Date.now(); }
    catch (e) { if (K.code) { K.err = e.message; if (!K.items) K.items = []; } }
    K.loading = false; paint();
  }

  // ---------- one note ----------
  const ago = (t) => {
    const s = (Date.now() - Date.parse(t)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : `${d} days ago`; }
    const d = new Date(t); return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
  };
  const rot = (id) => (((id * 37) % 9) - 4) * 0.75;
  function stickerHTML(s, i, edit) {
    const st = `left:${s.x}%;top:${s.y}%;--r:${s.r}deg;--z:${s.z}`;
    return s.t === 's'
      ? `<span class="kd-s kd-stamp${edit ? ' ed' : ''}" ${edit ? `data-i="${i}"` : ''} style="${st}" ${isUrdu(s.v) ? 'dir="rtl"' : ''}>${esc(s.v)}</span>`
      : `<span class="kd-s kd-emo${edit ? ' ed' : ''}" ${edit ? `data-i="${i}"` : ''} style="${st}">${esc(s.v)}</span>`;
  }
  // The paper of a note (shared by the wall, the comments view and the live preview).
  function paper(n, edit) {
    return `<div class="kd-paper"><i class="kd-pin" aria-hidden="true"></i>
      <div class="kd-to">To <b>${esc(n.to || '…')}</b>${n.emailed ? ' <span title="Sent to them by email">📩</span>' : ''}</div>
      <div class="kd-body" dir="auto">${esc(n.body || (edit ? 'Your message appears here…' : ''))}</div>
      <div class="kd-from">— ${esc(n.from || '…')}</div>
      <div class="kd-stk">${(n.stickers || []).map((s, i) => stickerHTML(s, i, edit)).join('')}</div></div>`;
  }
  const cls = (n) => `kc-${esc(n.color)} kf-${esc(n.font)} ks-${esc(n.size)}`;
  function noteHTML(n, big) {
    const reacts = K.reacts.map((e) => { const c = n.reacts[e] || 0; const on = n.my_reacts.includes(e); return `<button type="button" class="kd-r${on ? ' on' : ''}${c ? '' : ' z'}" data-kdr="${n.id}" data-e="${esc(e)}" aria-pressed="${on}" title="${on ? 'Take back your reaction' : 'React'}">${e}${c ? `<b>${c}</b>` : ''}</button>`; }).join('');
    const nc = n.comments.length;
    return `<article class="kd-note ${cls(n)}${big ? ' big' : ''}${K.fresh === n.id && !big ? ' kd-new' : ''}" style="--rot:${big ? 0 : rot(n.id)}deg" data-note="${n.id}">
      ${paper(n)}
      <div class="kd-meta">${esc(ago(n.created_at))}${n.mine && n.email_status === 'failed' ? ' · <span class="kd-warn">email not sent</span>' : ''}</div>
      <div class="kd-foot">${reacts}
        ${big ? '' : `<button type="button" class="kd-c" data-kdcom="${n.id}" title="Comments">💬${nc ? `<b>${nc}</b>` : ''}</button>`}
        ${n.mine || K.admin ? `<button type="button" class="kd-x" data-kddel="${n.id}" title="Remove this note">×</button>` : ''}</div></article>`;
  }

  // ---------- the wall ----------
  function shown() {
    const q = K.q.trim().toLowerCase();
    let a = K.items.filter((n) => !q || `${n.to} ${n.from} ${n.body}`.toLowerCase().includes(q));
    if (K.sort === 'loved') a = a.slice().sort((x, y) => Object.values(y.reacts).reduce((s, v) => s + v, 0) + y.comments.length - Object.values(x.reacts).reduce((s, v) => s + v, 0) - x.comments.length || y.id - x.id);
    return a;
  }
  function boardHTML() {
    const a = shown();
    if (!K.items.length) return '<div class="kd-empty"><div class="kd-empty-i">📝</div><p>The wall is empty. Be the first to thank someone!</p><button type="button" class="btn dark" data-kdnew="1">✍️ Write the first note</button></div>';
    if (!a.length) return `<p class="note">No note matches “${esc(K.q)}”.</p>`;
    return a.map((n) => noteHTML(n)).join('');
  }
  function stats() {
    const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const month = K.items.filter((n) => Date.parse(n.created_at) >= m0);
    const people = new Set(month.map((n) => n.to.toLowerCase())).size;
    const reacts = K.items.reduce((s, n) => s + Object.values(n.reacts).reduce((x, v) => x + v, 0), 0);
    return `<div class="kd-stats"><span><b>${month.length}</b> note${month.length === 1 ? '' : 's'} this month</span><span><b>${people}</b> ${people === 1 ? 'person' : 'people'} thanked</span><span><b>${reacts}</b> reactions in all</span></div>`;
  }
  function inner() {
    if (!K.code) {
      return `<div class="kd-lock"><div class="kd-lock-i">🔒</div><h3>For our team only</h3>
        <p>Type the team code to open the thank-you wall. You only need to do this once on this device.</p>
        <form id="kd-lockf" class="kd-lockf"><input class="inp" id="kd-code" type="password" autocomplete="off" placeholder="Team code" required aria-label="Team code"><button class="btn dark" type="submit">Open the wall</button></form>
        ${K.err ? `<p class="note warn">${esc(K.err)}</p>` : ''}</div>`;
    }
    if (!K.items) { load(); return '<p class="note">Opening the wall…</p>'; }
    if (Date.now() - K.at > 20000 && !K.loading) setTimeout(load, 0);
    return `<div class="kd-top"><button type="button" class="btn dark kd-new-b" data-kdnew="1">✍️ Write a note</button>${stats()}</div>
      <div class="kd-tools"><input class="inp" id="kd-q" type="search" placeholder="Search a name or a word…" value="${esc(K.q)}" aria-label="Search notes">
        <div class="seg" role="group" aria-label="Order">${[['new', 'Newest'], ['loved', 'Most loved']].map(([k, l]) => `<button type="button" data-kdsort="${k}" aria-pressed="${K.sort === k}">${l}</button>`).join('')}</div></div>
      ${K.err ? `<p class="note warn">${esc(K.err)}</p>` : ''}
      <div class="kd-board" id="kd-board">${boardHTML()}</div>
      <details class="kd-adm"><summary>Admin</summary><form id="kd-admf" class="kd-lockf"><input class="inp" id="kd-admp" type="password" autocomplete="off" placeholder="Admin password" aria-label="Admin password"><button class="btn" type="submit">${K.admin ? 'Signed in' : 'Use'}</button>${K.admin ? '<button class="btn" type="button" data-kdadmout="1">Sign out</button>' : ''}</form><p class="note">The admin can remove any note or comment.</p></details>`;
  }
  function paint() { const r = $('#kd-root'); if (r) r.innerHTML = inner(); }
  function paintBoard() { const b = $('#kd-board'); if (b) b.innerHTML = boardHTML(); }
  function put(item) { const i = K.items.findIndex((n) => n.id === item.id); if (i >= 0) K.items[i] = item; else K.items.unshift(item); }
  function paintNote(item) {
    const el = document.querySelector(`#kd-board .kd-note[data-note="${item.id}"]`);
    if (el) el.outerHTML = noteHTML(item);
    const st = $('#kd-root .kd-stats'); if (st) st.outerHTML = stats();
    const d = $('#kd-cdlg'); if (d && d.open && +d.dataset.id === item.id) commentsBody(d, item);
  }

  function view() {
    addFonts();
    return `<section class="card" id="c-kd"><div class="card-h"><h2>Thank-you wall</h2></div>
      <p class="note">Thank someone on the team with a sticky note: pick a colour, a message from the library or your own words, then add emojis and stickers. Add their email and they get the note by email too. Everyone on the team can see the wall, react and comment. Team members only.</p>
      <div id="kd-root">${inner()}</div></section>`;
  }

  // ---------- writing a note ----------
  let D = null, sel = -1;
  function dlg(id) {
    let d = $(`#${id}`);
    if (!d) { d = document.createElement('dialog'); d.className = 'modal fb kd-dlg'; d.id = id; document.body.appendChild(d); }
    return d;
  }
  function compose() {
    D = { to: '', email: '', body: '', color: COLORS[Math.floor(Math.random() * COLORS.length)][0], font: 'hand', size: 'm', stickers: [], from: ls('kudos.name') };
    sel = -1;
    const d = dlg('kd-wdlg');
    d.innerHTML = `<form class="m-panel kd-w" id="kd-wf">
      <div class="m-head"><div class="m-tt"><h3>Write a thank-you note</h3><p>Make it yours: colour, words, font, emojis and stickers.</p></div><button class="x" type="button" data-kdclose="kd-wdlg" aria-label="Close">×</button></div>
      <div class="m-body kd-wb">
        <div class="kd-pv"><div id="kd-prev"></div><p class="kd-hint">Drag stickers to move them. Tap one to pick it, then make it bigger or smaller. Drag it off the note to remove it.</p>
          <div class="kd-sz" id="kd-sz"></div></div>
        <div class="kd-ctl">
          <div class="fb-two"><div><label class="fb-l" for="kd-to">To</label><input class="inp" id="kd-to" maxlength="80" placeholder="Their name" required></div>
            <div><label class="fb-l" for="kd-email">Their email <span class="dim">(optional)</span></label><input class="inp" id="kd-email" type="email" maxlength="120" placeholder="name@niete.edu.pk"></div></div>
          <p class="note kd-small">${K.email ? 'With an email, they also get the note in their inbox.' : 'Email is not switched on yet: the note goes on the wall, and the email starts once it is set up.'}</p>
          <div><div class="kd-lab"><label class="fb-l" for="kd-body">Message</label><span class="dim" id="kd-cnt">0/400</span></div>
            <textarea class="inp kd-ta" id="kd-body" maxlength="400" rows="4" placeholder="Write your own words, or pick one from the library" dir="auto"></textarea>
            <div class="kd-row"><button type="button" class="btn kd-tg" data-kdpanel="lib" aria-expanded="false">📚 Message library</button><button type="button" class="btn kd-tg" data-kdpanel="emo" aria-expanded="false">😊 Emoji</button></div>
            <div class="kd-panel" id="kd-p-lib" hidden></div>
            <div class="kd-panel kd-emos" id="kd-p-emo" hidden>${EMOJIS.map((e) => `<button type="button" data-kdemo="${e}">${e}</button>`).join('')}</div></div>
          <div><span class="fb-l">Note colour</span><div class="kd-sw" role="radiogroup" aria-label="Note colour">${COLORS.map(([k, l]) => `<button type="button" class="kc-${k}" data-kdcol="${k}" role="radio" aria-checked="${D.color === k}" title="${l}" aria-label="${l}"></button>`).join('')}</div></div>
          <div class="kd-two"><div><span class="fb-l">Font</span><div class="kd-fonts" role="radiogroup" aria-label="Font">${FONTS.map(([k, l, s]) => `<button type="button" class="kf-${k}" data-kdfont="${k}" role="radio" aria-checked="${D.font === k}" title="${l}">${s}</button>`).join('')}</div></div>
            <div><span class="fb-l">Size</span><div class="seg" role="radiogroup" aria-label="Text size">${SIZES.map(([k, l]) => `<button type="button" data-kdsize="${k}" aria-pressed="${D.size === k}">${l}</button>`).join('')}</div></div></div>
          <div><span class="fb-l">Stickers <span class="dim" id="kd-scnt">(0/${MAX_STICKERS})</span></span>
            <div class="kd-stks">${STICKERS.map((e) => `<button type="button" data-kdstk="${e}" title="Add to the note">${e}</button>`).join('')}</div>
            <div class="kd-stamps">${STAMPS.map((t) => `<button type="button" data-kdstamp="${esc(t)}" ${isUrdu(t) ? 'dir="rtl"' : ''}>${esc(t)}</button>`).join('')}</div></div>
          <div><label class="fb-l" for="kd-from">Your name</label><input class="inp" id="kd-from" maxlength="80" required autocomplete="name" value="${esc(D.from)}"></div>
          <p class="note" id="kd-out" role="status"></p>
          <div class="fb-actions"><button class="btn" type="button" data-kdclose="kd-wdlg">Cancel</button><button class="btn dark" type="submit" id="kd-send">Put it on the wall 📌</button></div>
        </div></div></form>`;
    libPanel('en', 0);
    prev();
    d.showModal();
    setTimeout(() => { const t = $('#kd-to'); if (t) t.focus(); }, 30);
  }
  function libPanel(lang, g) {
    const p = $('#kd-p-lib'); if (!p) return;
    const groups = LIB[lang];
    p.innerHTML = `<div class="kd-lib-h"><div class="seg">${[['en', 'English'], ['ur', 'اردو']].map(([k, l]) => `<button type="button" data-kdlang="${k}" aria-pressed="${lang === k}">${l}</button>`).join('')}</div>
      <div class="kd-chips">${groups.map(([n], i) => `<button type="button" data-kdgrp="${lang}:${i}" aria-pressed="${i === g}" ${lang === 'ur' ? 'dir="rtl"' : ''}>${esc(n)}</button>`).join('')}</div></div>
      <div class="kd-lib" ${lang === 'ur' ? 'dir="rtl"' : ''}>${groups[g][1].map((m) => `<button type="button" data-kdmsg="${esc(m)}">${esc(m)}</button>`).join('')}</div>`;
  }
  function prev() {
    const p = $('#kd-prev'); if (!p || !D) return;
    p.innerHTML = `<div class="kd-note big kd-live ${cls(D)}">${paper(D, true)}</div>`;
    if (sel >= D.stickers.length) sel = -1;
    p.querySelectorAll('.kd-s').forEach((x) => x.classList.toggle('sel', +x.dataset.i === sel));
    $('#kd-sz').innerHTML = sel >= 0 ? `<button type="button" class="btn" data-kdzoom="-1">− Smaller</button><button type="button" class="btn" data-kdzoom="1">+ Bigger</button><button type="button" class="btn" data-kdzoom="0">Remove sticker</button>` : '';
    const c = $('#kd-scnt'); if (c) c.textContent = `(${D.stickers.length}/${MAX_STICKERS})`;
    const n = $('#kd-cnt'); if (n) n.textContent = `${D.body.length}/400`;
  }
  function addSticker(t, v) {
    if (D.stickers.length >= MAX_STICKERS) { const o = $('#kd-out'); o.className = 'note warn'; o.textContent = `Up to ${MAX_STICKERS} stickers on one note.`; return; }
    const r = () => Math.round((Math.random() * 2 - 1) * 10) / 1;
    // stamps sit lower right, emojis around the edges, so the text stays readable
    const spots = t === 's' ? [[62, 74], [12, 74], [60, 8]] : [[86, 10], [8, 82], [88, 70], [6, 16], [50, 88], [74, 40], [20, 50], [90, 40]];
    const sp = spots[D.stickers.filter((s) => s.t === t).length % spots.length];
    D.stickers.push({ t, v, x: sp[0], y: sp[1], r: t === 's' ? -8 + r() / 2 : r() * 1.5, z: t === 's' ? 1 : 1.3 });
    sel = D.stickers.length - 1;
    prev();
  }
  async function send(e) {
    e.preventDefault();
    D.to = $('#kd-to').value; D.email = $('#kd-email').value.trim(); D.from = $('#kd-from').value;
    const out = $('#kd-out'); out.className = 'note'; out.textContent = 'Putting it on the wall…'; $('#kd-send').disabled = true;
    try {
      const j = await api('/api/kudos', { to: D.to, email: D.email, body: D.body, color: D.color, font: D.font, size: D.size, stickers: D.stickers, from: D.from });
      lsSet('kudos.name', D.from.trim());
      put(j.item); K.fresh = j.item.id; K.q = ''; K.sort = 'new';
      const msg = j.email === 'sending' ? `On the wall, and on its way to ${D.email}.` : j.email === 'off' ? 'On the wall. (Email is not switched on yet, so no email was sent.)' : j.email === 'limit' ? 'On the wall. (Too many emails from this device this hour, so no email was sent.)' : 'On the wall!';
      dlg('kd-wdlg').close();
      paint(); confetti(); toast(msg);
      setTimeout(() => { const el = document.querySelector(`.kd-note[data-note="${j.item.id}"]`); if (el) el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); }, 60);
    } catch (err) { out.className = 'note warn'; out.textContent = err.message; $('#kd-send').disabled = false; }
  }

  // drag stickers on the preview
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const s = e.target.closest('#kd-prev .kd-s'); if (!s || !D) return;
    e.preventDefault();
    const box = s.closest('.kd-paper').getBoundingClientRect();
    drag = { el: s, i: +s.dataset.i, box, moved: false, x0: e.clientX, y0: e.clientY };
    sel = drag.i;
    document.querySelectorAll('#kd-prev .kd-s').forEach((x) => x.classList.toggle('sel', x === s));
    s.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 3) drag.moved = true;
    const x = ((e.clientX - drag.box.left) / drag.box.width) * 100, y = ((e.clientY - drag.box.top) / drag.box.height) * 100;
    drag.el.style.left = `${x}%`; drag.el.style.top = `${y}%`;
    drag.el.classList.toggle('off', x < -6 || x > 106 || y < -6 || y > 106);
    drag.nx = x; drag.ny = y;
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved && d.nx !== undefined) {
      if (d.nx < -6 || d.nx > 106 || d.ny < -6 || d.ny > 106) { D.stickers.splice(d.i, 1); sel = -1; }
      else { D.stickers[d.i].x = Math.round(Math.max(0, Math.min(100, d.nx)) * 10) / 10; D.stickers[d.i].y = Math.round(Math.max(0, Math.min(100, d.ny)) * 10) / 10; }
    }
    prev();
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // ---------- comments ----------
  function commentsBody(d, n) {
    d.querySelector('#kd-cbody').innerHTML = `${noteHTML(n, true)}
      <div class="kd-cl">${n.comments.length ? n.comments.map((c) => `<div class="kd-cm"><div class="kd-cm-h"><b>${esc(c.name)}</b> <span class="dim">${esc(ago(c.created_at))}</span>${c.mine || K.admin ? ` <button type="button" class="kd-cx" data-kdcdel="${c.id}" title="Remove this comment">Remove</button>` : ''}</div><div dir="auto">${esc(c.body)}</div></div>`).join('') : '<p class="note">No comments yet. Add the first one!</p>'}</div>`;
  }
  function comments(id) {
    const n = K.items.find((x) => x.id === id); if (!n) return;
    const d = dlg('kd-cdlg'); d.dataset.id = id;
    d.innerHTML = `<form class="m-panel kd-cw" id="kd-cf">
      <div class="m-head"><div class="m-tt"><h3>Note to ${esc(n.to)}</h3><p>From ${esc(n.from)} · ${esc(ago(n.created_at))}</p></div><button class="x" type="button" data-kdclose="kd-cdlg" aria-label="Close">×</button></div>
      <div class="m-body fb-body"><div id="kd-cbody"></div>
        <div class="fb-two"><div><label class="fb-l" for="kd-cn">Your name</label><input class="inp" id="kd-cn" maxlength="80" required value="${esc(ls('kudos.name'))}"></div>
          <div><label class="fb-l" for="kd-ct">Comment</label><input class="inp" id="kd-ct" maxlength="300" required placeholder="Add a kind word…" dir="auto"></div></div>
        <p class="note" id="kd-cout" role="status"></p>
        <div class="fb-actions"><button class="btn" type="button" data-kdclose="kd-cdlg">Close</button><button class="btn dark" type="submit" id="kd-csend">Add comment</button></div></div></form>`;
    commentsBody(d, n);
    d.showModal();
  }
  async function addComment(e) {
    e.preventDefault();
    const d = $('#kd-cdlg'), id = +d.dataset.id, out = $('#kd-cout');
    out.className = 'note'; out.textContent = 'Adding…'; $('#kd-csend').disabled = true;
    try {
      const name = $('#kd-cn').value;
      const j = await api(`/api/kudos/${id}/comments`, { name, body: $('#kd-ct').value });
      lsSet('kudos.name', name.trim());
      put(j.item); paintNote(j.item); $('#kd-ct').value = ''; out.textContent = '';
    } catch (err) { out.className = 'note warn'; out.textContent = err.message; }
    $('#kd-csend').disabled = false;
  }

  // ---------- small effects ----------
  function confetti() {
    if (reduced()) return;
    const box = document.createElement('div'); box.className = 'kd-conf'; box.setAttribute('aria-hidden', 'true');
    const bits = ['🎉', '✨', '💛', '🌟', '🎊', '💐', '👏'];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('span');
      s.textContent = bits[i % bits.length];
      s.style.left = `${Math.random() * 100}%`; s.style.animationDelay = `${Math.random() * 0.5}s`; s.style.setProperty('--dx', `${(Math.random() * 2 - 1) * 120}px`); s.style.fontSize = `${16 + Math.random() * 18}px`;
      box.appendChild(s);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 3200);
  }
  function toast(t) {
    const el = document.createElement('div'); el.className = 'kd-toast'; el.setAttribute('role', 'status'); el.textContent = t;
    document.body.appendChild(el); setTimeout(() => el.classList.add('out'), 3600); setTimeout(() => el.remove(), 4200);
  }

  // ---------- events ----------
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id === 'kd-lockf') {
      e.preventDefault();
      const v = $('#kd-code').value.trim(); if (!v) return;
      K.code = v; K.err = ''; K.items = null;
      try { const j = await api('/api/kudos'); lsSet('kudos.code', v); K.items = j.items || []; K.email = !!j.email; K.admin = !!j.admin; K.reacts = j.reacts || K.reacts; K.at = Date.now(); paint(); }
      catch (err) { if (K.code) { K.err = err.message; K.code = ''; paint(); } }
    } else if (f.id === 'kd-admf') {
      e.preventDefault();
      const v = $('#kd-admp').value; if (!v) return;
      ssSet('kudos.admin', v); await load();
      if (!K.admin) { ssSet('kudos.admin', ''); toast('That admin password is not right.'); }
    } else if (f.id === 'kd-wf') send(e);
    else if (f.id === 'kd-cf') addComment(e);
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'kd-q') { K.q = t.value; paintBoard(); }
    else if (D && t.id === 'kd-body') { D.body = t.value; prev(); }
    else if (D && t.id === 'kd-to') { D.to = t.value; prev(); }
    else if (D && t.id === 'kd-from') { D.from = t.value; prev(); }
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const ds = b.dataset;
    if (ds.kdnew) compose();
    else if (ds.kdclose) $(`#${ds.kdclose}`).close();
    else if (ds.kdsort) { K.sort = ds.kdsort; paint(); }
    else if (ds.kdr) {
      b.disabled = true;
      try { const j = await api(`/api/kudos/${ds.kdr}/react`, { emoji: ds.e }); put(j.item); paintNote(j.item); if (!reduced() && j.item.my_reacts.includes(ds.e)) { const nb = document.querySelector(`.kd-note[data-note="${ds.kdr}"] .kd-r[data-e="${ds.e}"]`); if (nb) nb.classList.add('pop'); } }
      catch (err) { toast(err.message); b.disabled = false; }
    }
    else if (ds.kdcom) comments(+ds.kdcom);
    else if (ds.kddel) {
      if (!confirm('Remove this note from the wall? This cannot be undone.')) return;
      try { await api(`/api/kudos/${ds.kddel}/delete`, {}); K.items = K.items.filter((n) => n.id !== +ds.kddel); const d = $('#kd-cdlg'); if (d && d.open && +d.dataset.id === +ds.kddel) d.close(); paint(); toast('Note removed.'); }
      catch (err) { toast(err.message); }
    }
    else if (ds.kdcdel) {
      if (!confirm('Remove this comment?')) return;
      try { const j = await api(`/api/kudos/comments/${ds.kdcdel}/delete`, {}); if (j.item) { put(j.item); paintNote(j.item); } }
      catch (err) { toast(err.message); }
    }
    else if (ds.kdadmout) { ssSet('kudos.admin', ''); load(); }
    else if (!D) return;
    else if (ds.kdpanel) {
      const p = $(`#kd-p-${ds.kdpanel}`), open = p.hidden;
      document.querySelectorAll('.kd-panel').forEach((x) => { x.hidden = true; });
      document.querySelectorAll('[data-kdpanel]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
      p.hidden = !open; b.setAttribute('aria-expanded', String(open));
    }
    else if (ds.kdlang) libPanel(ds.kdlang, 0);
    else if (ds.kdgrp) { const [l, g] = ds.kdgrp.split(':'); libPanel(l, +g); }
    else if (ds.kdmsg) {
      D.body = ds.kdmsg; $('#kd-body').value = D.body;
      if (isUrdu(D.body) && D.font !== 'urdu') setFont('urdu');
      else if (!isUrdu(D.body) && D.font === 'urdu') setFont('hand');
      prev();
    }
    else if (ds.kdemo) {
      const ta = $('#kd-body'), s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? s;
      const v = ta.value.slice(0, s) + ds.kdemo + ta.value.slice(en);
      if (v.length > 400) return;
      ta.value = v; D.body = v; ta.focus(); ta.setSelectionRange(s + ds.kdemo.length, s + ds.kdemo.length); prev();
    }
    else if (ds.kdcol) { D.color = ds.kdcol; document.querySelectorAll('[data-kdcol]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); prev(); }
    else if (ds.kdfont) setFont(ds.kdfont);
    else if (ds.kdsize) { D.size = ds.kdsize; document.querySelectorAll('[data-kdsize]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); prev(); }
    else if (ds.kdstk) addSticker('e', ds.kdstk);
    else if (ds.kdstamp) addSticker('s', ds.kdstamp);
    else if (ds.kdzoom !== undefined && sel >= 0) {
      const z = +ds.kdzoom;
      if (z === 0) { D.stickers.splice(sel, 1); sel = -1; }
      else D.stickers[sel].z = Math.round(Math.max(0.6, Math.min(2.5, D.stickers[sel].z + z * 0.25)) * 100) / 100;
      prev();
    }
  });
  function setFont(f) { D.font = f; document.querySelectorAll('[data-kdfont]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.kdfont === f))); prev(); }

  window.Kudos = { view };
}());
