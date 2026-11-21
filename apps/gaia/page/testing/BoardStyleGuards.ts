/**
 * Test-only: the style guards of the board's stylesheets under `page/styles/board/`. It reads a stylesheet's rules and token blocks and
 * words what breaks a guard: an animation that reduced motion does not stop, a hover or press that moves something, a token a theme
 * leaves unset. `StyleContract.spec.ts` plants a case for each guard and runs them on the board's sheets.
 */

export interface StylesheetDeclaration {
  readonly property: string;
  readonly value:    string;
}

export interface StylesheetRule {
  readonly stylesheet:   string;
  readonly selector:     string;
  /** The preludes of the `@media` and `@container` blocks around the rule, outermost first. */
  readonly conditions:   readonly string[];
  readonly declarations: readonly StylesheetDeclaration[];
}

/** A movement a hover or press may make because it moves nothing else, held exact both ways. */
export interface AllowedMovement {
  readonly selector: string;
  readonly property: string;
}

export interface TokenBlock {
  readonly condition: string;
  readonly selector:  string;
  readonly values:    ReadonlyMap<string, string>;
}

export const LIGHT_THEME_SELECTOR = ':root';
export const DARK_THEME_SELECTOR = ':root[data-theme="dark"]';

const ANIMATION_PROPERTIES: ReadonlySet<string> = new Set(['animation', 'animation-name']);
const REDUCE_CONDITION_PATTERN = /prefers-reduced-motion:\s*reduce/;
const NO_PREFERENCE_CONDITION_PATTERN = /prefers-reduced-motion:\s*no-preference/;
const FUNCTIONAL_PSEUDO_CLASSES_TAKING_THE_MOST_SPECIFIC_ARGUMENT: ReadonlySet<string> = new Set([':is', ':not', ':has', ':matches']);
const LEGACY_PSEUDO_ELEMENTS: ReadonlySet<string> = new Set([':before', ':after', ':first-line', ':first-letter']);
const COMBINATOR_CHARACTERS: ReadonlySet<string> = new Set([' ', '>', '+', '~']);
const POINTER_STATE_PATTERN = /:(?:hover|active)\b/;

const PROPERTIES_A_POINTER_STATE_MAY_SET: ReadonlySet<string> = new Set([
  'color',
  'background-color',
  'background',
  'border-color',
  'outline',
  'outline-color',
  'outline-offset',
  'box-shadow',
  'text-decoration',
  'text-decoration-color',
  'text-underline-offset',
  'filter',
  'opacity',
  'visibility',
  'cursor',
]);

/** Values a theme does not change: a size, a radius, a time or no colour at all. */
const THEMELESS_VALUE_PATTERN = /^(?:-?[\d.]+(?:px|ms|s|em)?|transparent)$/;
const LITERAL_COLOUR_PATTERN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|#[0-9a-f]{3,8}\b/i;

/** Identifiers, then classes, attributes and pseudo-classes, then types and pseudo-elements. */
type Specificity = readonly [number, number, number];

interface RuleSelector {
  readonly rule:        StylesheetRule;
  readonly sourceOrder: number;
  readonly selector:    string;
}

function endOfStringAt(text: string, openingQuotePosition: number): number {
  const quote = text[openingQuotePosition];
  let position = openingQuotePosition + 1;
  while (position < text.length && text[position] !== quote) position += text[position] === '\\' ? 2 : 1;
  return position + 1;
}

function matchingBraceOf(text: string, openingBracePosition: number): number {
  let depth = 0;
  let position = openingBracePosition;
  while (position < text.length) {
    const character = text[position];
    if (character === '"' || character === '\'') {
      position = endOfStringAt(text, position);
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return position;
    }
    position += 1;
  }
  return text.length;
}

/** The declarations written directly in a block, leaving out those of any rule nested in it. */
function declarationsBetween(text: string, start: number, end: number): StylesheetDeclaration[] {
  const declarations: StylesheetDeclaration[] = [];
  let segmentStart = start;
  let position = start;
  const takeSegment = (segmentEnd: number): void => {
    const segment = text.slice(segmentStart, segmentEnd);
    const colonPosition = segment.indexOf(':');
    if (colonPosition > 0) declarations.push({ property: segment.slice(0, colonPosition).trim().toLowerCase(), value: segment.slice(colonPosition + 1).trim() });
  };
  while (position < end) {
    const character = text[position];
    if (character === '"' || character === '\'') {
      position = endOfStringAt(text, position);
      continue;
    }
    if (character === '{') {
      position = matchingBraceOf(text, position) + 1;
      segmentStart = position;
      continue;
    }
    if (character === ';') {
      takeSegment(position);
      segmentStart = position + 1;
    }
    position += 1;
  }
  takeSegment(end);
  return declarations;
}

/** Walks the blocks between `start` and `end`: a grouping at-rule is entered, a `@keyframes` skipped, a style rule kept with its nesting. */
function collectRules(text: string, start: number, end: number, enclosingSelector: string, conditions: readonly string[], stylesheet: string, rules: StylesheetRule[]): void {
  let preludeStart = start;
  let position = start;
  while (position < end) {
    const character = text[position];
    if (character === '"' || character === '\'') {
      position = endOfStringAt(text, position);
      continue;
    }
    if (character === ';' || character === '}') preludeStart = position + 1;
    if (character === '{') {
      const prelude = text.slice(preludeStart, position).trim();
      const closingBracePosition = matchingBraceOf(text, position);
      if (prelude.startsWith('@')) {
        if (!/^@(?:-webkit-)?keyframes\b/.test(prelude)) collectRules(text, position + 1, closingBracePosition, enclosingSelector, [...conditions, prelude], stylesheet, rules);
      } else {
        const selector = enclosingSelector === '' ? prelude : `${enclosingSelector} ${prelude}`;
        const declarations = declarationsBetween(text, position + 1, closingBracePosition);
        rules.push({
          stylesheet, selector, conditions, declarations
        });
        collectRules(text, position + 1, closingBracePosition, selector, conditions, stylesheet, rules);
      }
      position = closingBracePosition + 1;
      preludeStart = position;
      continue;
    }
    position += 1;
  }
}

/** A stylesheet's style rules in source order: each with its full selector, the `@media` and `@container` preludes around it, and its own declarations. */
export function stylesheetRulesOf(stylesheet: string, stylesheetText: string): StylesheetRule[] {
  const withoutComments = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: StylesheetRule[] = [];
  collectRules(withoutComments, 0, withoutComments.length, '', [], stylesheet, rules);
  return rules;
}

/** A selector on one line, its whitespace runs folded to one space. */
function selectorLineOf(selector: string): string {
  return selector.replace(/\s+/g, ' ');
}

function setsAnimation(rule: StylesheetRule): boolean {
  return rule.declarations.some(({ property }) => ANIMATION_PROPERTIES.has(property));
}

function setsRunningAnimation(rule: StylesheetRule): boolean {
  return rule.declarations.some(({ property, value }) => ANIMATION_PROPERTIES.has(property) && value !== 'none');
}

function isInsideReduce(rule: StylesheetRule): boolean {
  return rule.conditions.some((condition) => REDUCE_CONDITION_PATTERN.test(condition));
}

function isInsideNoPreference(rule: StylesheetRule): boolean {
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

export function specificityOf(complexSelector: string): Specificity {
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

function ruleSelectorsOf(rules: readonly StylesheetRule[], ruleHolds: (rule: StylesheetRule) => boolean): RuleSelector[] {
  return rules.flatMap((rule, sourceOrder) => (ruleHolds(rule) ? selectorListOf(rule.selector).map((selector) => ({ rule, sourceOrder, selector })) : []));
}

/** A scroll or view timeline moves only as the reader scrolls, so it is no motion that reduced motion stops. */
function followsScroll(rule: StylesheetRule): boolean {
  return rule.declarations.some(({ property, value }) => property === 'animation-timeline' && /^(?:scroll|view)\(/.test(value));
}

export function isAnimatedOutsideTheMotionQueries(rule: StylesheetRule): boolean {
  return setsRunningAnimation(rule) && !followsScroll(rule) && !isInsideReduce(rule) && !isInsideNoPreference(rule);
}

function stoppingSelectorsOf(rules: readonly StylesheetRule[]): RuleSelector[] {
  return ruleSelectorsOf(rules, (rule) => isInsideReduce(rule) && setsAnimation(rule));
}

export function unusedGuaranteeSentencesOf(rules: readonly StylesheetRule[], guaranteedAncestors: readonly string[]): string[] {
  const reduceCompounds = new Set(stoppingSelectorsOf(rules).flatMap(({ selector }) => compoundsOf(selector).slice(0, -1)));
  return guaranteedAncestors.filter((ancestor) => !reduceCompounds.has(ancestor)).map((ancestor) => `${ancestor} is a guaranteed ancestor but no reduce rule names it`);
}

/**
 * Each selector that sets an animation outside `@media (prefers-reduced-motion: no-preference)` and that no rule inside
 * `@media (prefers-reduced-motion: reduce)` reaches and wins the cascade over: a higher specificity, or the same one later in the same stylesheet.
 */
export function unstoppedAnimationSentencesOf(rules: readonly StylesheetRule[], guaranteedAncestors: readonly string[] = []): string[] {
  const reduceSelectors = stoppingSelectorsOf(rules);
  return ruleSelectorsOf(rules, isAnimatedOutsideTheMotionQueries)
    .filter((animatedSelector) => !reduceSelectors.some((reduceSelector) =>
      reaches(reduceSelector.selector, animatedSelector.selector, guaranteedAncestors) && winsOver(reduceSelector, animatedSelector)))
    .map(({ rule, selector }) => `${rule.stylesheet}: ${selector} sets an animation that no winning prefers-reduced-motion: reduce rule stops`);
}

export function holdsPointerState(rule: StylesheetRule): boolean {
  return POINTER_STATE_PATTERN.test(rule.selector);
}

function isAllowedMovement(rule: StylesheetRule, declaration: StylesheetDeclaration, allowedMovements: readonly AllowedMovement[]): boolean {
  return allowedMovements.some(({ selector, property }) => selector === selectorLineOf(rule.selector) && property === declaration.property);
}

/** A `:hover` or `:active` rule changes only colour, outline, a shadow, a filter, opacity, visibility or the cursor, but an allowed movement. */
export function movementSentencesOf(rules: readonly StylesheetRule[], allowedMovements: readonly AllowedMovement[]): string[] {
  return rules.filter(holdsPointerState).flatMap((rule) => rule.declarations
    .filter((declaration) => !PROPERTIES_A_POINTER_STATE_MAY_SET.has(declaration.property))
    .filter((declaration) => !(declaration.property === 'transform' && declaration.value === 'none'))
    .filter((declaration) => !isAllowedMovement(rule, declaration, allowedMovements))
    .map((declaration) => `${rule.stylesheet}: ${selectorLineOf(rule.selector)} sets ${declaration.property}, which a :hover or :active rule may not change`));
}

export function unusedAllowanceSentencesOf(rules: readonly StylesheetRule[], allowedMovements: readonly AllowedMovement[]): string[] {
  return allowedMovements
    .filter(({ selector, property }) => !rules.some((rule) =>
      selectorLineOf(rule.selector) === selector && rule.declarations.some((declaration) => declaration.property === property)))
    .map(({ selector, property }) => `${selector} { ${property} } is allowed but no rule sets it`);
}

/** The custom-property blocks of the stylesheet, top level and one `@media` deep, with their conditions. */
export function tokenBlocksOf(stylesheetText: string): TokenBlock[] {
  const text = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: TokenBlock[] = [];
  const collect = (start: number, end: number, condition: string): void => {
    let preludeStart = start;
    let position = start;
    while (position < end) {
      if (text[position] === '{') {
        const prelude = text.slice(preludeStart, position).trim();
        let depth = 1;
        let closing = position + 1;
        while (depth > 0 && closing < end) {
          if (text[closing] === '{') depth += 1;
          if (text[closing] === '}') depth -= 1;
          closing += 1;
        }
        if (prelude.startsWith('@media')) collect(position + 1, closing - 1, prelude);
        else {
          const values = new Map<string, string>();
          for (const declaration of text.slice(position + 1, closing - 1).split(';')) {
            const separator = declaration.indexOf(':');
            const property = declaration.slice(0, separator).trim();
            if (property.startsWith('--')) values.set(property, declaration.slice(separator + 1).trim());
          }
          blocks.push({ condition, selector: prelude, values });
        }
        position = closing;
        preludeStart = closing;
      } else position += 1;
    }
  };
  collect(0, text.length, '');
  return blocks;
}

function valueIn(blocks: readonly TokenBlock[], condition: string, selector: string, token: string): string | undefined {
  return blocks.filter((block) => block.condition === condition && block.selector === selector).findLast((block) => block.values.has(token))?.values.get(token);
}

/** Each token is set in the light theme, and a literal light value is set again for dark; an alias or a themeless value follows both. */
export function themeSentencesOf(blocks: readonly TokenBlock[], tokens: readonly string[]): string[] {
  return tokens.flatMap((token) => {
    const lightValue = valueIn(blocks, '', LIGHT_THEME_SELECTOR, token);
    if (lightValue === undefined) return [`${token} has no value in ${LIGHT_THEME_SELECTOR}`];
    const followsTheTheme = lightValue.includes('var(') || THEMELESS_VALUE_PATTERN.test(lightValue);
    if (followsTheTheme || valueIn(blocks, '', DARK_THEME_SELECTOR, token) !== undefined) return [];
    return [`${token} is a literal in ${LIGHT_THEME_SELECTOR} and has no value in ${DARK_THEME_SELECTOR}`];
  });
}

/** A colour the same in both themes is set once, in the light block. */
export function sameInBothThemesSentencesOf(blocks: readonly TokenBlock[], tokens: readonly string[]): string[] {
  return tokens.flatMap((token) => [
    ...valueIn(blocks, '', LIGHT_THEME_SELECTOR, token) === undefined ? [`${token} has no value in ${LIGHT_THEME_SELECTOR}`] : [],
    ...valueIn(blocks, '', DARK_THEME_SELECTOR, token) === undefined ? [] : [`${token} is the same in both themes and has a value in ${DARK_THEME_SELECTOR}`],
  ]);
}

/** The tokens the light block sets to a literal colour: the Bridge lists its themed colours by hand, the board reads them from its tokens. */
export function themedColourTokensOf(blocks: readonly TokenBlock[]): string[] {
  const lightTokens = new Map(blocks.filter((block) => block.condition === '' && block.selector === LIGHT_THEME_SELECTOR).flatMap((block) => [...block.values]));
  return [...lightTokens].filter(([, value]) => LITERAL_COLOUR_PATTERN.test(value) && !value.includes('var(')).map(([token]) => token);
}
