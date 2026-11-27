/**
 * The props rule of `CONSTITUTION.md`: a component that takes more than eight required props passes a reviewer first. The TypeScript
 * checker reads each exported component's props type, so props from `extends`, an intersection and the most demanding member of a union
 * all count, and an optional prop never does. The spec only makes each such component visible: the list of reviewed components, each with
 * the use case the reviewer accepted, is exact both ways. The scan first proves it found the components of every layer, and each form is
 * planted in memory.
 */
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import {
  COMPONENT_LAYERS,
  PACKAGE_FOLDER,
  isShippingComponent,
  layerOf,
  packageFilesMatching,
  type PackageFile
} from '../testing/PackageFiles.ts';

const MOST_REQUIRED_PROPS_WITHOUT_REVIEW = 8;
/** Each component a reviewer let take more than eight required props, with the use case the reviewer accepted. */
const COMPONENTS_REVIEWED_OVER_THE_LIMIT: Readonly<Record<string, string>> = Object.freeze({});
const SMALLEST_COMPONENT_COUNT = 40;
const PASCAL_CASE_NAME = /^[A-Z][a-z]/;

interface ComponentRequiredProps {
  readonly component:     string;
  readonly path:          string;
  readonly requiredProps: number;
}

const FORWARD_SLASH_PACKAGE_FOLDER = PACKAGE_FOLDER.split('\\').join('/');
const SHARED_SOURCE_FILES = new Map<string, ts.SourceFile>();

function packageCompilerOptions(): ts.CompilerOptions {
  const configPath = `${FORWARD_SLASH_PACKAGE_FOLDER}/tsconfig.json`;
  const { config } = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, FORWARD_SLASH_PACKAGE_FOLDER);
  return { ...parsed.options, noEmit: true, incremental: false };
}

/** A program over the given package files, their text served from memory, so a planted file needs no disk. */
function programOver(sources: readonly PackageFile[]): ts.Program {
  const options = packageCompilerOptions();
  const host = ts.createCompilerHost(options, true);
  const textByAbsolutePath = new Map(sources.map((source) => [`${FORWARD_SLASH_PACKAGE_FOLDER}/${source.path}`, source.text]));
  const readFromDisk = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => textByAbsolutePath.has(fileName) || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => textByAbsolutePath.get(fileName) ?? ts.sys.readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const servedText = textByAbsolutePath.get(fileName);
    if (servedText !== undefined) return ts.createSourceFile(fileName, servedText, languageVersion, true);
    const shared = SHARED_SOURCE_FILES.get(fileName);
    if (shared !== undefined) return shared;
    const read = readFromDisk(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    if (read !== undefined) SHARED_SOURCE_FILES.set(fileName, read);
    return read;
  };
  return ts.createProgram([...textByAbsolutePath.keys()], options, host);
}

/** The required props a caller must set; a union asks for those of its most demanding member. */
function requiredPropCountOf(propsType: ts.Type, checker: ts.TypeChecker): number {
  if (propsType.isUnion()) return Math.max(0, ...propsType.types.map((member) => requiredPropCountOf(member, checker)));
  return checker.getPropertiesOfType(propsType).filter((property) => (property.flags & ts.SymbolFlags.Optional) === 0).length;
}

function componentsOf(sources: readonly PackageFile[]): readonly ComponentRequiredProps[] {
  const componentSources = sources.filter((source) => layerOf(source.path) !== null && isShippingComponent(source.path));
  const program = programOver(componentSources);
  const checker = program.getTypeChecker();
  return componentSources.flatMap((source) => {
    const sourceFile = program.getSourceFile(`${FORWARD_SLASH_PACKAGE_FOLDER}/${source.path}`);
    const moduleSymbol = sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
    if (sourceFile === undefined || moduleSymbol === undefined) return [];
    return checker.getExportsOfModule(moduleSymbol).flatMap((exported): ComponentRequiredProps[] => {
      const symbol = (exported.flags & ts.SymbolFlags.Alias) === 0 ? exported : checker.getAliasedSymbol(exported);
      if (!PASCAL_CASE_NAME.test(exported.name) || (symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable)) === 0) return [];
      const [signature] = checker.getTypeOfSymbolAtLocation(symbol, sourceFile).getCallSignatures();
      if (signature === undefined) return [];
      const [propsParameter] = signature.getParameters();
      const requiredProps = propsParameter === undefined
        ? 0
        : requiredPropCountOf(checker.getTypeOfSymbolAtLocation(propsParameter, propsParameter.valueDeclaration ?? sourceFile), checker);
      return [{ component: exported.name, path: source.path, requiredProps }];
    });
  }).sort((a, b) => a.component.localeCompare(b.component));
}

function requiredPropsSentencesOf(components: readonly ComponentRequiredProps[], reviewed: Readonly<Record<string, string>>): readonly string[] {
  const componentSentences = components.flatMap(({ component, path, requiredProps }): string[] => {
    const isReviewed = Object.hasOwn(reviewed, component);
    if (requiredProps > MOST_REQUIRED_PROPS_WITHOUT_REVIEW && !isReviewed) {
      return [`${component} (${path}) takes ${requiredProps} required props, more than ${MOST_REQUIRED_PROPS_WITHOUT_REVIEW}: `
        + 'split it, or list it in COMPONENTS_REVIEWED_OVER_THE_LIMIT with the use case its reviewer accepted'];
    }
    if (requiredProps <= MOST_REQUIRED_PROPS_WITHOUT_REVIEW && isReviewed) {
      return [`${component} (${path}) takes ${requiredProps} required props, no more than ${MOST_REQUIRED_PROPS_WITHOUT_REVIEW}: `
        + 'take it off COMPONENTS_REVIEWED_OVER_THE_LIMIT'];
    }
    return [];
  });
  const listSentences = Object.entries(reviewed).flatMap(([component, useCase]): string[] => [
    ...components.some((found) => found.component === component) ? [] : [`${component} is in COMPONENTS_REVIEWED_OVER_THE_LIMIT, but no component has that name`],
    ...useCase.trim() === '' ? [`${component} is in COMPONENTS_REVIEWED_OVER_THE_LIMIT with no use case`] : [],
  ]);
  return [...componentSentences, ...listSentences].sort();
}

const COMPONENTS = componentsOf(packageFilesMatching('**/*.tsx'));

describe('the scan itself', () => {
  test('it finds the components of every layer, and counts their required props', () => {
    expect(COMPONENTS.length).toBeGreaterThanOrEqual(SMALLEST_COMPONENT_COUNT);
    for (const layer of COMPONENT_LAYERS) expect(COMPONENTS.some((found) => layerOf(found.path) === layer), `components in ${layer}/`).toBe(true);
    expect(COMPONENTS.find((found) => found.component === 'Icon')?.requiredProps).toBeGreaterThan(0);
    expect(COMPONENTS.map((found) => found.component)).toEqual(expect.arrayContaining(['Button', 'Tag', 'Dialog', 'MultipleChoiceQuestion']));
  });
});

test('every component over eight required props is one a reviewer accepted, and every accepted one is still over eight', () => {
  expect(requiredPropsSentencesOf(COMPONENTS, COMPONENTS_REVIEWED_OVER_THE_LIMIT)).toEqual([]);
});

describe('the test still counts and names each form, planted in memory', () => {
  const requiredPropNames = (count: number): string => Array.from({ length: count }, (_unused, i) => `readonly required${i}: string;`).join(' ');
  const PLANTED = componentsOf([
    {
      path: 'atoms/PlantedExtends.tsx',
      text: 'interface PlantedBaseProps { readonly first: string; readonly second?: string; }\n'
        + 'export interface PlantedExtendsProps extends PlantedBaseProps { readonly third: number; }\n'
        + 'export function PlantedExtends(props: PlantedExtendsProps) { return props.first; }\n'
        + 'export const PLANTED_LIST = [\'not a component\'];\nexport type PlantedWord = string;\n',
    },
    {
      path: 'molecules/PlantedIntersection.tsx',
      text: 'type PlantedIntersectionProps = { readonly first: string } & { readonly second: string; readonly third?: string };\n'
        + 'export const PlantedIntersection = (props: PlantedIntersectionProps) => props.first;\n',
    },
    {
      path: 'molecules/PlantedUnion.tsx',
      text: 'type PlantedUnionProps = { readonly label: string } & ({ readonly bold?: true; readonly muted?: never }\n'
        + '  | { readonly muted?: true; readonly bold?: never; readonly tone: string });\n'
        + 'export function PlantedUnion(props: PlantedUnionProps) { return props.label; }\n',
    },
    { path: 'organisms/PlantedBare.tsx', text: 'export function PlantedBare() { return null; }\n' },
    {
      path: 'organisms/PlantedCrowded.tsx',
      text: `export interface PlantedCrowdedProps { ${requiredPropNames(MOST_REQUIRED_PROPS_WITHOUT_REVIEW + 1)} readonly spare?: string; }\n`
        + 'export function PlantedCrowded(props: PlantedCrowdedProps) { return props.required0; }\n',
    },
  ]);

  test('props from extends, an intersection and the most demanding union member count, and optional props and non-components do not', () => {
    expect(PLANTED.map(({ component, requiredProps }) => [component, requiredProps])).toEqual([
      ['PlantedBare', 0],
      ['PlantedCrowded', MOST_REQUIRED_PROPS_WITHOUT_REVIEW + 1],
      ['PlantedExtends', 2],
      ['PlantedIntersection', 2],
      ['PlantedUnion', 2],
    ]);
  });

  test('a component over eight required props that no reviewer accepted is named', () => {
    expect(requiredPropsSentencesOf(PLANTED, {})).toEqual([
      'PlantedCrowded (organisms/PlantedCrowded.tsx) takes 9 required props, more than 8: '
        + 'split it, or list it in COMPONENTS_REVIEWED_OVER_THE_LIMIT with the use case its reviewer accepted',
    ]);
  });

  test('a listed component back at eight or fewer, a listed name no component has and a listing with no use case are named', () => {
    expect(requiredPropsSentencesOf(PLANTED, { PlantedCrowded: 'a planted use case', PlantedExtends: 'a planted use case', PlantedGone: ' ' })).toEqual([
      'PlantedExtends (atoms/PlantedExtends.tsx) takes 2 required props, no more than 8: take it off COMPONENTS_REVIEWED_OVER_THE_LIMIT',
      'PlantedGone is in COMPONENTS_REVIEWED_OVER_THE_LIMIT with no use case',
      'PlantedGone is in COMPONENTS_REVIEWED_OVER_THE_LIMIT, but no component has that name',
    ]);
  });

  test('a listed component over eight with its use case passes', () => {
    expect(requiredPropsSentencesOf(PLANTED, { PlantedCrowded: 'a planted use case' })).toEqual([]);
  });
});
