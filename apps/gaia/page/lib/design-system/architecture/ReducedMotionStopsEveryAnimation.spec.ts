/**
 * Reduced motion stops every animation: each rule setting an animation other than `none` outside `no-preference` is matched, per selector, by a
 * `prefers-reduced-motion: reduce` rule on the same subject that wins the cascade, as a weaker reduce rule loses to the rule it means to stop.
 * The scan proves it found a floor of animated rules, and each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';

import { packageFilesMatching }                    from '../testing/PackageFiles.ts';
import { rulesOf, selectorLineOf, type StyleRule } from '../testing/StyleRuleReader.ts';

const SMALLEST_STYLESHEET_COUNT = 60;
const SMALLEST_ANIMATED_RULE_COUNT = 45;

/**
 * An ancestor compound a reduce selector may name though the animated selector does not, because the markup always puts it around
 * that subject; it is there to win the specificity. Exact both ways: no rule needs one now.
 */
const ANCESTORS_THE_MARKUP_GUARANTEES: readonly string[] = [];
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

const RULES = packageFilesMatching('**/*.css').flatMap(({ path, text }) => rulesOf(path, text));

describe('the scan itself', () => {
  test('it reads the stylesheets of the package, and finds a floor of animated rules outside the motion queries', () => {
    expect(RULES.filter(isAnimatedOutsideTheMotionQueries).length).toBeGreaterThanOrEqual(SMALLEST_ANIMATED_RULE_COUNT);
    const scannedStylesheets = new Set(RULES.map(({ stylesheet }) => stylesheet));
    for (const path of ['styles/tokens.css', 'styles/base.css', 'atoms/Button.css', 'organisms/Dialog.css']) {
      expect(scannedStylesheets).toContain(path);
    }
    expect(scannedStylesheets.size).toBeGreaterThanOrEqual(SMALLEST_STYLESHEET_COUNT);
  });

  test('specificity counts identifiers, classes and types, takes the most specific argument of :is and :not, and nothing of :where', () => {
    expect(specificityOf('.design-system-activity-row-mark')).toEqual([0, 1, 0]);
    expect(specificityOf('.design-system-activity-row[data-status="step"] .design-system-activity-row-mark')).toEqual([0, 3, 0]);
    expect(specificityOf(':root[data-freshness="live"] .design-system-flow-arrow[data-active] .design-system-flow-arrow-line')).toEqual([0, 5, 0]);
    expect(specificityOf('.design-system-dialog[data-motion]::backdrop')).toEqual([0, 2, 1]);
    expect(specificityOf('#planted > li:is(.first, .second[data-x]):where(.ignored)')).toEqual([1, 2, 1]);
  });
});

describe('the test, planted in memory', () => {
  const sentencesOfPlanted = (stylesheetText: string, guaranteedAncestors: readonly string[] = []): string[] =>
    unstoppedAnimationSentencesOf(rulesOf('planted.css', stylesheetText), guaranteedAncestors);

  test('a reduce rule of lower specificity than the animated rule is named', () => {
    expect(sentencesOfPlanted([
      '.design-system-planted-row-mark { width: 7px; }',
      '.design-system-planted-row[data-status="step"] .design-system-planted-row-mark { animation: design-system-pulse 1s infinite; }',
      '@media (prefers-reduced-motion: reduce) { .design-system-planted-row-mark { animation: none; } }',
    ].join('\n'))).toEqual([
      'planted.css: .design-system-planted-row[data-status="step"] .design-system-planted-row-mark sets an animation that no winning prefers-reduced-motion: reduce rule stops',
    ]);
  });

  test('an animation with no reduce rule, or one stopped on another element or pseudo-element, is named', () => {
    expect(sentencesOfPlanted([
      '.design-system-planted-spinner { animation: design-system-spin 1s infinite; }',
      '.design-system-planted-bar::after { animation-name: design-system-bar; }',
      '.design-system-planted-other { animation: design-system-pop 1s; }',
      '@media (prefers-reduced-motion: reduce) { .design-system-planted-bar, .design-system-planted-other[data-x] { animation: none; } }',
    ].join('\n'))).toEqual([
      'planted.css: .design-system-planted-spinner sets an animation that no winning prefers-reduced-motion: reduce rule stops',
      'planted.css: .design-system-planted-bar::after sets an animation that no winning prefers-reduced-motion: reduce rule stops',
      'planted.css: .design-system-planted-other sets an animation that no winning prefers-reduced-motion: reduce rule stops',
    ]);
  });

  test('a reduce rule of equal specificity wins only when it comes later', () => {
    expect(sentencesOfPlanted([
      '@media (prefers-reduced-motion: reduce) { .design-system-planted-early { animation: none; } }',
      '.design-system-planted-early { animation: design-system-pop 1s; }',
      '.design-system-planted-late { animation: design-system-pop 1s; }',
      '@media (prefers-reduced-motion: reduce) { .design-system-planted-late { animation: none; } }',
    ].join('\n'))).toEqual(['planted.css: .design-system-planted-early sets an animation that no winning prefers-reduced-motion: reduce rule stops']);
  });

  test('each selector of a list is held alone, and a no-preference animation, an animation: none and a still replacement pass', () => {
    expect(sentencesOfPlanted([
      '.design-system-planted-a, .design-system-planted-b { animation: design-system-pop 1s; }',
      '@media (prefers-reduced-motion: no-preference) { .design-system-planted-pulse { animation: design-system-pulse 1s infinite; } }',
      '.design-system-planted-still { animation: none; }',
      '.design-system-planted-changed { animation: design-system-changed 1s; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .design-system-planted-a { animation: none; }',
      '  .design-system-planted-changed { animation: design-system-changed-outline 1s; }',
      '}',
    ].join('\n'))).toEqual(['planted.css: .design-system-planted-b sets an animation that no winning prefers-reduced-motion: reduce rule stops']);
  });

  test('a reduce rule with a wider subject and the animated rule\'s ancestors wins', () => {
    expect(sentencesOfPlanted([
      '.design-system-planted-row[data-status="check"] .design-system-planted-row-mark { animation: design-system-spin 1s infinite; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .design-system-planted-row[data-status] .design-system-planted-row-mark[data-x],',
      '  .design-system-planted-row[data-status="check"] .design-system-planted-row-mark { animation: none; }',
      '}',
    ].join('\n'))).toEqual([]);
  });

  test('an [attribute] and an :is() argument reach the animated selector that asks them, and a scroll timeline is no motion', () => {
    expect(sentencesOfPlanted([
      '.design-system-planted-dialog[data-motion="in"] { animation: design-system-modal 1s both; }',
      '.design-system-planted-arrow-head { animation: design-system-fade 1s both; }',
      '.design-system-planted-waves { animation: design-system-waves linear both; animation-timeline: scroll(self inline); }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .design-system-planted-dialog[data-motion] { animation: none; }',
      '  :is(.design-system-planted-arrow-line, .design-system-planted-arrow-head) { animation: none; }',
      '}',
    ].join('\n'))).toEqual([]);
  });

  test('a reduce ancestor the animated selector lacks reaches only when the markup guarantees it, and an unused guarantee is named', () => {
    const plantedText = [
      '.design-system-planted-arrow[data-tone="forward"] .design-system-planted-arrow-line { animation: design-system-draw 1s forwards; }',
      '@media (prefers-reduced-motion: reduce) { .design-system-planted-arrows .design-system-planted-arrow[data-tone] .design-system-planted-arrow-line { animation: none; } }',
    ].join('\n');
    expect(sentencesOfPlanted(plantedText)).toEqual([
      'planted.css: .design-system-planted-arrow[data-tone="forward"] .design-system-planted-arrow-line sets an animation that no winning prefers-reduced-motion: reduce rule'
      + ' stops',
    ]);
    expect(sentencesOfPlanted(plantedText, ['.design-system-planted-arrows'])).toEqual([]);
    expect(unusedGuaranteeSentencesOf(rulesOf('planted.css', plantedText), ['.design-system-planted-arrows', '.design-system-planted-other']))
      .toEqual(['.design-system-planted-other is a guaranteed ancestor but no reduce rule names it']);
  });
});

describe('the stylesheets of the package', () => {
  test('every animation stops under prefers-reduced-motion: reduce', () => {
    expect(unstoppedAnimationSentencesOf(RULES, ANCESTORS_THE_MARKUP_GUARANTEES)).toEqual([]);
  });

  test('every guaranteed ancestor is still used', () => {
    expect(unusedGuaranteeSentencesOf(RULES, ANCESTORS_THE_MARKUP_GUARANTEES)).toEqual([]);
  });
});
