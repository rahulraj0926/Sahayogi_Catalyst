/**
 * engine/people.ts - the people who can act on a product. They come from the product's OWN Stakeholder records, plus the
 * person who is signed in (the X-Actor of the request). There is no built-in cast of demo names.
 */
const httpErr = (status, message) => Object.assign(new Error(message), { status });

const CATEGORIES = ['Sponsor', 'Delivery', 'Customer', 'End-user', 'Partner', 'Regulator/Legal', 'Security/Privacy', 'Operations', 'Finance', 'Commercial'];
/** Plain role words to show beside a name. */
const ROLE_WORD = { Sponsor: 'Sponsor', Delivery: 'Delivery', Customer: 'Customer', 'End-user': 'Person who uses it', Partner: 'Partner', 'Regulator/Legal': 'Legal or regulator', 'Security/Privacy': 'Security and privacy', Operations: 'Operations', Finance: 'Finance', Commercial: 'Sales and marketing' };

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * [{name, role, category, is_sponsor, id|null, signed_in, is_me, email, phone}]
 * "me" is the person who owns this installation: a FIXED concept, always first, never a stakeholder unless they were added as one.
 * The person acting now (signedIn) is always in the list too. Then the product's stakeholders by name.
 */
function list(store, signedIn, meName) {
  const out = [];
  const seen = new Set();
  const push = (p) => { const k = p.name.toLowerCase(); if (!p.name || seen.has(k)) return; seen.add(k); out.push(p); };
  const acting = clean(signedIn);
  const me = clean(meName) || acting;
  const stk = store ? store.list('Stakeholder', (s) => s.status !== 'Left').sort((a, b) => a.title.localeCompare(b.title)) : [];
  const find = (n) => stk.find((s) => s.title.toLowerCase() === n.toLowerCase());
  const mk = (n, isMe) => { const mine = find(n); return { name: mine ? mine.title : n, role: mine ? (mine.role_title || ROLE_WORD[mine.category] || '') : (isMe ? 'You' : ''), category: mine ? mine.category : null, is_sponsor: !!(mine && mine.is_sponsor), id: mine ? mine.id : null, signed_in: n.toLowerCase() === acting.toLowerCase(), is_me: !!isMe, email: mine ? mine.email || '' : '', phone: mine ? mine.phone || '' : '' }; };
  if (me) push(mk(me, true));
  if (acting) push(mk(acting, false));
  for (const s of stk) push({ name: s.title, role: s.role_title || ROLE_WORD[s.category] || '', category: s.category, is_sponsor: !!s.is_sponsor, id: s.id, signed_in: s.title.toLowerCase() === acting.toLowerCase(), is_me: false, email: s.email || '', phone: s.phone || '' });
  return out;
}
const names = (store, signedIn, me) => list(store, signedIn, me).map((p) => p.name);

/** Add a person to the product (creates a Stakeholder record). */
function add(store, body, actor) {
  if (!store) throw httpErr(409, 'Create a product first; people belong to a product.');
  const name = clean(body.name);
  if (!name) throw httpErr(422, 'Write the person\'s name.');
  if (store.list('Stakeholder', (s) => s.title.toLowerCase() === name.toLowerCase() && s.status !== 'Left').length) throw httpErr(409, `${name} is already on the list.`);
  const category = CATEGORIES.includes(body.category) ? body.category : 'Delivery';
  const email = clean(body.email); const phone = clean(body.phone);
  const st = store.create('Stakeholder', { title: name, category, role_title: clean(body.role_title) || ROLE_WORD[category], ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(body.is_sponsor ? { is_sponsor: true } : {}) }, { actor, origin: 'human' });
  store.audit('people.add', st.id, `${actor} added ${name} to the people on this product`, { actor });
  return { person: { name: st.title, role: st.role_title, category: st.category, is_sponsor: !!st.is_sponsor, id: st.id, email: st.email || '', phone: st.phone || '' }, people: list(store, actor, body.__me) };
}

export { list, names, add, CATEGORIES, ROLE_WORD };
