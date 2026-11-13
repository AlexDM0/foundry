/**
 * Reduced motion stops every animation in the Bridge: each rule that sets an `animation` (or `animation-name`) other than `none`
 * outside `@media (prefers-reduced-motion: no-preference)` is matched, for each selector of its list, by a rule inside
 * `@media (prefers-reduced-motion: reduce)` that sets an animation on the same subject and wins the cascade: a higher specificity,
 * or the same one later in the same stylesheet. A reduce rule of lower specificity loses to the rule it means to stop, which is
 * the case this guard was written for. The scan proves it found a floor of animated rules, and each form is planted in memory.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { rulesOf, selectorLineOf, type StyleRule } from './testing/StyleRuleReader.ts';

const STYLES_FOLDER = join(import.meta.dir, 'styles');
const SCANNED_STYLESHEETS = ['board.css', 'tokens.css'] as const;
const SMALLEST_ANIMATED_RULE_COUNT = 37;

/**
 * An ancestor compound a reduce selector may name though the animated selector does not, because the markup always puts it around
 * that subject; it is there to win the specificity. Exact both ways. `bridge/design-system/FlowArrows.tsx` draws every flow arrow
 * inside the `.bridge-flow-arrows` layer, as a group with a required `data-tone` around its line and its head.
 */
const ANCESTORS_THE_MARKUP_GUARANTEES: readonly string[] = ['.bridge-flow-arrows', '.bridge-flow-arrow[data-tone]'];
const ANIMATION_PROPERTIES: ReadonlySet<string> = new Set(['animation', 'animation-name']);
const REDUCE_CONDITION_PATTERN = /prefers-reduced-motion:\s*reduce/;
const NO_PREFERENCE_CONDITION_PATTERN = /prefers-reduced-motion:\s*no-preference/;
const FUNCTIONAL_PSEUDO_CLASSES_TAKING_THE_MOST_SPECIFIC_ARGUMENT: ReadonlySet<string> = new Set([':is', ':not', ':has', ':matches']);
const LEGACY_PSEUDO_ELEMENTS: ReadonlySet<string> = new Set([':before', ':after', ':first-line', ':first-letter']);
const COMBINATOR_CHARACTERS: ReadonlySet<string> = new Set([' ', '>', '+', '~']);

/** Identifiers, then classes, attributes and pseudo-classes, then types and pseudo-elements. */
type Specificity = readonly [number, number, number];

interface RuleSelector {
  readonly rule:        StyleRule;
  readonly sourceOrder: number;
  readonly selector:    string;
}

function setsAnimation(rule: StyleRule): boolean {
  return rule.declarations.some(({ property }) => ANIMATION_PROPERTIES.has(property));
}

function setsRunningAnimation(rule: StyleRule): boolean {
  return rule.declarations.some(({ property, value }) => ANIMATION_PROPERTIES.has(property) && value !== 'none');
}

function isInsideReduce(rule: StyleRule): boolean {
  return rule.conditions.some((condition) => REDUCE_CONDITION_PATTERN.test(condition));
}

function isInsideNoPreference(rule: StyleRule): boolean {
  return rule.conditions.some((condition) => NO_PREFERENCE_CONDITION_PATTERN.test(condition));
}

/** Splits at each top-level occurrence of a separator, leaving brackets, parentheses and strings whole. */
function splitAtTopLevel(text: string, isSeparator: (character: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let partStart = 0;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i] ?? '';
    if (quote !== '') {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === '\'') quote = character;
    else if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (depth === 0 && isSeparator(character)) {
      parts.push(text.slice(partStart, i));
      partStart = i + 1;
    }
  }
  parts.push(text.slice(partStart));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function selectorListOf(selector: string): string[] {
  return splitAtTopLevel(selectorLineOf(selector), (character) => character === ',');
}

/** The compound selectors of one complex selector, outermost first. */
function compoundsOf(complexSelector: string): string[] {
  return splitAtTopLevel(complexSelector, (character) => COMBINATOR_CHARACTERS.has(character));
}

function endOfBracketAt(text: string, openingPosition: number): number {
  const opening = text[openingPosition];
  const closing = opening === '(' ? ')' : ']';
  let depth = 0;
  for (let i = openingPosition; i < text.length; i += 1) {
    if (text[i] === opening) depth += 1;
    if (text[i] === closing) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

/** The simple selectors of one compound: `.class`, `#id`, `[attribute]`, `:pseudo-class(…)`, `::pseudo-element` or a type. */
function simpleSelectorsOf(compound: string): string[] {
  const simpleSelectors: string[] = [];
  let position = 0;
  while (position < compound.length) {
    let end = position + 1;
    if (compound[position] === '[') end = endOfBracketAt(compound, position);
    else {
      if (compound.startsWith('::', position)) end = position + 2;
      while (end < compound.length && !'.#[:('.includes(compound[end] ?? '')) end += 1;
      if (compound[end] === '(') end = endOfBracketAt(compound, end);
    }
    simpleSelectors.push(compound.slice(position, end));
    position = end;
  }
  return simpleSelectors;
}

function addSpecificities(first: Specificity, second: Specificity): Specificity {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

function compareSpecificities(first: Specificity, second: Specificity): number {
  return (first[0] - second[0]) || (first[1] - second[1]) || (first[2] - second[2]);
}

function specificityOfSimpleSelector(simpleSelector: string): Specificity {
  if (simpleSelector.startsWith('#')) return [1, 0, 0];
  if (simpleSelector.startsWith('.') || simpleSelector.startsWith('[')) return [0, 1, 0];
  if (simpleSelector.startsWith('::')) return [0, 0, 1];
  if (simpleSelector.startsWith(':')) {
    const name = simpleSelector.replace(/\(.*$/s, '').toLowerCase();
    if (name === ':where') return [0, 0, 0];
    if (LEGACY_PSEUDO_ELEMENTS.has(name)) return [0, 0, 1];
    if (FUNCTIONAL_PSEUDO_CLASSES_TAKING_THE_MOST_SPECIFIC_ARGUMENT.has(name)) {
      const argumentText = simpleSelector.slice(name.length + 1, -1);
      return selectorListOf(argumentText).map(specificityOf).reduce((most, next) => (compareSpecificities(next, most) > 0 ? next : most), [0, 0, 0]);
    }
    return [0, 1, 0];
  }
  return simpleSelector === '*' ? [0, 0, 0] : [0, 0, 1];
}

function specificityOf(complexSelector: string): Specificity {
  return compoundsOf(complexSelector).flatMap(simpleSelectorsOf).map(specificityOfSimpleSelector).reduce(addSpecificities, [0, 0, 0]);
}

function isPseudoElement(simpleSelector: string): boolean {
  return simpleSelector.startsWith('::') || LEGACY_PSEUDO_ELEMENTS.has(simpleSelector.toLowerCase());
}

/** A reduce simple selector the animated selector asks too: the same one, an `[attribute]` the animated one gives a value, or an `:is()` argument. */
function isAskedBy(reduceSimpleSelector: string, animatedSimpleSelectors: readonly string[]): boolean {
  if (animatedSimpleSelectors.includes(reduceSimpleSelector)) return true;
  const presenceMatch = /^\[([\w-]+)\]$/.exec(reduceSimpleSelector);
  if (presenceMatch !== null) return animatedSimpleSelectors.some((simpleSelector) => new RegExp(`^\\[${presenceMatch[1] ?? ''}[~|^$*]?=`).test(simpleSelector));
  if (reduceSimpleSelector.startsWith(':is(')) {
    return selectorListOf(reduceSimpleSelector.slice(':is('.length, -1)).some((argument) => isAskedBy(argument, animatedSimpleSelectors));
  }
  return false;
}

/**
 * The reduce selector reaches every element the animated one does when its subject asks no more than the animated subject, names
 * the same pseudo-element, and each of its ancestor compounds asks no more than the animated selector or is one the markup guarantees.
 */
function reaches(reduceSelector: string, animatedSelector: string, guaranteedAncestors: readonly string[]): boolean {
  const reduceCompounds = compoundsOf(reduceSelector);
  const animatedCompounds = compoundsOf(animatedSelector);
  const reduceSubject = simpleSelectorsOf(reduceCompounds.at(-1) ?? '');
  const animatedSubject = simpleSelectorsOf(animatedCompounds.at(-1) ?? '');
  const everyAnimatedSimpleSelector = animatedCompounds.flatMap(simpleSelectorsOf);
  const pseudoElementsMatch = reduceSubject.filter(isPseudoElement).join('') === animatedSubject.filter(isPseudoElement).join('');
  return pseudoElementsMatch
    && reduceSubject.every((simpleSelector) => isAskedBy(simpleSelector, animatedSubject))
    && reduceCompounds.slice(0, -1).every((compound) => guaranteedAncestors.includes(compound)
      || simpleSelectorsOf(compound).every((simpleSelector) => isAskedBy(simpleSelector, everyAnimatedSimpleSelector)));
}

function winsOver(reduceSelector: RuleSelector, animatedSelector: RuleSelector): boolean {
  const comparison = compareSpecificities(specificityOf(reduceSelector.selector), specificityOf(animatedSelector.selector));
  if (comparison !== 0) return comparison > 0;
  return reduceSelector.rule.stylesheet === animatedSelector.rule.stylesheet && reduceSelector.sourceOrder > animatedSelector.sourceOrder;
}

function selectorsOf(rules: readonly StyleRule[], ruleHolds: (rule: StyleRule) => boolean): RuleSelector[] {
  return rules.flatMap((rule, sourceOrder) => (ruleHolds(rule) ? selectorListOf(rule.selector).map((selector) => ({ rule, sourceOrder, selector })) : []));
}

/** A scroll or view timeline moves only as the reader scrolls, so it is no motion that reduced motion stops. */
function followsScroll(rule: StyleRule): boolean {
  return rule.declarations.some(({ property, value }) => property === 'animation-timeline' && /^(?:scroll|view)\(/.test(value));
}

function isAnimatedOutsideTheMotionQueries(rule: StyleRule): boolean {
  return setsRunningAnimation(rule) && !followsScroll(rule) && !isInsideReduce(rule) && !isInsideNoPreference(rule);
}

function unusedGuaranteeSentencesOf(rules: readonly StyleRule[], guaranteedAncestors: readonly string[]): string[] {
  const reduceCompounds = new Set(stoppingSelectorsOf(rules).flatMap(({ selector }) => compoundsOf(selector).slice(0, -1)));
  return guaranteedAncestors.filter((ancestor) => !reduceCompounds.has(ancestor)).map((ancestor) => `${ancestor} is a guaranteed ancestor but no reduce rule names it`);
}

function stoppingSelectorsOf(rules: readonly StyleRule[]): RuleSelector[] {
  return selectorsOf(rules, (rule) => isInsideReduce(rule) && setsAnimation(rule));
}

function unstoppedAnimationSentencesOf(rules: readonly StyleRule[], guaranteedAncestors: readonly string[] = []): string[] {
  const reduceSelectors = stoppingSelectorsOf(rules);
  return selectorsOf(rules, isAnimatedOutsideTheMotionQueries)
    .filter((animatedSelector) => !reduceSelectors.some((reduceSelector) =>
      reaches(reduceSelector.selector, animatedSelector.selector, guaranteedAncestors) && winsOver(reduceSelector, animatedSelector)))
    .map(({ rule, selector }) => `${rule.stylesheet}: ${selector} sets an animation that no winning prefers-reduced-motion: reduce rule stops`);
}

const RULES = SCANNED_STYLESHEETS.flatMap((stylesheet) => rulesOf(stylesheet, readFileSync(join(STYLES_FOLDER, stylesheet), 'utf8')));

describe('the scan itself', () => {
  test('it reads both stylesheets and finds a floor of animated rules outside the motion queries', () => {
    expect(RULES.filter(isAnimatedOutsideTheMotionQueries).length).toBeGreaterThanOrEqual(SMALLEST_ANIMATED_RULE_COUNT);
    expect(new Set(RULES.map(({ stylesheet }) => stylesheet))).toEqual(new Set(SCANNED_STYLESHEETS));
  });

  test('specificity counts identifiers, classes and types, takes the most specific argument of :is and :not, and nothing of :where', () => {
    expect(specificityOf('.bridge-activity-row-mark')).toEqual([0, 1, 0]);
    expect(specificityOf('.bridge-activity-row[data-status="step"] .bridge-activity-row-mark')).toEqual([0, 3, 0]);
    expect(specificityOf(':root[data-freshness="live"] .bridge-flow-arrow[data-active] .bridge-flow-arrow-line')).toEqual([0, 5, 0]);
    expect(specificityOf('.bridge-dialog[data-motion]::backdrop')).toEqual([0, 2, 1]);
    expect(specificityOf('#planted > li:is(.first, .second[data-x]):where(.ignored)')).toEqual([1, 2, 1]);
  });
});

describe('the guard, planted in memory', () => {
  const sentencesOfPlanted = (stylesheetText: string, guaranteedAncestors: readonly string[] = []): string[] =>
    unstoppedAnimationSentencesOf(rulesOf('planted.css', stylesheetText), guaranteedAncestors);

  test('a reduce rule of lower specificity than the animated rule is named', () => {
    expect(sentencesOfPlanted([
      '.bridge-planted-row-mark { width: 7px; }',
      '.bridge-planted-row[data-status="step"] .bridge-planted-row-mark { animation: bridge-pulse 1s infinite; }',
      '@media (prefers-reduced-motion: reduce) { .bridge-planted-row-mark { animation: none; } }',
    ].join('\n'))).toEqual([
      'planted.css: .bridge-planted-row[data-status="step"] .bridge-planted-row-mark sets an animation that no winning prefers-reduced-motion: reduce rule stops',
    ]);
  });

  test('an animation with no reduce rule, or one stopped on another element or pseudo-element, is named', () => {
    expect(sentencesOfPlanted([
      '.bridge-planted-spinner { animation: bridge-spin 1s infinite; }',
      '.bridge-planted-bar::after { animation-name: bridge-bar; }',
      '.bridge-planted-other { animation: bridge-pop 1s; }',
      '@media (prefers-reduced-motion: reduce) { .bridge-planted-bar, .bridge-planted-other[data-x] { animation: none; } }',
    ].join('\n'))).toEqual([
      'planted.css: .bridge-planted-spinner sets an animation that no winning prefers-reduced-motion: reduce rule stops',
      'planted.css: .bridge-planted-bar::after sets an animation that no winning prefers-reduced-motion: reduce rule stops',
      'planted.css: .bridge-planted-other sets an animation that no winning prefers-reduced-motion: reduce rule stops',
    ]);
  });

  test('a reduce rule of equal specificity wins only when it comes later', () => {
    expect(sentencesOfPlanted([
      '@media (prefers-reduced-motion: reduce) { .bridge-planted-early { animation: none; } }',
      '.bridge-planted-early { animation: bridge-pop 1s; }',
      '.bridge-planted-late { animation: bridge-pop 1s; }',
      '@media (prefers-reduced-motion: reduce) { .bridge-planted-late { animation: none; } }',
    ].join('\n'))).toEqual(['planted.css: .bridge-planted-early sets an animation that no winning prefers-reduced-motion: reduce rule stops']);
  });

  test('each selector of a list is held alone, and a no-preference animation, an animation: none and a still replacement pass', () => {
    expect(sentencesOfPlanted([
      '.bridge-planted-a, .bridge-planted-b { animation: bridge-pop 1s; }',
      '@media (prefers-reduced-motion: no-preference) { .bridge-planted-pulse { animation: bridge-pulse 1s infinite; } }',
      '.bridge-planted-still { animation: none; }',
      '.bridge-planted-changed { animation: bridge-changed 1s; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .bridge-planted-a { animation: none; }',
      '  .bridge-planted-changed { animation: bridge-changed-outline 1s; }',
      '}',
    ].join('\n'))).toEqual(['planted.css: .bridge-planted-b sets an animation that no winning prefers-reduced-motion: reduce rule stops']);
  });

  test('a reduce rule with a wider subject and the animated rule\'s ancestors wins', () => {
    expect(sentencesOfPlanted([
      '.bridge-planted-row[data-status="check"] .bridge-planted-row-mark { animation: bridge-spin 1s infinite; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .bridge-planted-row[data-status] .bridge-planted-row-mark[data-x],',
      '  .bridge-planted-row[data-status="check"] .bridge-planted-row-mark { animation: none; }',
      '}',
    ].join('\n'))).toEqual([]);
  });

  test('an [attribute] and an :is() argument reach the animated selector that asks them, and a scroll timeline is no motion', () => {
    expect(sentencesOfPlanted([
      '.bridge-planted-dialog[data-motion="in"] { animation: bridge-modal 1s both; }',
      '.bridge-planted-arrow-head { animation: bridge-fade 1s both; }',
      '.bridge-planted-waves { animation: bridge-waves linear both; animation-timeline: scroll(self inline); }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .bridge-planted-dialog[data-motion] { animation: none; }',
      '  :is(.bridge-planted-arrow-line, .bridge-planted-arrow-head) { animation: none; }',
      '}',
    ].join('\n'))).toEqual([]);
  });

  test('a reduce ancestor the animated selector lacks reaches only when the markup guarantees it, and an unused guarantee is named', () => {
    const plantedText = [
      '.bridge-planted-arrow[data-tone="forward"] .bridge-planted-arrow-line { animation: bridge-draw 1s forwards; }',
      '@media (prefers-reduced-motion: reduce) { .bridge-planted-arrows .bridge-planted-arrow[data-tone] .bridge-planted-arrow-line { animation: none; } }',
    ].join('\n');
    expect(sentencesOfPlanted(plantedText))
      .toEqual(['planted.css: .bridge-planted-arrow[data-tone="forward"] .bridge-planted-arrow-line sets an animation that no winning prefers-reduced-motion: reduce rule stops']);
    expect(sentencesOfPlanted(plantedText, ['.bridge-planted-arrows'])).toEqual([]);
    expect(unusedGuaranteeSentencesOf(rulesOf('planted.css', plantedText), ['.bridge-planted-arrows', '.bridge-planted-other']))
      .toEqual(['.bridge-planted-other is a guaranteed ancestor but no reduce rule names it']);
  });
});

describe('board.css and tokens.css', () => {
  test('every animation stops under prefers-reduced-motion: reduce', () => {
    expect(unstoppedAnimationSentencesOf(RULES, ANCESTORS_THE_MARKUP_GUARANTEES)).toEqual([]);
  });

  test('every guaranteed ancestor is still used', () => {
    expect(unusedGuaranteeSentencesOf(RULES, ANCESTORS_THE_MARKUP_GUARANTEES)).toEqual([]);
  });
});
