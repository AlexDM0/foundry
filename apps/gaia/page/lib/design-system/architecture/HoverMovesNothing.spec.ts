/**
 * Hover and press move nothing in the package's stylesheets: a rule whose selector holds `:hover` or `:active` (also inside
 * `:is()`, `:where()`, `:has()` or a selector list, and inside `@media` and `@container`) changes only colour, outline, a shadow, a filter,
 * opacity, visibility or the cursor. A movement allowed because it moves nothing else is an entry of `MOVEMENTS_ALLOWED`, held exact both
 * ways; `transform: none` only cancels a movement and always passes. The scan first proves it found a floor of hover and active rules, and
 * each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';

import { packageFilesMatching } from '../testing/PackageFiles.ts';
import {
  rulesOf,
  selectorLineOf,
  type Declaration,
  type StyleRule
} from '../testing/StyleRuleReader.ts';

const SMALLEST_STYLESHEET_COUNT = 60;
const SMALLEST_HOVER_RULE_COUNT = 30;
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

/**
 * Each entry moves nothing else, for a reason its own rule states: the tooltip hangs absolutely and takes no space, and a pressed button,
 * menu trigger or segment scales inside its own box, which a transform never gives back to the layout.
 */
const MOVEMENTS_ALLOWED: readonly AllowedMovement[] = [
  { selector: '.design-system-tooltip-trigger:is(:hover, :focus-within) > .design-system-tooltip', property: 'transform' },
  { selector: '.design-system-button:not(:disabled):active', property: 'transform' },
  { selector: '.design-system-icon-button:not(:disabled):active', property: 'transform' },
  { selector: '.design-system-menu-button:not([data-trigger="button"]):active', property: 'transform' },
  { selector: '.design-system-segments > button:not(:disabled):active', property: 'transform' },
];

function holdsPointerState(rule: StyleRule): boolean {
  return POINTER_STATE_PATTERN.test(rule.selector);
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

const RULES = packageFilesMatching('**/*.css').flatMap(({ path, text }) => rulesOf(path, text));

describe('the scan itself', () => {
  test('it reads the stylesheets of the package, and finds a floor of hover rules and of active rules', () => {
    const pointerStateRules = RULES.filter(holdsPointerState);
    expect(pointerStateRules.filter((rule) => rule.selector.includes(':hover')).length).toBeGreaterThanOrEqual(SMALLEST_HOVER_RULE_COUNT);
    expect(pointerStateRules.filter((rule) => rule.selector.includes(':active')).length).toBeGreaterThanOrEqual(SMALLEST_ACTIVE_RULE_COUNT);
    const scannedStylesheets = new Set(RULES.map(({ stylesheet }) => stylesheet));
    for (const path of ['styles/tokens.css', 'styles/base.css', 'atoms/Button.css', 'organisms/Dialog.css']) {
      expect(scannedStylesheets).toContain(path);
    }
    expect(scannedStylesheets.size).toBeGreaterThanOrEqual(SMALLEST_STYLESHEET_COUNT);
  });
});

describe('the guard, planted in memory', () => {
  const sentencesOfPlanted = (stylesheetText: string, allowedMovements: readonly AllowedMovement[] = []): string[] =>
    movementSentencesOf(rulesOf('planted.css', stylesheetText), allowedMovements);

  test('each movement and resize is named by its selector and property', () => {
    expect(sentencesOfPlanted([
      '.design-system-planted:hover { transform: translateY(-2px); }',
      '.design-system-planted:hover { padding: 4px; }',
      'button:active { transform: scale(0.98); }',
      '.design-system-planted:is(:hover, :focus-visible) { width: 10px; }',
      '.design-system-planted:hover .design-system-planted-row { display: flex; }',
    ].join('\n'))).toEqual([
      'planted.css: .design-system-planted:hover sets transform, which a :hover or :active rule may not change',
      'planted.css: .design-system-planted:hover sets padding, which a :hover or :active rule may not change',
      'planted.css: button:active sets transform, which a :hover or :active rule may not change',
      'planted.css: .design-system-planted:is(:hover, :focus-visible) sets width, which a :hover or :active rule may not change',
      'planted.css: .design-system-planted:hover .design-system-planted-row sets display, which a :hover or :active rule may not change',
    ]);
  });

  test('a rule inside @media or @container is read, a comment is not, and a keyframe is no rule', () => {
    expect(sentencesOfPlanted([
      '/* .design-system-prose:hover { margin: 0; } */',
      '@media (prefers-reduced-motion: no-preference) { .design-system-planted:hover { margin-top: 1px; } }',
      '@container (max-width: 250px) { .design-system-planted:active { font-size: 12px; } }',
      '@keyframes design-system-planted { from { transform: scale(0.8); } }',
      '.design-system-planted { transform: scale(0.8); }',
    ].join('\n'))).toEqual([
      'planted.css: .design-system-planted:hover sets margin-top, which a :hover or :active rule may not change',
      'planted.css: .design-system-planted:active sets font-size, which a :hover or :active rule may not change',
    ]);
  });

  test('a filter, an opacity, a colour, a shadow and a transform: none pass', () => {
    expect(sentencesOfPlanted([
      'button:not(:disabled):active { filter: brightness(0.94); }',
      '.design-system-planted:hover { opacity: 0.8; color: var(--ink); box-shadow: 0 4px 12px var(--shadow-card-lift); }',
      '.design-system-planted:active { transform: none; }',
    ].join('\n'))).toEqual([]);
  });

  test('an allowed movement passes on its own selector only, and an allowance no rule uses is named', () => {
    const allowedMovements = [{ selector: '.design-system-tooltip:hover', property: 'transform' }];
    expect(sentencesOfPlanted('.design-system-tooltip:hover { transform: translateY(-2px); } .design-system-planted:hover { transform: translateY(-2px); }', allowedMovements))
      .toEqual(['planted.css: .design-system-planted:hover sets transform, which a :hover or :active rule may not change']);
    expect(unusedAllowanceSentencesOf(rulesOf('planted.css', '.design-system-planted:hover { color: red; }'), allowedMovements))
      .toEqual(['.design-system-tooltip:hover { transform } is allowed but no rule sets it']);
  });
});

describe('the stylesheets of the package', () => {
  test('no :hover or :active rule moves or resizes anything', () => {
    expect(movementSentencesOf(RULES, MOVEMENTS_ALLOWED)).toEqual([]);
  });

  test('every allowed movement is still used', () => {
    expect(unusedAllowanceSentencesOf(RULES, MOVEMENTS_ALLOWED)).toEqual([]);
  });
});

describe('the press and the interactive card', () => {
  const PRESS_FILTER = 'brightness(0.94)';
  const pointerStateRulesWhere = (selectorHolds: string): StyleRule[] =>
    RULES.filter((rule) => holdsPointerState(rule) && rule.selector.includes(selectorHolds));
  const valuesOf = (rules: readonly StyleRule[], property: string): string[] =>
    rules.flatMap(({ declarations }) => declarations.filter((declaration) => declaration.property === property).map(({ value }) => value));

  test('a pressed button changes only its brightness', () => {
    expect(valuesOf(pointerStateRulesWhere('button:not(:disabled):active'), 'filter')).toEqual([PRESS_FILTER]);
  });

  test('a hovered interactive Card shows its ring', () => {
    expect(valuesOf(pointerStateRulesWhere('.design-system-card[data-interactive]:hover'), 'box-shadow')).not.toEqual([]);
  });

  test('reduced motion keeps the colour feedback: a hover or press rule written for it alone only cancels a movement', () => {
    const cancelsOnlyAMovement = (rule: StyleRule): boolean =>
      rule.declarations.every(({ property, value }) => property === 'transform' && value === 'none');
    const reducedMotionPointerStateRules = RULES.filter((rule) => holdsPointerState(rule)
      && rule.conditions.some((condition) => condition.includes('prefers-reduced-motion')) && !cancelsOnlyAMovement(rule));
    expect(reducedMotionPointerStateRules.map(({ selector }) => selectorLineOf(selector))).toEqual([]);
  });
});
