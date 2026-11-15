/**
 * A count as the page prints it: with its noun in the singular or the plural, or shortened to three significant digits, so every view
 * writes the same figure the same way.
 */
const ONE_THOUSAND = 1_000;
const ONE_MILLION = 1_000_000;
const SIGNIFICANT_DIGITS_OF_A_SHORT_COUNT = 3;

/** `1 agent runs`, `3 agents run`: the count, then the phrase that agrees with it. */
function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

function roundedToShortCountDigitsOf(value: number): number {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS_OF_A_SHORT_COUNT));
}

/** `840`, `3.1k`, `146k`, `1.24M`: three significant digits. Rounding picks the unit, so no count reads `1000k`. */
function shortCountTextOf(count: number): string {
  if (count < ONE_THOUSAND) return String(count);
  const thousands = roundedToShortCountDigitsOf(count / ONE_THOUSAND);
  if (thousands < ONE_THOUSAND) return `${thousands}k`;
  return `${roundedToShortCountDigitsOf(count / ONE_MILLION)}M`;
}

export const CountTextUtil = {
  countedPhrase,
  shortCountTextOf,
} as const;
