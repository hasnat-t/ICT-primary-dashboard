const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const KD = require('../kudos');

test('thank-you wall: note and comment validation', () => {
  const base = { from: 'Hasnat', to: 'Bilal', body: 'Thank you for everything!', color: 'pink', font: 'marker', size: 'l', stickers: [] };
  const ok = KD.validateNote(base).row;
  assert.deepStrictEqual(ok, { from: 'Hasnat', to: 'Bilal', email: null, body: 'Thank you for everything!', color: 'pink', font: 'marker', size: 'l', stickers: [] });
  assert.ok(KD.validateNote({ ...base, from: 'H' }).error);
  assert.ok(KD.validateNote({ ...base, to: '' }).error);
  assert.ok(KD.validateNote({ ...base, body: ' ' }).error);
  assert.ok(KD.validateNote({ ...base, email: 'not an email' }).error);
  assert.ok(KD.validateNote({ ...base, email: 'a@b.com\r\nBcc: x@y.com' }).error);   // no header injection
  assert.strictEqual(KD.validateNote({ ...base, email: ' Bilal@Gmail.com ' }).row.email, 'bilal@gmail.com');   // any domain
  assert.ok(KD.validateNote({ ...base, body: 'see https://evil.example' }).error);   // no links: notes may be emailed
  assert.ok(KD.validateNote({ ...base, body: 'go to www.x.org' }).error);
  assert.ok(KD.validateNote({ ...base, body: 'visit prize.com now' }).error);
  assert.ok(!KD.validateNote({ ...base, body: 'Great job. Me and the team are proud, e.g. of the visits.' }).error);
  // unknown look falls back to the defaults
  const d = KD.validateNote({ ...base, color: 'black', font: 'comic', size: 'xl' }).row;
  assert.deepStrictEqual([d.color, d.font, d.size], ['yellow', 'hand', 'm']);
  // Urdu text is fine; long text is cut at 400
  assert.strictEqual(KD.validateNote({ ...base, body: 'شاباش! آپ نے کمال کر دیا۔' }).row.body, 'شاباش! آپ نے کمال کر دیا۔');
  assert.strictEqual(KD.validateNote({ ...base, body: 'x'.repeat(900) }).row.body.length, 400);
  // stickers: emojis and known stamps only, clamped, at most 8
  const st = KD.validateNote({ ...base, stickers: [{ t: 'e', v: '🏆', x: 120, y: -4, r: 90, z: 9 }, { t: 'e', v: '<b>' }, { t: 's', v: 'شاباش', x: 50, y: 50 }, { t: 's', v: 'HACKED' }, { t: 'e', v: '❤️' }] }).row.stickers;
  assert.deepStrictEqual(st, [{ t: 'e', v: '🏆', x: 100, y: 0, r: 30, z: 2.5 }, { t: 's', v: 'شاباش', x: 50, y: 50, r: 0, z: 1 }, { t: 'e', v: '❤️', x: 50, y: 50, r: 0, z: 1 }]);
  assert.strictEqual(KD.validateNote({ ...base, stickers: Array(20).fill({ t: 'e', v: '🌟' }) }).row.stickers.length, 8);
  assert.deepStrictEqual(KD.validateComment({ name: 'Ayesha', body: '  So true!  ' }).row, { name: 'Ayesha', body: 'So true!' });
  assert.ok(KD.validateComment({ name: 'Ayesha', body: '' }).error);
  assert.ok(KD.validateComment({ name: 'A', body: 'hi' }).error);
});

test('thank-you wall: team code and browser key', () => {
  assert.strictEqual(KD.secretOk('abc', ''), false);   // closed when not set
  assert.strictEqual(KD.secretOk('abc', 'abc'), true);
  assert.strictEqual(KD.secretOk('abd', 'abc'), false);
  assert.strictEqual(KD.secretOk(undefined, 'abc'), false);
  assert.strictEqual(KD.viewerOf({ headers: { 'x-kudos-key': 'short' } }), null);
  const v = KD.viewerOf({ headers: { 'x-kudos-key': 'a'.repeat(36) } });
  assert.match(v, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(v, 'a'.repeat(36));   // only the hash is kept
});

test('thank-you wall: store, reactions, comments and removal rights', async () => {
  const store = KD.createStore({ pool: null, file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kd-')), 'kudos.json') });
  const me = 'm'.repeat(32), you = 'y'.repeat(32);
  const row = KD.validateNote({ from: 'Hasnat', to: 'Bilal', email: 'bilal@niete.edu.pk', body: 'Thanks!', stickers: [{ t: 'e', v: '🌟', x: 10, y: 10 }] }).row;
  const a = await store.add(row, me);
  assert.strictEqual(a.mine, true);
  assert.strictEqual(a.emailed, true);
  assert.strictEqual(a.email_status, 'pending');
  assert.strictEqual(JSON.stringify(a).includes('bilal@niete.edu.pk'), false);   // the wall never shows the address
  assert.strictEqual(JSON.stringify(a).includes(me), false);                      // nor the owner key
  const b = await store.add({ ...row, email: null, to: 'Sana' }, you);
  assert.deepStrictEqual((await store.list(me)).map((n) => [n.to, n.mine]), [['Sana', false], ['Bilal', true]]);
  // reactions toggle per viewer
  let n = await store.react(a.id, '👏', me);
  n = await store.react(a.id, '👏', you);
  assert.deepStrictEqual([n.reacts['👏'], n.my_reacts], [2, ['👏']]);
  n = await store.react(a.id, '👏', me);
  assert.deepStrictEqual([n.reacts['👏'], n.my_reacts], [1, []]);
  // comments
  n = await store.comment(a.id, { name: 'Ayesha', body: 'Well deserved!' }, you);
  assert.deepStrictEqual(n.comments.map((c) => [c.name, c.body, c.mine]), [['Ayesha', 'Well deserved!', true]]);
  assert.strictEqual(await store.comment(999, { name: 'x', body: 'y' }, you), null);
  // only the writer (or the admin) can remove
  assert.strictEqual((await store.removeComment(n.comments[0].id, me, false)).status, 'forbidden');
  assert.strictEqual((await store.removeComment(n.comments[0].id, you, false)).status, 'ok');
  assert.strictEqual((await store.get(a.id, me)).comments.length, 0);
  assert.strictEqual(await store.removeNote(b.id, me, false), 'forbidden');
  assert.strictEqual(await store.removeNote(b.id, me, true), 'ok');                // admin
  assert.strictEqual(await store.removeNote(b.id, you, false), 'notfound');
  assert.strictEqual(await store.react(b.id, '👏', me), null);                      // removed notes take no reactions
  await store.setEmailStatus(a.id, 'sent');
  assert.strictEqual((await store.get(a.id, me)).email_status, 'sent');
  assert.strictEqual((await store.emailOf(a.id)).to_email, 'bilal@niete.edu.pk');
});

test('thank-you wall: the email', async () => {
  const n = { id: 1, from_name: 'Hasnat <script>', to_name: 'Bilal', to_email: 'bilal@niete.edu.pk', body: 'You are a <b>star</b> & a hero', color: 'mint', font: 'hand', size: 'm',
    stickers: JSON.stringify([{ t: 'e', v: '🏆' }, { t: 's', v: 'BRAVO!' }]) };
  const m = KD.emailFor(n, 'https://example.org/#tab=kudos');
  assert.ok(m.subject.startsWith('Hasnat <script> left you'));
  assert.ok(!m.html.includes('<script>') && m.html.includes('Hasnat &lt;script&gt;'));
  assert.ok(m.html.includes('You are a &lt;b&gt;star&lt;/b&gt; &amp; a hero'));
  assert.ok(m.html.includes('#C8F1DA') && m.html.includes('🏆') && m.html.includes('BRAVO!'));
  assert.ok(m.text.includes('"You are a <b>star</b> & a hero"'));
  assert.strictEqual(KD.createMailer({ user: '', pass: '' }), null);   // email off until Railway has the app password
  const sent = [];
  const mailer = KD.createMailer({ user: 'wall@niete.edu.pk', pass: 'x', transport: { sendMail: async (o) => { sent.push(o); } } });
  await mailer.send(n, 'https://example.org/#tab=kudos');
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, 'bilal@niete.edu.pk');
  assert.deepStrictEqual(sent[0].from, { name: 'NIETE Thank-you Wall', address: 'wall@niete.edu.pk' });
});

test('thank-you wall: limiter', () => {
  const lim = KD.createLimiter(2, 3);
  assert.deepStrictEqual([lim('a'), lim('a'), lim('a'), lim('b'), lim('c')], [true, true, false, true, false]);
});
