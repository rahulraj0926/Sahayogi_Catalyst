/**
 * "Signed in on this browser", for the landing page only. Until real login exists this is a note the browser keeps after the person went through
 * the landing page's Sign in. It decides one thing: whether the base address (/) shows the landing page or the dashboard. It is not a check of who
 * the person is, and it does not touch how the app records who acts (the name in the top bar and the X-Actor header).
 * The app's own Sign out removes the saved name; the note is treated as gone then, and the landing page clears it.
 */
const KEY = 'sahayogi.signedIn';
const NAME = 'sd_actor';

/** True when this browser signed in through the landing page and has not signed out since. If the browser cannot store anything, the dashboard opens (nobody is shut out). */
export function hasSignedIn(): boolean {
  try { return !!localStorage.getItem(KEY) && localStorage.getItem(NAME) !== null; } catch { return true; }
}

export function markSignedIn() {
  try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
}

/** After a sign out the saved name is gone, so the note goes too. */
export function clearIfSignedOut() {
  try { if (localStorage.getItem(NAME) === null) localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
