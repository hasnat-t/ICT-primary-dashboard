// Coach caseload password (owner request 2026-11-12): the Team tab 'Coach caseload' is for the owner and the coaches
// only, opened with COACH_CHECK_PASSWORD (Railway only, never in code). The page asks GET /api/coachcheck to check the
// password; wrong passwords are limited per visitor. (A Yes/No school check stored answers here for a few hours on
// 2026-11-12; the owner replaced it with the caseload view, so nothing is stored any more.)
const crypto = require('crypto');

// Constant-time password check, plus a block after `max` wrong tries per visitor in an hour.
function createGate(password, max = 10) {
  const fails = new Map();
  const key = (ip) => crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
  return (got, ip) => {
    if (!password) return 'off';
    const k = key(ip), now = Date.now();
    const list = (fails.get(k) || []).filter((t) => now - t < 3600000);
    if (list.length >= max) { fails.set(k, list); return 'blocked'; }
    const a = Buffer.from(String(got || '')), b = Buffer.from(String(password));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return 'ok';
    list.push(now); fails.set(k, list);
    if (fails.size > 5000) for (const [x, v] of fails) if (!v.some((t) => now - t < 3600000)) fails.delete(x);
    return 'wrong';
  };
}

module.exports = { createGate };
