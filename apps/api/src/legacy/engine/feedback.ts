/**
 * engine/feedback.ts - the notes a person leaves with the "Something wrong here?" button.
 * One list per install, not one per product. Each note: { id, text, categories[], route, product, product_name, actor, at,
 * width, words, done, done_at, done_by }.
 */
const CATEGORIES = ['confusing', 'missing', 'broken', 'too much text'];
const httpErr = (status, message) => Object.assign(new Error(message), { status });

/** The notes live in the portfolio record (portfolio.reg.feedback), so they are saved with it: to PostgreSQL (table feedback_notes) in the server, to portfolio.json in the seed scripts. */
const notesOf = (portfolio) => { if (!Array.isArray(portfolio.reg.feedback)) portfolio.reg.feedback = []; return portfolio.reg.feedback; };
const nextNumber = (portfolio) => { const c = (portfolio.reg.counters = portfolio.reg.counters || {}); const used = notesOf(portfolio).reduce((m, n) => Math.max(m, Number(String(n.id).replace(/\D/g, '')) || 0), 0); c.feedback = Math.max(c.feedback || 0, used) + 1; return c.feedback; };

const clip = (v, n) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** Save one note. body: { text, categories?, route?, product?, product_name?, width?, words? } */
function add(portfolio, body, actor, now) {
  const text = String(body.text || '').trim();
  if (!text) throw httpErr(422, 'Write a few words about what is wrong.');
  if (text.length > 4000) throw httpErr(422, 'Please keep the note under 4,000 characters.');
  const cats = (Array.isArray(body.categories) ? body.categories : []).map((c) => String(c).toLowerCase()).filter((c, i, a) => CATEGORIES.includes(c) && a.indexOf(c) === i);
  const note = {
    id: `NOTE-${String(nextNumber(portfolio)).padStart(3, '0')}`, text, categories: cats, route: clip(body.route, 300), product: clip(body.product, 40), product_name: clip(body.product_name, 120),
    actor: clip(actor, 80), at: now || new Date().toISOString(), width: Math.max(0, Math.min(10000, Math.round(Number(body.width) || 0))), words: Math.max(0, Math.min(100000, Math.round(Number(body.words) || 0))),
    done: false, done_at: null, done_by: null,
  };
  notesOf(portfolio).push(note);
  portfolio.saveRegistry();
  return note;
}

function list(portfolio) { const notes = notesOf(portfolio); return { total: notes.length, open: notes.filter((n) => !n.done).length, notes: notes.slice().reverse(), categories: CATEGORIES }; }

function setDone(portfolio, id, done, actor, now) {
  const n = notesOf(portfolio).find((x) => x.id === id);
  if (!n) throw httpErr(404, 'No such note.');
  n.done = !!done; n.done_at = done ? (now || new Date().toISOString()) : null; n.done_by = done ? clip(actor, 80) : null;
  portfolio.saveRegistry();
  return n;
}

export { add, list, setDone, CATEGORIES };
