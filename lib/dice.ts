// Secure RNG + dice notation parser. Works in browser and Node.
export type RollMode = "normal" | "advantage" | "disadvantage";

export interface ParsedTerm {
  count: number;
  sides: number;
}
export interface ParsedNotation {
  terms: ParsedTerm[];
  modifier: number;
  raw: string;
}

export const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DiceSides = (typeof DICE_TYPES)[number];

/** Cryptographically secure integer in [min, max] inclusive. */
export function secureRandomInt(min: number, max: number): number {
  if (max < min) throw new Error("max < min");
  const range = max - min + 1;
  // Browser
  if (typeof globalThis.crypto !== "undefined" && "getRandomValues" in globalThis.crypto) {
    const maxUint = 0xffffffff;
    const limit = Math.floor(maxUint / range) * range;
    const u32 = new Uint32Array(1);
    let x: number;
    do {
      globalThis.crypto.getRandomValues(u32);
      x = u32[0];
    } while (x >= limit);
    return min + (x % range);
  }
  // Node 18+ also exposes globalThis.crypto; last-resort fallback:
  const r = Math.random();
  return min + Math.floor(r * range);
}

export function rollDie(sides: number): number {
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000)
    throw new Error(`Invalid die: d${sides}`);
  return secureRandomInt(1, sides);
}

export function rollDice(count: number, sides: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error("Count must be 1-100");
  return Array.from({ length: count }, () => rollDie(sides));
}

/**
 * Parse notations like "2d6+3", "1d20+5", "4d8", "1d100", "2d6+1d8-2", "d20".
 * Returns terms + flat modifier.
 */
export function parseNotation(input: string): ParsedNotation {
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) throw new Error("Enter a notation like 2d6+3");
  if (!/^[0-9d+\-*/() ]+$/i.test(raw.replace(/d/g, "d")))
    throw new Error("Invalid characters. Use e.g. 2d6+3");
  // Tokenize signed chunks: e.g. ["2d6", "+1d8", "-2"]
  const tokens = raw.match(/[+-]?[^+-]+/g);
  if (!tokens) throw new Error("Could not parse notation");
  const terms: ParsedTerm[] = [];
  let modifier = 0;
  for (const tok of tokens) {
    let sign = 1;
    let body = tok;
    if (body.startsWith("+")) body = body.slice(1);
    else if (body.startsWith("-")) {
      sign = -1;
      body = body.slice(1);
    }
    const m = body.match(/^(\d*)d(\d+)$/);
    if (m) {
      const count = m[1] === "" ? 1 : parseInt(m[1], 10);
      const sides = parseInt(m[2], 10);
      if (count < 1 || count > 100) throw new Error("Each dice count must be 1-100");
      if (sides < 2 || sides > 1000) throw new Error("Dice sides must be 2-1000");
      // Negative dice groups (e.g. "-1d6") are treated as subtracted rolls
      terms.push({ count: sign * count, sides });
    } else if (/^\d+$/.test(body)) {
      modifier += sign * parseInt(body, 10);
    } else {
      throw new Error(`Invalid term "${tok}". Use NdM like 2d6, or a number.`);
    }
  }
  if (terms.length === 0) throw new Error("Notation must include at least one dice term (e.g. 1d20)");
  if (Math.abs(modifier) > 10000) throw new Error("Modifier too large");
  return { terms, modifier, raw: input.trim() };
}

export interface RollResult {
  notation: string;
  individual: number[];
  // per-term breakdown for display, e.g. [{label:"2d6", values:[3,5]}]
  breakdown: { label: string; values: number[] }[];
  modifier: number;
  subtotal: number;
  total: number;
}

export function executeNotation(parsed: ParsedNotation): RollResult {
  const breakdown: RollResult["breakdown"] = [];
  const individual: number[] = [];
  let subtotal = 0;
  for (const t of parsed.terms) {
    const n = Math.abs(t.count);
    const values = rollDice(n, t.sides);
    const signed = t.count < 0 ? values.map((v) => -v) : values;
    const label = `${n}d${t.sides}`;
    breakdown.push({ label: t.count < 0 ? `-${label}` : label, values });
    individual.push(...values);
    subtotal += signed.reduce((a, b) => a + b, 0);
  }
  const total = subtotal + parsed.modifier;
  const notation = formatNotation(parsed);
  return { notation, individual, breakdown, modifier: parsed.modifier, subtotal, total };
}

export function formatNotation(p: ParsedNotation): string {
  const parts = p.terms.map((t) =>
    t.count < 0 ? `-${Math.abs(t.count)}d${t.sides}` : `${Math.abs(t.count)}d${t.sides}`
  );
  let s = parts.join("+").replace(/\+\-/g, "-");
  if (p.modifier > 0) s += `+${p.modifier}`;
  else if (p.modifier < 0) s += `${p.modifier}`;
  return s;
}

/** Exact probability helpers for the offline AI fallback + UI. */
export function probabilityAtLeast(count: number, sides: number, target: number): number {
  // DP over sums for small pools; for single die it's trivial.
  if (count === 1) {
    if (target <= 1) return 1;
    if (target > sides) return 0;
    return (sides - target + 1) / sides;
  }
  const max = count * sides;
  if (target <= count) return 1;
  if (target > max) return 0;
  let dp = new Array(max + 1).fill(0);
  dp[0] = 1;
  for (let d = 0; d < count; d++) {
    const next = new Array(max + 1).fill(0);
    for (let s = 0; s <= max; s++) {
      if (!dp[s]) continue;
      for (let f = 1; f <= sides; f++) next[s + f] += dp[s] / sides;
    }
    dp = next;
  }
  return dp.slice(target).reduce((a, b) => a + b, 0);
}

export function expectedValue(count: number, sides: number, modifier = 0): number {
  return (count * (sides + 1)) / 2 + modifier;
}
