const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Parse "25", "twenty five", "twenty-five", "hundred". Speech recognisers
 * usually emit digits, but not always.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/-/g, ' ');
  if (/^\d+$/.test(s)) return Number(s);
  if (s === 'hundred' || s === 'one hundred' || s === 'a hundred') return 100;
  const parts = s.split(/\s+/);
  if (parts.length === 1) {
    const w = parts[0]!;
    return UNITS[w] ?? TENS[w] ?? null;
  }
  if (parts.length === 2) {
    const t = TENS[parts[0]!];
    const u = UNITS[parts[1]!];
    if (t !== undefined && u !== undefined && u > 0 && u < 10) return t + u;
  }
  return null;
}

/** Regex fragment matching a number as digits or words. */
export const NUMBER_PATTERN =
  '(\\d{1,3}|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:a |one )?hundred)';
