/**
 * Hover and press move nothing in the Bridge: a rule whose selector holds `:hover` or `:active` (also inside `:is()`, `:where()`,
 * `:has()` or a selector list, and inside `@media` and `@container`) changes only colour, outline, a shadow, a filter, opacity, visibility
 * or the cursor. A movement allowed because it moves nothing else is an entry of `MOVEMENTS_ALLOWED`, held exact both ways; `transform:
 * none` only cancels a movement and always passes. The scan first proves it found a floor of hover and active rules, and each form is
 * planted in memory.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

const STYLES_FOLDER = join(import.meta.dir, 'styles');
const SCANNED_STYLESHEETS = ['board.css', 'tokens.css'] as const;
const SMALLEST_HOVER_RULE_COUNT = 41;
const SMALLEST_ACTIVE_RULE_COUNT = 1;
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

interface AllowedMovement {
  readonly selector: string;
  readonly property: string;
}

/** Each entry moves nothing else, for a reason its own rule states: the tooltip hangs absolutely and takes no space. */
const MOVEMENTS_ALLOWED: readonly AllowedMovement[] = [
  { selector: '.bridge-tooltip-trigger:is(:hover, :focus-within) > .bridge-tooltip', property: 'transform' },
];

interface Declaration {
  readonly property: string;
  readonly value:    string;
}

interface StyleRule {
  readonly stylesheet:   string;
  readonly selector:     string;
  /** The preludes of the `@media` and `@container` blocks around the rule, outermost first. */
  readonly conditions:   readonly string[];
  readonly declarations: readonly Declaration[];
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
function declarationsBetween(text: string, start: number, end: number): Declaration[] {
  const declarations: Declaration[] = [];
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
function collectRules(text: string, start: number, end: number, enclosingSelector: string, conditions: readonly string[], stylesheet: string, rules: StyleRule[]): void {
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

function rulesOf(stylesheet: string, stylesheetText: string): StyleRule[] {
  const withoutComments = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: StyleRule[] = [];
  collectRules(withoutComments, 0, withoutComments.length, '', [], stylesheet, rules);
  return rules;
}

function holdsPointerState(rule: StyleRule): boolean {
  return POINTER_STATE_PATTERN.test(rule.selector);
}

function selectorLineOf(selector: string): string {
  return selector.replace(/\s+/g, ' ');
}

function isAllowedMovement(rule: StyleRule, declaration: Declaration, allowedMovements: readonly AllowedMovement[]): boolean {
  return allowedMovements.some(({ selector, property }) => selector === selectorLineOf(rule.selector) && property === declaration.property);
}

function movementSentencesOf(rules: readonly StyleRule[], allowedMovements: readonly AllowedMovement[]): string[] {
  return rules.filter(holdsPointerState).flatMap((rule) => rule.declarations
    .filter((declaration) => !PROPERTIES_A_POINTER_STATE_MAY_SET.has(declaration.property))
    .filter((declaration) => !(declaration.property === 'transform' && declaration.value === 'none'))
    .filter((declaration) => !isAllowedMovement(rule, declaration, allowedMovements))
    .map((declaration) => `${rule.stylesheet}: ${selectorLineOf(rule.selector)} sets ${declaration.property}, which a :hover or :active rule may not change`));
}

function unusedAllowanceSentencesOf(rules: readonly StyleRule[], allowedMovements: readonly AllowedMovement[]): string[] {
  return allowedMovements
    .filter(({ selector, property }) => !rules.some((rule) =>
      selectorLineOf(rule.selector) === selector && rule.declarations.some((declaration) => declaration.property === property)))
    .map(({ selector, property }) => `${selector} { ${property} } is allowed but no rule sets it`);
}

const RULES = SCANNED_STYLESHEETS.flatMap((stylesheet) => rulesOf(stylesheet, readFileSync(join(STYLES_FOLDER, stylesheet), 'utf8')));

describe('the scan itself', () => {
  test('it reads both stylesheets and finds a floor of hover rules and of active rules', () => {
    const pointerStateRules = RULES.filter(holdsPointerState);
    expect(pointerStateRules.filter((rule) => rule.selector.includes(':hover')).length).toBeGreaterThanOrEqual(SMALLEST_HOVER_RULE_COUNT);
    expect(pointerStateRules.filter((rule) => rule.selector.includes(':active')).length).toBeGreaterThanOrEqual(SMALLEST_ACTIVE_RULE_COUNT);
    expect(new Set(RULES.map(({ stylesheet }) => stylesheet))).toEqual(new Set(SCANNED_STYLESHEETS));
  });
});

describe('the guard, planted in memory', () => {
  const sentencesOfPlanted = (stylesheetText: string, allowedMovements: readonly AllowedMovement[] = []): string[] =>
    movementSentencesOf(rulesOf('planted.css', stylesheetText), allowedMovements);

  test('each movement and resize is named by its selector and property', () => {
    expect(sentencesOfPlanted([
      '.bridge-planted:hover { transform: translateY(-2px); }',
      '.bridge-planted:hover { padding: 4px; }',
      'button:active { transform: scale(0.98); }',
      '.bridge-planted:is(:hover, :focus-visible) { width: 10px; }',
      '.bridge-planted:hover .bridge-planted-row { display: flex; }',
    ].join('\n'))).toEqual([
      'planted.css: .bridge-planted:hover sets transform, which a :hover or :active rule may not change',
      'planted.css: .bridge-planted:hover sets padding, which a :hover or :active rule may not change',
      'planted.css: button:active sets transform, which a :hover or :active rule may not change',
      'planted.css: .bridge-planted:is(:hover, :focus-visible) sets width, which a :hover or :active rule may not change',
      'planted.css: .bridge-planted:hover .bridge-planted-row sets display, which a :hover or :active rule may not change',
    ]);
  });

  test('a rule inside @media or @container is read, a comment is not, and a keyframe is no rule', () => {
    expect(sentencesOfPlanted([
      '/* .bridge-prose:hover { margin: 0; } */',
      '@media (prefers-reduced-motion: no-preference) { .bridge-planted:hover { margin-top: 1px; } }',
      '@container (max-width: 250px) { .bridge-planted:active { font-size: 12px; } }',
      '@keyframes bridge-planted { from { transform: scale(0.8); } }',
      '.bridge-planted { transform: scale(0.8); }',
    ].join('\n'))).toEqual([
      'planted.css: .bridge-planted:hover sets margin-top, which a :hover or :active rule may not change',
      'planted.css: .bridge-planted:active sets font-size, which a :hover or :active rule may not change',
    ]);
  });

  test('a filter, an opacity, a colour, a shadow and a transform: none pass', () => {
    expect(sentencesOfPlanted([
      'button:not(:disabled):active { filter: brightness(0.92); }',
      '.bridge-planted:hover { opacity: 0.8; color: var(--ink); box-shadow: 0 4px 12px var(--shadow-card-lift); }',
      '.bridge-planted:active { transform: none; }',
    ].join('\n'))).toEqual([]);
  });

  test('an allowed movement passes on its own selector only, and an allowance no rule uses is named', () => {
    const allowedMovements = [{ selector: '.bridge-tooltip:hover', property: 'transform' }];
    expect(sentencesOfPlanted('.bridge-tooltip:hover { transform: translateY(-2px); } .bridge-planted:hover { transform: translateY(-2px); }', allowedMovements))
      .toEqual(['planted.css: .bridge-planted:hover sets transform, which a :hover or :active rule may not change']);
    expect(unusedAllowanceSentencesOf(rulesOf('planted.css', '.bridge-planted:hover { color: red; }'), allowedMovements))
      .toEqual(['.bridge-tooltip:hover { transform } is allowed but no rule sets it']);
  });
});

describe('board.css and tokens.css', () => {
  test('no :hover or :active rule moves or resizes anything', () => {
    expect(movementSentencesOf(RULES, MOVEMENTS_ALLOWED)).toEqual([]);
  });

  test('every allowed movement is still used', () => {
    expect(unusedAllowanceSentencesOf(RULES, MOVEMENTS_ALLOWED)).toEqual([]);
  });
});

describe('the press and the kanban card', () => {
  const PRESS_FILTER = 'brightness(0.92)';
  const pointerStateRulesWhere = (selectorHolds: string): StyleRule[] =>
    RULES.filter((rule) => holdsPointerState(rule) && rule.selector.includes(selectorHolds));
  const valuesOf = (rules: readonly StyleRule[], property: string): string[] =>
    rules.flatMap(({ declarations }) => declarations.filter((declaration) => declaration.property === property).map(({ value }) => value));

  test('a pressed button and a pressed kanban card change only their brightness and shadow', () => {
    expect(valuesOf(pointerStateRulesWhere('button:not(:disabled):active'), 'filter')).toEqual([PRESS_FILTER]);
    expect(valuesOf(pointerStateRulesWhere('.bridge-kanban-card:active'), 'filter')).toEqual([PRESS_FILTER]);
  });

  test('a hovered kanban card keeps its shadow and its border colour change', () => {
    expect(valuesOf(pointerStateRulesWhere('.bridge-kanban-card:hover'), 'box-shadow')).not.toEqual([]);
    expect(valuesOf(pointerStateRulesWhere('.bridge-kanban-card'), 'border-color')).not.toEqual([]);
  });

  test('reduced motion keeps the colour feedback: no hover or press rule is written for it alone', () => {
    const reducedMotionPointerStateRules = RULES.filter((rule) => holdsPointerState(rule) && rule.conditions.some((condition) => condition.includes('prefers-reduced-motion')));
    expect(reducedMotionPointerStateRules.map(({ selector }) => selectorLineOf(selector))).toEqual([]);
  });
});
