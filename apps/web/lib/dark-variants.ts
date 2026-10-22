/**
 * Dark-mode convention for hard-coded Tailwind palette classes.
 *
 * The workspace has a light/dark/system theme (`dark` class on <html>, see
 * modules/workspace/utils/theme.ts) and Setu's dark palette lives in CSS
 * variables (app/globals.css). A literal palette class such as `bg-white` or
 * `text-gray-500` does not follow the theme, so on a dark page it paints a
 * white panel / unreadable grey. The rule is: every such class gets a `dark:`
 * counterpart ON THE SAME className string, appended next to it and leaving
 * the light class untouched:
 *
 *   bg-white  ->  bg-white dark:bg-[var(--surface)]
 *
 * This file is the single written-down mapping. It is plain data + a pure
 * function: nothing at runtime rewrites a class (Tailwind needs the full class
 * names in the source to generate them). It is used by
 * `lib/dark-variants.test.ts`, which fails when workspace code adds a light
 * class without a counterpart.
 *
 * Palette-family -> Setu status token:
 *   green / emerald / teal / lime    -> healthy
 *   amber / yellow / orange          -> warning
 *   red / rose                       -> critical
 *   blue / indigo / sky / cyan       -> info
 *   gray / slate / zinc / neutral / stone -> neutral surfaces + text scale
 *   violet / purple / pink / fuchsia -> no Setu token: translucent tint
 *
 * Solid accent fills (`bg-blue-600 text-white`, `bg-red-500`) and 500-level
 * text (`text-red-500`) already read on both themes and are deliberately not
 * governed here.
 */

type StatusKind = "healthy" | "warning" | "critical" | "info";
type Family = StatusKind | "neutral" | "other";

const FAMILY_OF: Record<string, Family> = {
  green: "healthy",
  emerald: "healthy",
  teal: "healthy",
  lime: "healthy",
  amber: "warning",
  yellow: "warning",
  orange: "warning",
  red: "critical",
  rose: "critical",
  blue: "info",
  indigo: "info",
  sky: "info",
  cyan: "info",
  gray: "neutral",
  slate: "neutral",
  zinc: "neutral",
  neutral: "neutral",
  stone: "neutral",
  violet: "other",
  purple: "other",
  pink: "other",
  fuchsia: "other",
};

const COLOR_NAMES = Object.keys(FAMILY_OF).join("|");

/** `[variants:]utility[/alpha]` — variants are `hover:`, `md:`, `group-hover:` … */
const TOKEN = new RegExp(
  `^((?:[a-z0-9\\[\\]&>_-]+:)*)(bg-white|text-black|(bg|text|border|divide|ring|placeholder)-(${COLOR_NAMES})-(\\d+))(/\\d+)?$`,
);

export type UtilityKind = "bg" | "text" | "border" | "divide" | "ring" | "placeholder";

export interface LightClass {
  /** Variant chain without the trailing colon-less part, e.g. `hover:` or ``. */
  prefix: string;
  kind: UtilityKind;
  /** The class to append, already carrying the same prefix: `dark:hover:bg-[...]`. */
  dark: string;
}

const UTILITY_KINDS: readonly string[] = ["bg", "text", "border", "divide", "ring", "placeholder"];
function isUtilityKind(value: string | undefined): value is UtilityKind {
  return value !== undefined && UTILITY_KINDS.includes(value);
}

const v = (name: string) => `var(--${name})`;

/**
 * The dark counterpart for a hard-coded light palette class, or null when the
 * class is not governed (not a palette class, already `dark:`, or a solid
 * accent that works on both themes).
 */
export function lightClass(token: string): LightClass | null {
  const m = TOKEN.exec(token);
  if (!m) return null;
  const prefix = m[1] ?? "";
  const kindRaw = m[3];
  const colorRaw = m[4];
  const shadeRaw = m[5];
  const alphaRaw = m[6];
  if (prefix.split(":").includes("dark")) return null;
  const alpha = alphaRaw ?? "";
  const hasAlpha = alpha !== "";

  const mk = (kind: UtilityKind, value: string, alphaOverride?: string): LightClass => ({
    prefix,
    kind,
    dark: `dark:${prefix}${kind}-[${value}]${alphaOverride ?? alpha}`,
  });
  const mkRaw = (kind: UtilityKind, rest: string): LightClass => ({
    prefix,
    kind,
    dark: `dark:${prefix}${kind}-${rest}${alpha}`,
  });

  if (/(^|:)bg-white(\/\d+)?$/.test(token)) return mk("bg", v("surface"));
  if (/(^|:)text-black(\/\d+)?$/.test(token)) return mk("text", v("text-heading"));

  if (!isUtilityKind(kindRaw) || colorRaw === undefined || shadeRaw === undefined) return null;
  const kind = kindRaw;
  const family = FAMILY_OF[colorRaw];
  if (!family) return null;
  const shade = Number(shadeRaw);
  const hovering = /(^|:)(hover|group-hover):/.test(prefix);

  if (family === "neutral") {
    switch (kind) {
      case "bg":
        if (shade <= 100) return mk("bg", v("surface-muted"));
        if (shade === 200) return mk("bg", v("divider")); // skeletons, thin rules, toggle tracks
        if (shade <= 600) return null; // mid greys (dots, solid chips) read on both themes
        return mk("bg", v("accent-solid"));
      case "text":
        if (shade >= 800) return mk("text", v("text-heading"));
        if (shade >= 600) return mk("text", v("text-secondary"));
        return mk("text", v("text-muted"));
      case "border":
        if (shade >= 400) return null; // the border of a solid mid-grey fill
        return mk("border", hovering ? v("text-muted") : v("divider"));
      case "divide":
      case "ring":
        return mk(kind, v("divider"));
      case "placeholder":
        return mk("placeholder", v("search-placeholder"));
      default: {
        const never: never = kind;
        return never;
      }
    }
  }

  const tint = family === "other" ? colorRaw : null;
  switch (kind) {
    case "bg":
      if (shade > 200) return null; // solid accent fill
      return tint ? mkRaw("bg", `${tint}-500/15`) : mk("bg", v(`status-${family}-bg`));
    case "text":
      if (shade < 600) return null; // 500 and lighter already read on dark
      return tint ? mkRaw("text", `${tint}-300`) : mk("text", v(`status-${family}-fg`));
    case "border":
      if (shade > 300) return null;
      return tint ? mkRaw("border", `${tint}-500/30`) : mk("border", v(`status-${family}-fg`), hasAlpha ? alpha : "/30");
    case "ring":
      if (!hasAlpha) return null; // a plain colour ring is a focus ring
      return tint ? mkRaw("ring", `${tint}-500/30`) : mk("ring", v(`status-${family}-fg`));
    case "divide":
    case "placeholder":
      return null;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

/**
 * Scan one className string. Returns the light classes that have no `dark:`
 * counterpart of the same utility kind and variant chain.
 */
export function missingDarkVariants(classString: string): string[] {
  const tokens = classString.split(/\s+/).filter(Boolean);
  const missing: string[] = [];
  for (const token of tokens) {
    const light = lightClass(token);
    if (!light) continue;
    const wanted = `dark:${light.prefix}${light.kind}-`;
    if (!tokens.some((t) => t.startsWith(wanted))) missing.push(token);
  }
  return missing;
}

/** Comments mention palette classes on purpose; they are not className strings. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const QUOTES = new Set(['"', "'", "`"]);

/**
 * Scan a whole source file. A class "belongs to" the string literal around it
 * (bounded by the nearest quote on each side), so a conditional like
 * `cond ? "bg-red-50 dark:bg-…" : "bg-gray-50"` is judged one branch at a time.
 * Returns each offending light class, with its 1-based line number.
 */
export function scanSourceForMissingDark(source: string): { token: string; line: number }[] {
  const text = withoutComments(source);
  const offenders: { token: string; line: number }[] = [];
  for (const match of text.matchAll(/[^\s"'`{}()<>=,;]+/g)) {
    const word = match[0];
    const light = lightClass(word);
    if (!light) continue;
    const start = match.index ?? 0;
    let left = start - 1;
    while (left >= 0 && !QUOTES.has(text.charAt(left))) left--;
    let right = start + word.length;
    while (right < text.length && !QUOTES.has(text.charAt(right))) right++;
    const segment = text.slice(left + 1, right);
    if (missingDarkVariants(segment).includes(word)) {
      offenders.push({ token: word, line: text.slice(0, start).split("\n").length });
    }
  }
  return offenders;
}
