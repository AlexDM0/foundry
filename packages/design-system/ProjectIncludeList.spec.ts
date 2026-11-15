/**
 * The package's projects compile only its own folder, so the folder moves to its own repository unchanged: the `include` list of
 * `tsconfig.json` is the folder by one glob per source extension, and `tsconfig.spec.json` names those globs and nothing outside the folder.
 * That no module of the folder imports outside it is `PackageIsolation.spec.ts`'s. Each form is planted once in memory.
 */
import { describe, expect, test } from 'bun:test';

const PACKAGE_FOLDER = import.meta.dir;
const OWN_FOLDER_GLOBS: readonly string[] = ['./**/*.ts', './**/*.tsx'];
const SHIPPING_CONFIGURATION = 'tsconfig.json';
const SPEC_CONFIGURATION = 'tsconfig.spec.json';

interface ProjectConfiguration {
  readonly extends?: string;
  readonly include?: readonly string[];
}

/** A project with no list of its own takes the one of the configuration it extends, as TypeScript reads it. */
async function includeEntriesOf(configurationFileName: string): Promise<readonly string[]> {
  const configuration = Bun.JSONC.parse(await Bun.file(`${PACKAGE_FOLDER}/${configurationFileName}`).text()) as ProjectConfiguration;
  if (configuration.include !== undefined) return configuration.include;
  return configuration.extends === undefined ? [] : includeEntriesOf(configuration.extends);
}

function isInsideThePackage(entry: string): boolean {
  return !entry.startsWith('/') && !entry.split('/').includes('..');
}

function includeListSentencesOf(configurationFileName: string, includeEntries: readonly string[]): readonly string[] {
  return [
    ...OWN_FOLDER_GLOBS.filter((glob) => !includeEntries.includes(glob))
      .map((glob) => `${configurationFileName} does not list ${glob}, the package's own folder: add it to the include list`),
    ...includeEntries.filter((entry) => !isInsideThePackage(entry))
      .map((entry) => `${configurationFileName} lists ${entry}, outside the package's folder: the package compiles nothing of another`),
  ];
}

test('tsconfig.json lists only the package\'s own folder, by one glob per source extension', async () => {
  expect(await includeEntriesOf(SHIPPING_CONFIGURATION)).toEqual([...OWN_FOLDER_GLOBS]);
});

test('tsconfig.spec.json lists the package\'s own folder and nothing outside it', async () => {
  expect(includeListSentencesOf(SPEC_CONFIGURATION, await includeEntriesOf(SPEC_CONFIGURATION))).toEqual([]);
});

describe('the guard still names each form, planted in memory', () => {
  test('a file outside the package added to the list, by a relative or an absolute path', () => {
    expect(includeListSentencesOf(SHIPPING_CONFIGURATION, [...OWN_FOLDER_GLOBS, '../../apps/host/PlantedValue.ts', '/planted/PlantedValue.ts'])).toEqual([
      'tsconfig.json lists ../../apps/host/PlantedValue.ts, outside the package\'s folder: the package compiles nothing of another',
      'tsconfig.json lists /planted/PlantedValue.ts, outside the package\'s folder: the package compiles nothing of another',
    ]);
  });

  test('a glob of the package\'s own folder removed from the list', () => {
    expect(includeListSentencesOf(SHIPPING_CONFIGURATION, ['./**/*.ts'])).toEqual([
      'tsconfig.json does not list ./**/*.tsx, the package\'s own folder: add it to the include list',
    ]);
  });
});
