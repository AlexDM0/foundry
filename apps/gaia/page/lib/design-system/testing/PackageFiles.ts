/**
 * The files of the package as its own guards read them: each path relative to the package folder, with forward slashes. The module
 * specifiers of a source come from its syntax tree, so a comment, a string or JSX text that names an import is not one, while `import type`,
 * a re-export, `import(…)` and `require(…)` are. Test-only.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import ts from 'typescript';

export const PACKAGE_FOLDER = join(import.meta.dir, '..');

/** The component layers, lowest first: a component imports only the components of a lower layer. */
export const COMPONENT_LAYERS = ['atoms', 'molecules', 'organisms'] as const;

export type ComponentLayer = (typeof COMPONENT_LAYERS)[number];

export interface PackageFile {
  readonly path: string;
  readonly text: string;
}

export function packageFilesMatching(pattern: string): PackageFile[] {
  return [...new Bun.Glob(pattern).scanSync({ cwd: PACKAGE_FOLDER })]
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !path.split('/').includes('node_modules'))
    .sort()
    .map((path) => ({ path, text: readFileSync(join(PACKAGE_FOLDER, path), 'utf8') }));
}

export function isTestCode(path: string): boolean {
  return path.endsWith('.spec.ts') || path.endsWith('.dom.tsx') || path.startsWith('testing/');
}

/** The layer folder a path sits in, or null outside the three layers. */
export function layerOf(path: string): ComponentLayer | null {
  const [folder] = path.split('/');
  return COMPONENT_LAYERS.find((layer) => layer === folder) ?? null;
}

/** A Storybook story beside its component: it shows the component, and never ships. */
export function isStory(path: string): boolean {
  return path.endsWith('.stories.tsx');
}

/** A component that ships: a `.tsx` file that is not a DOM spec or a story, outside the testing folder. */
export function isShippingComponent(path: string): boolean {
  return path.endsWith('.tsx') && !isTestCode(path) && !isStory(path);
}

/** The module specifiers a source imports, in source order. */
export function moduleSpecifiersOf(file: PackageFile): readonly string[] {
  const sourceFile = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const [firstArgument] = node.arguments;
      if (firstArgument !== undefined && ts.isStringLiteralLike(firstArgument)) specifiers.push(firstArgument.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

/** The package-relative path a relative specifier names; a path that climbs out of the package starts with `../`. */
export function targetPathOf(fromPath: string, specifier: string): string {
  const segments: string[] = [];
  for (const segment of `${fromPath.slice(0, fromPath.lastIndexOf('/') + 1)}${specifier}`.split('/')) {
    if (segment === '..') {
      if (segments.length === 0 || segments.at(-1) === '..') segments.push('..');
      else segments.pop();
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment);
    }
  }
  return segments.join('/');
}
