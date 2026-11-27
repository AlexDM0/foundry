/**
 * package.json cannot import the product's names, so this test holds it to them: its name and its one bin key are the program, or a
 * `bun link` of this checkout would replace the link of the other program. An architecture test at the repository root imports nothing of the tree, so
 * the names are read from the constant's source text: each names set by its `PROGRAM`, and `PRODUCT_NAMES` by the set it is assigned.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from '../src/testing/ImportGraph.ts';

interface PackageDocument {
  readonly name?: unknown;
  readonly bin?:  Record<string, unknown>;
}

interface ProgramNames {
  readonly program:         string;
  readonly originalProgram: string;
}

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();

const PRODUCT_NAMES_SOURCE = readFileSync(join(REPOSITORY_ROOT, 'src', 'shared', 'constants', 'ProductNames.ts'), 'utf8');

const PACKAGE_DOCUMENT = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8')) as PackageDocument;

const NAMES_SET_PATTERN = /export const (\w+): Readonly<ProductNames> = \{[^}]*?\bPROGRAM: +'([^']+)'/g;

const CURRENT_NAMES_PATTERN = /export const PRODUCT_NAMES: Readonly<ProductNames> = (\w+);/;

function programNamesOf(source: string): ProgramNames {
  const programBySetName = new Map([...source.matchAll(NAMES_SET_PATTERN)].map(([, setName = '', program = '']) => [setName, program]));
  const [, currentSetName = ''] = CURRENT_NAMES_PATTERN.exec(source) ?? [];
  return { program: programBySetName.get(currentSetName) ?? '', originalProgram: programBySetName.get('ORIGINAL_PRODUCT_NAMES') ?? '' };
}

function packageIsNamedTheProgram(packageDocument: PackageDocument, program: string): boolean {
  return packageDocument.name === program && JSON.stringify(Object.keys(packageDocument.bin ?? {})) === JSON.stringify([program]);
}

test('package.json is named the program, and its one bin key is the program', () => {
  const { program, originalProgram } = programNamesOf(PRODUCT_NAMES_SOURCE);
  expect(program.length).toBeGreaterThan(0);
  expect(originalProgram.length).toBeGreaterThan(0);
  expect(PACKAGE_DOCUMENT.name).toBe(program);
  expect(Object.keys(PACKAGE_DOCUMENT.bin ?? {})).toEqual([program]);
});

test('the test fails on a package named after the other program, planted in memory', () => {
  const { program, originalProgram } = programNamesOf(PRODUCT_NAMES_SOURCE);
  const otherProgram = program === originalProgram ? `${program}-v2` : originalProgram;
  expect(otherProgram).not.toBe(program);
  expect(packageIsNamedTheProgram({ name: otherProgram, bin: { [otherProgram]: 'agent-progress.ts' } }, program)).toBe(false);
  expect(packageIsNamedTheProgram({ name: program, bin: { [program]: 'agent-progress.ts', [otherProgram]: 'agent-progress.ts' } }, program)).toBe(false);
  expect(packageIsNamedTheProgram({ name: program, bin: { [program]: 'agent-progress.ts' } }, program)).toBe(true);
});

test('the source read follows PRODUCT_NAMES to the set it is assigned, planted in memory', () => {
  const plantedSource = 'export const ORIGINAL_PRODUCT_NAMES: Readonly<ProductNames> = {\n  PROGRAM: \'example-tool\',\n};\n'
    + 'export const SIDE_BY_SIDE_PRODUCT_NAMES: Readonly<ProductNames> = {\n  PROGRAM: \'example-tool-v2\',\n};\n';
  expect(programNamesOf(`${plantedSource}export const PRODUCT_NAMES: Readonly<ProductNames> = SIDE_BY_SIDE_PRODUCT_NAMES;\n`))
    .toEqual({ program: 'example-tool-v2', originalProgram: 'example-tool' });
  expect(programNamesOf(`${plantedSource}export const PRODUCT_NAMES: Readonly<ProductNames> = ORIGINAL_PRODUCT_NAMES;\n`))
    .toEqual({ program: 'example-tool', originalProgram: 'example-tool' });
});
