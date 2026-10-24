/**
 * engine/selfcheck.ts - may an administrator check a value they typed in themselves?
 *
 * Normally a different person checks what someone typed in. The portfolio setting `admins_check_own` (default: on) lets an
 * administrator do it for values typed by hand (never for what the assistant or an agent found). The server decides who is an
 * administrator and gives this module the answer once per request; with nothing set, nobody may (so the engine alone keeps the strict rule).
 */
let decide: (actor: string) => boolean = () => false;
export const configure = (fn: ((actor: string) => boolean) | null) => { decide = fn || (() => false); };
/** True when `actor` may check a hand-typed value they created themselves. */
export const allowed = (actor: string | null | undefined): boolean => !!actor && decide(String(actor));
