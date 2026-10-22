/**
 * engine/deliver.ts - send a hand-over package to the developer tool and record what came back.
 *
 * The address and the secret come from the environment, never from the screen:
 *   SD_DEV_TOOL_URL    the receiving address, for example http://devserver:4330/receive
 *   SD_DEV_TOOL_TOKEN  the shared secret, sent as "Authorization: Bearer ..."
 * The package is the one the hand-over check already approved. The idempotency key goes in a header, so sending twice is harmless.
 * The hand-over record shows Sent, then Delivered (with the receipt), Rejected (with the reasons) or Failed (could not reach it).
 */
import * as Q from './query';
import * as handoff from './handoff';

const httpErr = (status, message, extra) => Object.assign(new Error(message), { status }, extra || {});
const settings = () => ({ url: String(process.env.SD_DEV_TOOL_URL || '').trim(), token: String(process.env.SD_DEV_TOOL_TOKEN || '').trim() });

function receiverInfo() {
  const { url } = settings();
  let host = ''; try { host = url ? new URL(url).host : ''; } catch (e) { host = 'an address that is not valid'; }
  return { configured: !!url, host };
}

const latestHandoff = (store, storyId) => store.out(storyId, 'handed_off_as').map((l) => store.get(l.target)).filter((h) => h && h.status !== 'Superseded').pop() || null;

async function deliver(store, storyId, actor, override?) {
  const cfg = override || settings();
  if (!cfg.url) throw httpErr(409, 'No developer tool address is set yet. Ask whoever runs this server to set SD_DEV_TOOL_URL and SD_DEV_TOOL_TOKEN. The package can still be downloaded.', { code: 'no_receiver' });
  const ctx = new Q.Ctx(store, { gate: 4 });
  let h = latestHandoff(store, storyId);
  let pkg = handoff.buildStoryPackage(ctx, storyId, { actor, version: h ? h.package_version : undefined });
  if (!h || h.content_hash !== pkg.package.content_hash) { const made = handoff.createHandoff(store, storyId, actor); h = made.handoff; pkg = made.package; }
  if (h.status === 'Delivered') return { handoff: h, receipt_id: h.receipt_id, already: true, note: 'This version was already delivered.' };

  store.update(h.id, { status: 'Sent', delivery_error: '' }, { actor, silent: true, strict: false });
  let res; let data: any = {};
  try {
    res = await fetch(cfg.url, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pkg.package.idempotency_key, ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify(pkg),
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    store.update(h.id, { status: 'Failed', delivery_error: `Could not reach the developer tool: ${e.message}` }, { actor, strict: false });
    throw httpErr(502, `Could not reach the developer tool (${e.message}). Nothing was lost; try again when it is running.`, { code: 'unreachable' });
  }
  let host = ''; try { host = new URL(cfg.url).host; } catch (e) { /* ignore */ }
  if (res.ok && (data.status === 'accepted' || data.status === 'duplicate')) {
    const done = store.update(h.id, { status: 'Delivered', receipt_id: data.receipt_id || '', delivered_to: host, delivered_on: store.today(), delivery_error: '' }, { actor, strict: false });
    return { handoff: done, receipt_id: data.receipt_id, status: data.status, warnings: data.warnings || [] };
  }
  if (res.status === 422 || data.status === 'rejected') {
    const why = (data.errors || ['The developer tool refused the package.']).join(' ');
    store.update(h.id, { status: 'Rejected', delivery_error: why }, { actor, strict: false });
    throw httpErr(422, `The developer tool refused the package: ${why}`, { code: 'rejected', reason: why });
  }
  const why = `The developer tool answered ${res.status}${data.error ? `: ${data.error}` : ''}.`;
  store.update(h.id, { status: 'Failed', delivery_error: why }, { actor, strict: false });
  throw httpErr(502, why, { code: 'failed' });
}

export { deliver, receiverInfo };
