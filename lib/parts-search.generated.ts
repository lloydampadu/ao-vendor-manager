// GENERATED from AbosseyOkai packages/parts/src/index.ts (sha256 8131d3f206b8). Do not edit.
// Regenerate: node packages/parts/scripts/export-for-vendor-app.mjs <path-to-ao-vendor-manager>

// Matching typed part names against the catalog.
//
// The request form used to be a plain <input list=...>, which only matches from
// the start of the string. Someone typing the word they actually say —
// "compressor" rather than "A/C Compressor" — saw no suggestions and typed the
// name freehand, so the same part landed in the database under a dozen
// spellings and nothing could be counted.
//
// Everything here suggests; nothing here rewrites. A silent correction to the
// wrong part means sourcing the wrong part.

/** Words people wrap around a part name that carry no matching signal. */
const STOPWORDS = new Set([
  "a", "an", "and", "at", "for", "from", "i", "in", "is", "it", "me", "my",
  "need", "of", "on", "please", "the", "to", "want", "with",
]);

/**
 * Lowercase, drop the catalog's "(see also ...)" cross-references, reduce
 * punctuation to spaces and collapse runs of whitespace.
 */
export function normalisePartName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenise(normalised: string): string[] {
  return normalised
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/**
 * How many single-character edits a word of this length may be off by. Short
 * words are left alone: "hood" and "hoop" are one edit apart and mean entirely
 * different jobs in the market.
 */
function editBudget(length: number): number {
  if (length < 5) return 0;
  if (length < 8) return 1;
  return 2;
}

/** Levenshtein distance, abandoned early once it exceeds `budget`. */
function withinEditBudget(a: string, b: string, budget: number): boolean {
  if (a === b) return true;
  if (budget === 0) return false;
  if (Math.abs(a.length - b.length) > budget) return false;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const distance = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
      current.push(distance);
      if (distance < rowBest) rowBest = distance;
    }
    if (rowBest > budget) return false;
    previous = current;
  }
  return previous[b.length] <= budget;
}

function fuzzyEqual(a: string, b: string): boolean {
  return withinEditBudget(a, b, editBudget(Math.max(a.length, b.length)));
}

// Rule scores. The gaps matter more than the numbers: a clean hit must always
// outrank a fuzzy one, so `bestMatch` can report honest confidence.
const EXACT = 100;
const COMPACT_PREFIX = 88;
const WORD_PREFIX = 78;
const SUBSTRING = 68;
const ALL_TOKENS = 60;
const FUZZY_TOKEN = 45;

/** Anything below this is noise, not a suggestion. */
const MIN_SCORE = FUZZY_TOKEN;

type PreparedQuery = { normalised: string; compact: string; tokens: string[] };

function prepareQuery(normalised: string): PreparedQuery | null {
  if (!normalised) return null;
  return { normalised, compact: normalised.replace(/ /g, ""), tokens: tokenise(normalised) };
}

/** The one scorer: matchParts, bestMatch and searchParts all rank through it. `candidateNormalised` is already normalised. */
function scoreText(candidateNormalised: string, q: PreparedQuery): number {
  const candidateCompact = candidateNormalised.replace(/ /g, "");
  const candidateWords = candidateNormalised.split(" ").filter(Boolean);

  if (candidateNormalised === q.normalised || candidateCompact === q.compact) return EXACT;
  if (candidateCompact.startsWith(q.compact)) return COMPACT_PREFIX;
  if (candidateWords.some((word) => word.startsWith(q.compact))) return WORD_PREFIX;
  if (candidateCompact.includes(q.compact)) return SUBSTRING;

  const matchesToken = (token: string) =>
    candidateWords.some((word) => word.startsWith(token) || fuzzyEqual(word, token)) ||
    candidateCompact.includes(token);

  if (q.tokens.length > 0 && q.tokens.every(matchesToken)) return ALL_TOKENS;

  // Last resort: the query is a part name with a car wrapped around it
  // ("alternator for corolla 2008"). One token landing squarely on a catalog
  // word is enough to suggest — never enough to substitute.
  if (q.tokens.some((token) => candidateWords.some((word) => fuzzyEqual(word, token)))) {
    return FUZZY_TOKEN;
  }

  return 0;
}

type ScoredCandidate = { candidate: string; score: number };

/**
 * Every plausible candidate, best first. Both public functions rank through
 * here so a suggestion and the top of the dropdown can never disagree.
 */
function rankCandidates(query: string, candidates: string[]): ScoredCandidate[] {
  const q = prepareQuery(normalisePartName(query));
  if (!q) return [];
  return candidates
    .map((candidate) => ({ candidate, score: scoreText(normalisePartName(candidate), q) }))
    .filter((scored) => scored.score >= MIN_SCORE)
    // Same score: prefer the shorter name, which is the more general part.
    .sort((a, b) => b.score - a.score || a.candidate.length - b.candidate.length);
}

/**
 * Catalog names worth suggesting for what the user has typed, best first.
 * Empty when nothing plausibly matches — an empty list is a better answer than
 * a wrong one.
 */
export function matchParts(query: string, candidates: string[], limit = 8): string[] {
  return rankCandidates(query, candidates)
    .slice(0, limit)
    .map((scored) => scored.candidate);
}

export type PartSuggestion = {
  value: string;
  /** 0–1. Clean hits score high; a repaired misspelling scores low. */
  confidence: number;
  /**
   * True when other candidates matched just as well — "clutch" sits equally
   * close to Clutch Disc, Clutch Fork and Clutch Cable. The suggestion is still
   * the best guess, but it is a guess, and the admin UI should say so.
   */
  ambiguous: boolean;
};

/**
 * The single catalog name a free-typed entry most likely meant, for the admin
 * cleanup list. Null when the entry already *is* a catalog name (nothing to
 * fix) or when nothing plausibly matches (a genuinely new part).
 */
export function bestMatch(query: string, candidates: string[]): PartSuggestion | null {
  const trimmed = query.trim().toLowerCase();
  // Already written exactly as the catalog has it — nothing to clean up. A
  // name that merely *means* the same ("ac compressor") still gets suggested.
  if (candidates.some((candidate) => candidate.toLowerCase() === trimmed)) return null;

  const ranked = rankCandidates(query, candidates);
  const best = ranked[0];
  if (!best) return null;
  return {
    value: best.candidate,
    confidence: best.score / EXACT,
    ambiguous: ranked.length > 1 && ranked[1].score === best.score,
  };
}

// ─── The parts list (spec 2b, sections 3 and 4) ──────────────────────────────
// One search for customers, vendors, the control room and routing. It returns parts,
// never a rewrite of what was typed.

export const PART_SIDES = ["NONE", "LEFT_RIGHT"] as const;
export const PART_POSITIONS = ["NONE", "FRONT_REAR"] as const;
export const DEPENDS_ON = ["ENGINE", "GEARBOX", "DRIVE", "BODY", "FUEL", "MARKET_SPEC"] as const;
export const ALIAS_KINDS = ["OLD_NAME", "MARKET", "TWI", "PIDGIN", "SPELLING", "PART_NUMBER_HINT"] as const;
export type PartSides = (typeof PART_SIDES)[number];
export type PartPositions = (typeof PART_POSITIONS)[number];
export type DependsOn = (typeof DEPENDS_ON)[number];
export type AliasKind = (typeof ALIAS_KINDS)[number];
export type ListMode = "LEGACY" | "LIVE";

export type CatalogGroup = { id: string; slug: string; name: string; sortOrder: number; vendorCategory: string };
export type CatalogOption = { key: string; label: string; values: string[] };
export type CatalogAlias = { text: string; kind: AliasKind };
export type CatalogPart = {
  id: string; slug: string; name: string; sides: PartSides; positions: PartPositions; dependsOn: DependsOn[];
  groupIds: string[]; options: CatalogOption[]; aliases: CatalogAlias[]; description: string | null; icon: string | null;
};
export type PartsCatalog = { list: ListMode; version: string; groups: CatalogGroup[]; parts: CatalogPart[] };
export type PartHit = { part: CatalogPart; matched: string; viaAlias: AliasKind | null; score: number; confidence: number };
export type PositionType = "none" | "front_rear" | "lh_rh" | "corner";

/** Letters with no accent form, and the open vowels of Twi and Ga, mapped on purpose. */
const LETTER_FOLDS: Record<string, string> = {
  "ɛ": "e", "ɔ": "o", "ß": "ss", "ø": "o", "đ": "d", "ł": "l", "æ": "ae", "œ": "oe",
};

/** Accented letters for runtimes without `normalize` (Hermes may lack it): same result as NFD plus mark-stripping. */
const ACCENT_FOLDS: Record<string, string> = Object.fromEntries(
  ["aàáâãäåāăą", "cçćčĉċ", "dď", "eèéêëēĕėęě", "gĝğġģ", "hĥ", "iìíîïĩīĭįı", "jĵ", "kķ", "lĺļľ", "nñńņň",
    "oòóôõöōŏő", "rŕŗř", "sśŝşš", "tţť", "uùúûüũūŭůűų", "wŵ", "yýÿŷ", "zźżž"]
    .flatMap((row) => [...row.slice(1)].map((ch) => [ch, row[0]])),
);

/**
 * Twi and Ga spellings use open e and open o; people type them with or without. Accents fold too.
 * Lower-cases first, so the maps only need lower-case letters.
 */
function fold(raw: string): string {
  const lower = raw.toLowerCase();
  const decomposed = typeof lower.normalize === "function" ? lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : lower;
  return decomposed.replace(/[^\x00-\x7f]/g, (ch) => LETTER_FOLDS[ch] ?? ACCENT_FOLDS[ch] ?? ch);
}

const normaliseSearchText = (raw: string) => normalisePartName(fold(raw));

/** The unique key of a name or alias: folded, letters and digits only. "A/C" and "AC" share one key. */
export function partKey(raw: string): string {
  return normaliseSearchText(raw).replace(/ /g, "");
}

/** How many query words land on a word of this name. Breaks ties between equally scored parts. */
function tokenHits(textNormalised: string, tokens: string[]): number {
  const words = textNormalised.split(" ").filter(Boolean);
  return tokens.filter((t) => words.some((w) => w.startsWith(t) || fuzzyEqual(w, t))).length;
}

/** Parts that match what was typed, best first. Each part appears once, with the name that matched best. */
export function searchParts(query: string, catalog: { parts: CatalogPart[] }, limit = 12): PartHit[] {
  const q = prepareQuery(normaliseSearchText(query));
  if (!q) return [];
  type Best = { score: number; hits: number; matched: string; via: AliasKind | null };
  const ranked: Array<{ part: CatalogPart; best: Best }> = [];
  for (const part of catalog.parts) {
    let best: Best | null = null;
    const consider = (text: string, via: AliasKind | null) => {
      const normalised = normaliseSearchText(text);
      const score = scoreText(normalised, q);
      if (score < MIN_SCORE) return;
      const hits = tokenHits(normalised, q.tokens);
      // Higher score wins; then more query words hit. The part's own name is tried first, so it keeps a tie.
      if (!best || score > best.score || (score === best.score && hits > best.hits)) {
        best = { score, hits, matched: text, via };
      }
    };
    consider(part.name, null);
    for (const a of part.aliases) consider(a.text, a.kind);
    if (best) ranked.push({ part, best });
  }
  return ranked
    .sort((a, b) =>
      b.best.score - a.best.score
      || b.best.hits - a.best.hits
      || Number(a.best.via !== null) - Number(b.best.via !== null)
      || a.part.name.length - b.part.name.length
      || a.part.name.localeCompare(b.part.name))
    .slice(0, limit)
    .map(({ part, best }) => ({ part, matched: best.matched, viaAlias: best.via, score: best.score, confidence: best.score / EXACT }));
}

/**
 * The part whose name or alias has exactly this key, or null. Never fuzzy: routing and approvals rely on it.
 * Null too when two parts share the name: picking one would source the wrong part, so the caller must ask.
 */
export function findPartExact(text: string, catalog: { parts: CatalogPart[] }): CatalogPart | null {
  const key = partKey(text);
  if (!key) return null;
  const owners = catalog.parts.filter((p) => partKey(p.name) === key || p.aliases.some((a) => partKey(a.text) === key));
  return owners.length === 1 ? owners[0] : null;
}

/** A hit good enough to act on without asking (routing): every query word matched, or better. */
export function isConfidentHit(hit: PartHit): boolean {
  return hit.score >= ALL_TOKENS;
}

/** The position chips the pickers already show (web `POSITION_OPTIONS`), from the part's sides and positions. */
export function positionTypeFor(p: { sides: PartSides; positions: PartPositions }): PositionType {
  if (p.sides === "LEFT_RIGHT" && p.positions === "FRONT_REAR") return "corner";
  if (p.sides === "LEFT_RIGHT") return "lh_rh";
  if (p.positions === "FRONT_REAR") return "front_rear";
  return "none";
}
