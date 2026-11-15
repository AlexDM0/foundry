/**
 * The Bridge's style contract, held both ways: every class a shipping component emits is styled in `bridge/styles/board.css`, and every
 * class `board.css` styles is emitted, so an unstyled class and a dead rule both fail. A `design-system-…` class belongs to the package
 * `design-system/`, whose own `design-system/StyleContract.spec.ts` holds its stylesheets: no Bridge component emits one, since the Bridge
 * composes the package's components, and no `board.css` selector names one: a look the Bridge needs of a part is a prop or a variant of
 * its component, and the Bridge places a part through a wrapper of its own. No string of shipping Bridge code names one either, a query's
 * selector included: the Bridge reaches an element through the component's ref prop. `board.css` animates with keyframes of its own,
 * never a `design-system-…` keyframe. A `board.css` rule that names one counts it as emitted when a
 * component of the package emits it. Classes are read from the syntax tree, as `className` literals (a string, a template without
 * substitutions, or a conditional between those); a `className` the scan cannot read fails too, since its classes could not be held. The
 * scan first proves it found a floor of each, and each form is planted in memory.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import { designSystemFolder } from './testing/PageStylesheets.ts';

const BRIDGE_FOLDER = import.meta.dir;
const BOARD_STYLESHEET_PATH = join(BRIDGE_FOLDER, 'styles', 'board.css');
const DESIGN_SYSTEM_FOLDER = designSystemFolder();
const DESIGN_SYSTEM_CLASS_PREFIX = 'design-system-';
const SMALLEST_CLASS_COUNT = 10;

/** The `board.css` selectors allowed to restyle a class of the package: none, and a selector is never added. */
const PACKAGE_CLASS_HOST_OVERRIDES: readonly string[] = [];

interface ComponentSource {
  readonly path: string;
  readonly text: string;
}

interface EmittedClasses {
  readonly classNames: ReadonlySet<string>;
  /** `<path>:<line>` of each `className` whose value is not a literal the scan can read. */
  readonly unreadable: readonly string[];
}

function isShippingComponent(path: string): boolean {
  return path.endsWith('.tsx') && !path.endsWith('.dom.tsx') && !path.split('/').includes('testing');
}

function shippingComponentSources(folder: string): ComponentSource[] {
  return [...new Bun.Glob('**/*.tsx').scanSync({ cwd: folder })]
    .filter(isShippingComponent)
    .sort()
    .map((path) => ({ path, text: readFileSync(join(folder, path), 'utf8') }));
}

/** What the package emits and styles, which settles the `design-system-…` classes the Bridge emits or names. */
interface PackageClasses {
  readonly emitted: ReadonlySet<string>;
  readonly styled:  ReadonlySet<string>;
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

function emittedClassesOf(sources: readonly ComponentSource[]): EmittedClasses {
  const classNames = new Set<string>();
  const unreadable: string[] = [];
  for (const { path, text } of sources) {
    const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'className') {
        const { initializer } = node;
        let texts: string[] | null = null;
        if (initializer !== undefined && ts.isStringLiteral(initializer)) texts = [initializer.text];
        else if (initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined) texts = literalTextsOf(initializer.expression);
        if (texts === null) unreadable.push(`${path}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
        else texts.flatMap((classText) => classText.split(/\s+/)).filter((className) => className !== '').forEach((className) => classNames.add(className));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { classNames, unreadable };
}

/** Every class selector the stylesheet's rules name; its comments are prose and are left out. */
function styledClassesOf(stylesheetText: string): ReadonlySet<string> {
  const withoutComments = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...withoutComments.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map(([, className = '']) => className));
}

function contractSentencesOf(emitted: EmittedClasses, styled: ReadonlySet<string>, packageClasses: PackageClasses): string[] {
  const isAPackageClass = (className: string): boolean => className.startsWith(DESIGN_SYSTEM_CLASS_PREFIX);
  const isEmitted = (className: string): boolean => emitted.classNames.has(className) || (isAPackageClass(className) && packageClasses.emitted.has(className));
  return [
    ...emitted.unreadable.map((site) => `${site} sets a className the scan cannot read: use a literal`),
    ...[...emitted.classNames].filter(isAPackageClass).sort()
      .map((className) => `.${className} is a class of design-system/: compose the package's component, never emit its class`),
    ...[...emitted.classNames].filter((className) => !isAPackageClass(className) && !styled.has(className)).sort()
      .map((className) => `.${className} is emitted but board.css does not style it`),
    ...[...styled].filter((className) => !isEmitted(className)).sort().map((className) => `.${className} is styled in board.css but no component emits it`),
  ];
}

/** Every selector of the stylesheet's rules that names a class of the package, once, in the stylesheet's order; comments are prose. */
function packageClassSelectorsOf(stylesheetText: string): readonly string[] {
  const withoutComments = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...withoutComments.matchAll(/([^{};]+)\{/g)]
    .map(([, prelude = '']) => prelude.trim())
    .filter((prelude) => !prelude.startsWith('@'))
    .flatMap((prelude) => prelude.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')))
    .filter((selector) => selector.includes(`.${DESIGN_SYSTEM_CLASS_PREFIX}`));
  return [...new Set(selectors)];
}

function hostOverrideSentencesOf(selectors: readonly string[], allowedOverrides: readonly string[]): string[] {
  return [
    ...selectors.filter((selector) => !allowedOverrides.includes(selector))
      .map((selector) => `board.css restyles a class of design-system/ in "${selector}": give the component a prop or a variant instead`),
    ...allowedOverrides.filter((selector) => !selectors.includes(selector))
      .map((selector) => `"${selector}" is a listed host override that board.css no longer has: remove it from the list`),
  ];
}

function isShippingModule(path: string): boolean {
  return (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.spec.ts') && !path.endsWith('.dom.tsx') && !path.split('/').includes('testing');
}

function shippingModuleSources(folder: string): ComponentSource[] {
  return [...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: folder })]
    .filter(isShippingModule)
    .sort()
    .map((path) => ({ path, text: readFileSync(join(folder, path), 'utf8') }));
}

/**
 * Every string of shipping Bridge code that names a class of the package: a selector a query takes as well as a `className`. The Bridge
 * reaches an element of a component through the ref prop the component offers, never through its class.
 */
function packageClassStringSentencesOf(sources: readonly ComponentSource[]): string[] {
  const sentences: string[] = [];
  for (const { path, text } of sources) {
    const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) && node.text.includes(DESIGN_SYSTEM_CLASS_PREFIX)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        sentences.push(`${path}:${String(line)} names "${node.text}", a class of design-system/: use the component's ref prop, never its class`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return sentences;
}

/** Every keyframe of the package that a `board.css` `animation` or `animation-name` names, once, in order; comments are prose. */
function packageKeyframesNamedOf(stylesheetText: string): readonly string[] {
  const withoutComments = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...withoutComments.matchAll(/animation(?:-name)?\s*:([^;}]*)/g)]
    .flatMap(([, value = '']) => [...value.matchAll(/(?<![\w-])design-system-[\w-]+/g)].map(([name]) => name));
  return [...new Set(names)];
}

function packageKeyframeSentencesOf(names: readonly string[]): string[] {
  return names.map((name) => `board.css animates with ${name}, a keyframe of design-system/: define a bridge-… keyframe of its own`);
}

const SOURCES = shippingComponentSources(BRIDGE_FOLDER);
const MODULE_SOURCES = shippingModuleSources(BRIDGE_FOLDER);
const EMITTED = emittedClassesOf(SOURCES);
const BOARD_STYLESHEET = readFileSync(BOARD_STYLESHEET_PATH, 'utf8');
const STYLED = styledClassesOf(BOARD_STYLESHEET);
const PACKAGE_CLASSES: PackageClasses = {
  emitted: emittedClassesOf(shippingComponentSources(DESIGN_SYSTEM_FOLDER)).classNames,
  styled:  new Set([...new Bun.Glob('**/*.css').scanSync({ cwd: DESIGN_SYSTEM_FOLDER })]
    .flatMap((path) => [...styledClassesOf(readFileSync(join(DESIGN_SYSTEM_FOLDER, path), 'utf8'))])),
};

describe('the scan itself', () => {
  test('it reads the shipping components and the stylesheet, and finds a floor of classes in each', () => {
    expect(SOURCES.map(({ path }) => path)).toContain('shell/BridgeApp.tsx');
    expect(MODULE_SOURCES.map(({ path }) => path)).toEqual(expect.arrayContaining(['shell/BridgeApp.tsx', 'shell/CoveringPanel.ts']));
    expect(MODULE_SOURCES.some(({ path }) => path.endsWith('.spec.ts') || path.split('/').includes('testing'))).toBe(false);
    expect(SOURCES.some(({ path }) => path.endsWith('.dom.tsx'))).toBe(false);
    expect(EMITTED.classNames.size).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(STYLED.size).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(PACKAGE_CLASSES.emitted).toContain('design-system-button');
    expect(PACKAGE_CLASSES.styled).toContain('design-system-button');
  });
});

describe('the guard, planted in memory', () => {
  const planted = (text: string): EmittedClasses => emittedClassesOf([{ path: 'shell/Planted.tsx', text }]);

  const noPackageClasses: PackageClasses = { emitted: new Set(), styled: new Set() };

  test('an unstyled class, a dead rule and an unreadable className are each named', () => {
    expect(contractSentencesOf(planted('export const view = <p className="bridge-planted bridge-empty" />;'), new Set(['bridge-empty', 'bridge-dead']), noPackageClasses)).toEqual([
      '.bridge-planted is emitted but board.css does not style it',
      '.bridge-dead is styled in board.css but no component emits it',
    ]);
    expect(planted('export const view = (name: string) => <p className={name} />;').unreadable).toEqual(['shell/Planted.tsx:1']);
  });

  test('a package class in the Bridge\'s markup is refused, and one board.css names counts as emitted when the package emits it', () => {
    const packageClasses: PackageClasses = { emitted: new Set(['design-system-button']), styled: new Set(['design-system-button']) };
    const view = planted('export const view = <p className="design-system-button bridge-empty" />;');
    expect(contractSentencesOf(view, new Set(['bridge-empty', 'design-system-button', 'design-system-dead']), packageClasses)).toEqual([
      '.design-system-button is a class of design-system/: compose the package\'s component, never emit its class',
      '.design-system-dead is styled in board.css but no component emits it',
    ]);
  });

  test('a board.css selector that restyles a package class is refused unless listed, and a listed one board.css lost is named', () => {
    const stylesheet = `.bridge-tray > .design-system-button, .bridge-tray { gap: 4px; }
@media (max-width: 720px) { .bridge-tray .design-system-tag { margin: 0; } }
/* .bridge-prose .design-system-card */`;
    expect(packageClassSelectorsOf(stylesheet)).toEqual(['.bridge-tray > .design-system-button', '.bridge-tray .design-system-tag']);
    expect(hostOverrideSentencesOf(packageClassSelectorsOf(stylesheet), ['.bridge-tray .design-system-tag', '.bridge-gone > .design-system-card'])).toEqual([
      'board.css restyles a class of design-system/ in ".bridge-tray > .design-system-button": give the component a prop or a variant instead',
      '".bridge-gone > .design-system-card" is a listed host override that board.css no longer has: remove it from the list',
    ]);
  });

  test('a package class in any string of shipping code, a query\'s selector included, is refused; an import of the package is not', () => {
    const query = 'export const panelOf = (): Element | null => document.querySelector(\'.design-system-side-panel[data-width="detail"]\');';
    const template = 'export const scrollOf = (width: string) => `.design-system-side-panel[data-width="${width}"] .design-system-side-panel-scroll`;';
    const sources: ComponentSource[] = [
      { path: 'shell/Planted.ts', text: `import { Button } from 'design-system/Button';\n${query}` },
      { path: 'shell/PlantedTemplate.tsx', text: template },
    ];
    expect(packageClassStringSentencesOf(sources)).toEqual([
      'shell/Planted.ts:2 names ".design-system-side-panel[data-width="detail"]", a class of design-system/: use the component\'s ref prop, never its class',
      'shell/PlantedTemplate.tsx:1 names ".design-system-side-panel[data-width="", a class of design-system/: use the component\'s ref prop, never its class',
      'shell/PlantedTemplate.tsx:1 names ""] .design-system-side-panel-scroll", a class of design-system/: use the component\'s ref prop, never its class',
    ]);
    expect(packageClassStringSentencesOf([{ path: 'shell/Planted.ts', text: 'import { Button } from \'design-system/Button\';' }])).toEqual([]);
  });

  test('a board.css animation that names a keyframe of the package is refused, in the shorthand and in animation-name; a comment is prose', () => {
    const stylesheet = `.bridge-dot { animation: design-system-pulse var(--pulse-status) ease-in-out infinite; }
.bridge-card { animation-name: design-system-rise; }
.bridge-own { animation: bridge-pulse 1s infinite; }
/* .bridge-prose { animation: design-system-pop 1s; } */`;
    expect(packageKeyframeSentencesOf(packageKeyframesNamedOf(stylesheet))).toEqual([
      'board.css animates with design-system-pulse, a keyframe of design-system/: define a bridge-… keyframe of its own',
      'board.css animates with design-system-rise, a keyframe of design-system/: define a bridge-… keyframe of its own',
    ]);
  });

  test('a conditional between literals and a template without substitutions are read, and a comment is not a rule', () => {
    expect([...planted('export const view = (on: boolean) => <p className={on ? \'bridge-on\' : `bridge-off`} />;').classNames]).toEqual(['bridge-on', 'bridge-off']);
    expect([...styledClassesOf('/* .bridge-prose */ .bridge-rule { color: var(--ink); line-height: 1.45; }')]).toEqual(['bridge-rule']);
  });
});

describe('the components and board.css', () => {
  test('every emitted class is styled and every styled class is emitted', () => {
    expect(contractSentencesOf(EMITTED, STYLED, PACKAGE_CLASSES)).toEqual([]);
  });

  test('no string of shipping Bridge code names a class of the package', () => {
    expect(packageClassStringSentencesOf(MODULE_SOURCES)).toEqual([]);
  });

  test('board.css animates with keyframes of its own, never one of the package', () => {
    expect(packageKeyframeSentencesOf(packageKeyframesNamedOf(BOARD_STYLESHEET))).toEqual([]);
  });

  test('no board.css selector restyles a class of the package but the listed host overrides', () => {
    expect(hostOverrideSentencesOf(packageClassSelectorsOf(BOARD_STYLESHEET), PACKAGE_CLASS_HOST_OVERRIDES)).toEqual([]);
  });
});
