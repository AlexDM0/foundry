/**
 * The package's style contract, both ways: each class is owned by the lowest-layer component emitting it and styled in that owner's stylesheet; a
 * component's stylesheet names its own classes and only lower-layer parts beside them; every class and keyframe is named `design-system-…`;
 * `styles/design-system.css` imports every stylesheet once, in layer order. A `className` the scan cannot read as a literal fails.
 */
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import {
  COMPONENT_LAYERS,
  isShippingComponent,
  layerOf,
  packageFilesMatching,
  targetPathOf,
  type PackageFile
} from '../testing/PackageFiles.ts';

const CLASS_PREFIX = 'design-system-';
const ENTRY_STYLESHEET_PATH = 'styles/design-system.css';
/** The stylesheets of `styles/` that the entry imports before the components, in this order. */
const THEME_STYLESHEET_PATHS = ['styles/tokens.css', 'styles/base.css', 'styles/keyframes.css'];
const SMALLEST_CLASS_COUNT = 100;
const SMALLEST_IMPORT_COUNT = 40;
const BASE_STYLESHEET_PATH = 'styles/base.css';
/** What `styles/base.css` sets on text selection: nothing on the root, text in every field, nothing on a control inside a selectable surface. */
const SELECTION_RULES: readonly SelectionRule[] = [
  { selectors: [':root'], value: 'none' },
  { selectors: ['input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])'], value: 'text' },
  { selectors: ['button', '[role="button"]', '[role="tab"]', '[role="menuitem"]', 'summary'], value: 'none' },
];

interface ComponentClasses {
  /** The component's path without its extension, such as `atoms/Button`. */
  readonly component:  string;
  readonly classNames: ReadonlySet<string>;
  /** `<path>:<line>` of each `className` whose value is not a literal the scan can read. */
  readonly unreadable: readonly string[];
}

interface SelectionRule {
  readonly selectors: readonly string[];
  readonly value:     'none' | 'text';
}

interface StyleRule {
  readonly selector: string;
  readonly classes:  readonly string[];
}

function componentOf(path: string): string {
  return path.replace(/\.(tsx|css)$/, '');
}

/** The literal texts an expression can evaluate to, or `null` when it is anything else. */
function literalTextsOf(expression: ts.Expression): string[] | null {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isParenthesizedExpression(expression)) return literalTextsOf(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = literalTextsOf(expression.whenTrue);
    const whenFalse = literalTextsOf(expression.whenFalse);
    return whenTrue === null || whenFalse === null ? null : [...whenTrue, ...whenFalse];
  }
  return null;
}

function emittedClassesOf(source: PackageFile): ComponentClasses {
  const classNames = new Set<string>();
  const unreadable: string[] = [];
  const sourceFile = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'className') {
      const { initializer } = node;
      let texts: string[] | null = null;
      if (initializer !== undefined && ts.isStringLiteral(initializer)) texts = [initializer.text];
      else if (initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined) texts = literalTextsOf(initializer.expression);
      if (texts === null) unreadable.push(`${source.path}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
      else texts.flatMap((classText) => classText.split(/\s+/)).filter((className) => className !== '').forEach((className) => classNames.add(className));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { component: componentOf(source.path), classNames, unreadable };
}

function classesOf(selector: string): string[] {
  return [...selector.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map(([, className = '']) => className);
}

function splitSelectorList(prelude: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    if (prelude[i] === '(' || prelude[i] === '[') depth += 1;
    if (prelude[i] === ')' || prelude[i] === ']') depth -= 1;
    if (prelude[i] === ',' && depth === 0) {
      selectors.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  return [...selectors, prelude.slice(start).trim()];
}

/** Every selector of the stylesheet's style rules, inside grouping at-rules too; a `@keyframes` block holds none. */
function styleRulesOf(stylesheetText: string): StyleRule[] {
  const text = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const rules: StyleRule[] = [];
  const enclosing: string[] = [];
  let preludeStart = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '{') {
      const prelude = text.slice(preludeStart, i).trim();
      const insideKeyframes = enclosing.some((outer) => outer.startsWith('@keyframes'));
      if (!prelude.startsWith('@') && !insideKeyframes) {
        rules.push(...splitSelectorList(prelude).map((selector) => ({ selector: selector.replace(/\s+/g, ' '), classes: classesOf(selector) })));
      }
      enclosing.push(prelude);
      preludeStart = i + 1;
    } else if (character === '}') {
      enclosing.pop();
      preludeStart = i + 1;
    } else if (character === ';') {
      preludeStart = i + 1;
    }
  }
  return rules;
}

function keyframeNamesOf(stylesheetText: string): string[] {
  return [...stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@keyframes\s+([\w-]+)/g)].map(([, name = '']) => name);
}

function importedPathsOf(entry: PackageFile): string[] {
  return [...entry.text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+["']([^"']+)["']/g)].map(([, reference = '']) => targetPathOf(entry.path, reference));
}

function layerRankOf(component: string): number {
  const layer = layerOf(component);
  return layer === null ? -1 : COMPONENT_LAYERS.indexOf(layer);
}

/** The owner of each class: the component of the lowest layer that emits it. */
function ownersOf(components: readonly ComponentClasses[]): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const { component, classNames } of [...components].sort((a, b) => layerRankOf(b.component) - layerRankOf(a.component))) {
    for (const className of classNames) owners.set(className, component);
  }
  return owners;
}

function contractSentencesOf(components: readonly ComponentClasses[], stylesheets: readonly PackageFile[]): string[] {
  const owners = ownersOf(components);
  const componentNames = new Set(components.map(({ component }) => component));
  const rulesByComponent = new Map(stylesheets.map((stylesheet) => [componentOf(stylesheet.path), styleRulesOf(stylesheet.text)]));
  const styledBy = (component: string): ReadonlySet<string> => new Set((rulesByComponent.get(component) ?? []).flatMap((rule) => rule.classes));
  const emittedBy = new Map(components.map(({ component, classNames }) => [component, classNames]));
  const sentences: string[] = components.flatMap(({ unreadable }) => unreadable.map((site) => `${site} sets a className the scan cannot read: use a literal`));
  for (const [className, owner] of owners) {
    if (!styledBy(owner).has(className)) sentences.push(`.${className} is emitted by ${owner}.tsx, its owner, but ${owner}.css does not style it`);
  }
  for (const stylesheet of stylesheets) {
    const component = componentOf(stylesheet.path);
    if (stylesheet.path.startsWith('styles/')) {
      sentences.push(...styleRulesOf(stylesheet.text).filter((rule) => rule.classes.length > 0)
        .map((rule) => `${stylesheet.path} styles ${rule.selector}: a class is styled in its component's stylesheet`));
      continue;
    }
    if (!componentNames.has(component)) {
      sentences.push(`${stylesheet.path} has no component beside it`);
      continue;
    }
    for (const rule of rulesByComponent.get(component) ?? []) {
      if (!rule.classes.some((className) => owners.get(className) === component)) {
        sentences.push(`${stylesheet.path} styles ${rule.selector}, which names no class of ${component}.tsx`);
      }
      for (const className of rule.classes) {
        const owner = owners.get(className);
        const isItsOwn = emittedBy.get(component)?.has(className) ?? false;
        const isAHeldPart = owner !== undefined && layerRankOf(owner) < layerRankOf(component);
        if (!isItsOwn && !isAHeldPart) sentences.push(`.${className} is styled in ${stylesheet.path}, but ${component}.tsx does not emit it and no lower layer owns it`);
      }
    }
  }
  const everyClass = new Set([...owners.keys(), ...[...rulesByComponent.values()].flatMap((rules) => rules.flatMap((rule) => rule.classes))]);
  sentences.push(...[...everyClass].filter((className) => !className.startsWith(CLASS_PREFIX)).map((className) => `.${className} is not named ${CLASS_PREFIX}…`));
  sentences.push(...stylesheets.flatMap((stylesheet) => keyframeNamesOf(stylesheet.text).filter((name) => !name.startsWith(CLASS_PREFIX))
    .map((name) => `${stylesheet.path} names the keyframes ${name}, not ${CLASS_PREFIX}…`)));
  return [...new Set(sentences)].sort();
}

/** Each selection rule is a rule of the stylesheet that sets both `user-select` and `-webkit-user-select` to its value on each of its selectors. */
function selectionSentencesOf(stylesheet: PackageFile, expected: readonly SelectionRule[]): string[] {
  const declared = [...stylesheet.text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectorList = '', body = '']) => {
    const declarations = new Map(body.split(';').map((declaration) => declaration.split(':').map((part) => part.trim())).map(([property = '', value = '']) => [property, value]));
    return selectorList.split(',').map((selector) => ({ selector: selector.trim(), declarations }));
  });
  return expected.flatMap(({ selectors, value }) => selectors.flatMap((selector) => ['user-select', '-webkit-user-select']
    .filter((property) => !declared.some((rule) => rule.selector === selector && rule.declarations.get(property) === value))
    .map((property) => `${stylesheet.path} does not set ${property}: ${value} on ${selector}`)));
}

/** The entry imports the theme stylesheets in their order, then every component's stylesheet, atoms before molecules before organisms. */
function entrySentencesOf(entry: PackageFile, stylesheets: readonly PackageFile[]): string[] {
  const componentStylesheets = stylesheets.map(({ path }) => path).filter((path) => layerOf(path) !== null)
    .sort((a, b) => layerRankOf(a) - layerRankOf(b) || a.localeCompare(b));
  const expected = [...THEME_STYLESHEET_PATHS, ...componentStylesheets];
  const imported = importedPathsOf(entry);
  return [
    ...expected.filter((path) => !imported.includes(path)).map((path) => `${entry.path} does not import ${path}`),
    ...imported.filter((path) => !expected.includes(path)).map((path) => `${entry.path} imports ${path}, which is not a stylesheet it holds`),
    ...imported.filter((path) => expected.includes(path)).join() === expected.filter((path) => imported.includes(path)).join()
      ? []
      : [`${entry.path} imports out of order: ${THEME_STYLESHEET_PATHS.join(', ')}, then atoms, molecules, organisms`],
  ];
}

const COMPONENTS = packageFilesMatching('**/*.tsx').filter((source) => isShippingComponent(source.path)).map(emittedClassesOf);
const STYLESHEETS = packageFilesMatching('**/*.css').filter((stylesheet) => stylesheet.path !== ENTRY_STYLESHEET_PATH);
const ENTRY = packageFilesMatching(ENTRY_STYLESHEET_PATH)[0] ?? { path: ENTRY_STYLESHEET_PATH, text: '' };
const BASE = packageFilesMatching(BASE_STYLESHEET_PATH)[0] ?? { path: BASE_STYLESHEET_PATH, text: '' };

describe('the scan itself', () => {
  test('it reads the components and the stylesheets, and finds a floor of classes in each', () => {
    expect(COMPONENTS.map(({ component }) => component)).toContain('atoms/Button');
    expect(STYLESHEETS.map(({ path }) => path)).toContain('atoms/Button.css');
    expect(STYLESHEETS.map(({ path }) => path)).toContain('styles/tokens.css');
    expect(new Set(COMPONENTS.flatMap(({ classNames }) => [...classNames])).size).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(STYLESHEETS.flatMap(({ text }) => styleRulesOf(text)).length).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(importedPathsOf(ENTRY).length).toBeGreaterThanOrEqual(SMALLEST_IMPORT_COUNT);
  });

  test('it reads the selectors inside a media block and none of a keyframes block, and a comment is not a rule', () => {
    expect(styleRulesOf('/* .prose { } */ @media (x) { .a, .b .c { color: red; } } @keyframes k { from { opacity: 0; } }').map((rule) => rule.selector))
      .toEqual(['.a', '.b .c']);
  });
});

describe('the components and their stylesheets', () => {
  test('every class is styled by its owner, and every rule styles its own component and the parts it holds', () => {
    expect(contractSentencesOf(COMPONENTS, STYLESHEETS)).toEqual([]);
  });

  test('the entry stylesheet imports every stylesheet once, in layer order', () => {
    expect(entrySentencesOf(ENTRY, STYLESHEETS)).toEqual([]);
  });

  test('text is unselectable from the root, selectable in every field, and unselectable on every control', () => {
    expect(selectionSentencesOf(BASE, SELECTION_RULES)).toEqual([]);
  });
});

describe('the test still names each form, planted in memory', () => {
  const component = (path: string, text: string): ComponentClasses => emittedClassesOf({ path, text });
  const stylesheet = (path: string, text: string): PackageFile => ({ path, text });

  test('an unstyled class, a rule of no class of its own, a class neither emitted nor held, and an unreadable className', () => {
    const atom = component('atoms/Planted.tsx', 'export const view = (name: string) => <><p className="design-system-planted" /><p className={name} /></>;');
    const molecule = component('molecules/PlantedCard.tsx', 'export const view = <div className="design-system-planted-card" />;');
    expect(contractSentencesOf([atom, molecule], [
      stylesheet('atoms/Planted.css', '.design-system-planted-card { color: red; }'),
      stylesheet('molecules/PlantedCard.css', '.design-system-planted-card .design-system-planted { margin: 0; } .design-system-planted-dead { margin: 0; }'),
    ])).toEqual([
      '.design-system-planted is emitted by atoms/Planted.tsx, its owner, but atoms/Planted.css does not style it',
      '.design-system-planted-card is styled in atoms/Planted.css, but atoms/Planted.tsx does not emit it and no lower layer owns it',
      '.design-system-planted-dead is styled in molecules/PlantedCard.css, but molecules/PlantedCard.tsx does not emit it and no lower layer owns it',
      'atoms/Planted.css styles .design-system-planted-card, which names no class of atoms/Planted.tsx',
      'atoms/Planted.tsx:1 sets a className the scan cannot read: use a literal',
      'molecules/PlantedCard.css styles .design-system-planted-dead, which names no class of molecules/PlantedCard.tsx',
    ]);
  });

  test('a class without the prefix, a keyframe without it, a class in a theme stylesheet and a stylesheet with no component', () => {
    expect(contractSentencesOf([component('atoms/Planted.tsx', 'export const view = <p className="planted" />;')], [
      stylesheet('atoms/Planted.css', '.planted { animation: planted 1s; } @keyframes planted { from { opacity: 0; } }'),
      stylesheet('styles/base.css', '.design-system-planted { color: red; }'),
      stylesheet('molecules/Orphan.css', '.design-system-orphan { color: red; }'),
    ])).toEqual([
      '.planted is not named design-system-…',
      'atoms/Planted.css names the keyframes planted, not design-system-…',
      'molecules/Orphan.css has no component beside it',
      'styles/base.css styles .design-system-planted: a class is styled in its component\'s stylesheet',
    ]);
  });

  test('a part held by a component of a higher layer, and a class its owner and a higher layer both emit, pass', () => {
    const atom = component('atoms/Planted.tsx', 'export const view = <button className="design-system-planted" />;');
    const molecule = component('molecules/PlantedMenu.tsx', 'export const view = <div className="design-system-planted-menu"><button className="design-system-planted" /></div>;');
    expect(contractSentencesOf([atom, molecule], [
      stylesheet('atoms/Planted.css', '.design-system-planted { color: red; }'),
      stylesheet('molecules/PlantedMenu.css', '.design-system-planted-menu .design-system-planted { margin: 0; } .design-system-planted-menu { margin: 0; }'),
    ])).toEqual([]);
  });

  test('an entry stylesheet missing a stylesheet, importing one twice out of order, or importing one the package does not hold', () => {
    const stylesheets = [stylesheet('atoms/Planted.css', ''), stylesheet('molecules/Planted.css', '')];
    const themeImports = THEME_STYLESHEET_PATHS.map((path) => `@import "../${path}";`).join('\n').replaceAll('../styles/', './');
    expect(entrySentencesOf(stylesheet(ENTRY_STYLESHEET_PATH, `${themeImports}\n@import "../molecules/Planted.css";\n@import "../atoms/Planted.css";\n`), stylesheets))
      .toEqual([`${ENTRY_STYLESHEET_PATH} imports out of order: ${THEME_STYLESHEET_PATHS.join(', ')}, then atoms, molecules, organisms`]);
    expect(entrySentencesOf(stylesheet(ENTRY_STYLESHEET_PATH, `${themeImports}\n@import "../atoms/Planted.css";\n@import "../../host/styles/page.css";\n`), stylesheets))
      .toEqual([
        `${ENTRY_STYLESHEET_PATH} does not import molecules/Planted.css`,
        `${ENTRY_STYLESHEET_PATH} imports ../host/styles/page.css, which is not a stylesheet it holds`,
      ]);
  });

  test('a root left selectable, a field set only unprefixed, and a control left out', () => {
    const planted = stylesheet(BASE_STYLESHEET_PATH, [
      ':root { user-select: text; -webkit-user-select: text; }',
      'input { user-select: text; }',
      'button { user-select: none; -webkit-user-select: none; }',
    ].join('\n'));
    expect(selectionSentencesOf(planted, [
      { selectors: [':root'], value: 'none' },
      { selectors: ['input'], value: 'text' },
      { selectors: ['button', 'summary'], value: 'none' },
    ])).toEqual([
      `${BASE_STYLESHEET_PATH} does not set user-select: none on :root`,
      `${BASE_STYLESHEET_PATH} does not set -webkit-user-select: none on :root`,
      `${BASE_STYLESHEET_PATH} does not set -webkit-user-select: text on input`,
      `${BASE_STYLESHEET_PATH} does not set user-select: none on summary`,
      `${BASE_STYLESHEET_PATH} does not set -webkit-user-select: none on summary`,
    ]);
  });
});
