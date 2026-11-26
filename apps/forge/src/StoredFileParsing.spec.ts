/**
 * No service parses a stored file itself: it hands a location to the ingestion class of the format in `src/adapters/`. The only JSON parses
 * left in `src/services/` read something that is no stored file, each allowlisted with what it reads. The scan proves it saw the services,
 * the allowlist is exact both ways, and each form of the call is planted. Comments, specs and testing folders are not scanned.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                                       from './testing/ImportGraph.ts';
import { memoisedPerSource, programTypeScriptSources, type RepositorySource } from './testing/RepositorySources.ts';

interface ParsingReport {
  /** `<path>: <trimmed line>`, one per scanned parse the allowlist does not hold. */
  readonly violations:       readonly string[];
  readonly unusedAllowances: readonly string[];
}

const SCANNED_FOLDER = 'src/services/';

const JSON_PARSE_PATTERN = /\bJSON\s*(?:\.\s*parse|\[\s*['"]parse['"]\s*\])\s*\(/;

/** `<path>: <trimmed line>`, sorted by path, with what each parse reads. */
const ALLOWED_PARSES: Readonly<Record<string, string>> = {
  'src/services/hephaestus/HephaestusServer.ts: body = JSON.parse(new TextDecoder().decode(boundedBody.bytes));':                                 'The body of an HTTP request.',
  'src/services/hephaestus/InstallChangeWatch.ts: const parsed = JSON.parse(standardOutput) as Partial<Record<keyof ProgramVersions, unknown>>;': 'The output of a process.',
  'src/services/hephaestus/Restart.ts: const parsed = JSON.parse(lastLine) as Record<string, unknown> | null;':                                   'The output of a process.',
  'src/services/hephaestus/TalosConnection.ts: const parsed: unknown = JSON.parse(line);':
    'A line Talos sends on the socket.',
};

const ALLOWED_LINES = Object.keys(ALLOWED_PARSES);

function isScannedShippingCode(path: string): boolean {
  return path.startsWith(SCANNED_FOLDER) && !/\.spec\.tsx?$/.test(path) && !path.includes('/testing/');
}

function isCommentLine(line: string): boolean {
  return ['//', '/*', '*'].some((marker) => line.startsWith(marker));
}

const parseLinesOfSource = memoisedPerSource((source): readonly string[] => source.text.split('\n')
  .map((line) => line.trim())
  .filter((line) => !isCommentLine(line) && JSON_PARSE_PATTERN.test(line))
  .map((line) => `${source.path}: ${line}`));

function parsingReportOf(sources: readonly RepositorySource[], allowedLines: readonly string[]): ParsingReport {
  const found = sources.filter((source) => isScannedShippingCode(source.path)).flatMap(parseLinesOfSource);
  return {
    violations:       found.filter((line, index) => !allowedLines.includes(line) || found.indexOf(line) !== index),
    unusedAllowances: allowedLines.filter((line) => !found.includes(line)),
  };
}

const SOURCES = programTypeScriptSources(repositoryRootOfThisCheckout());

function violationsOfPlanted(path: string, plantedLine: string): readonly string[] {
  return parsingReportOf([{ path, text: `${plantedLine}\n` }], []).violations;
}

describe('the scan saw the services', () => {
  test('it reads the shipping services and finds the allowlisted parses there', () => {
    const scannedPaths = SOURCES.map((source) => source.path).filter(isScannedShippingCode);
    expect(scannedPaths.length).toBeGreaterThan(100);
    expect(scannedPaths).toEqual(expect.arrayContaining(['src/services/hephaestus/HephaestusServer.ts', 'src/services/hephaestus/TalosConnection.ts']));
  });

  test('every parse in a service is allowlisted, and every allowlist entry is found', () => {
    expect(parsingReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('the allowlist is sorted by path', () => {
    const allowedPaths = ALLOWED_LINES.map((line) => line.slice(0, line.indexOf(':')));
    expect(allowedPaths).toEqual([...allowedPaths].sort());
  });
});

describe('the allowlist is exact both ways', () => {
  const allowedEntry = 'src/services/hephaestus/Planted.ts: const parsed: unknown = JSON.parse(line);';

  test('removing an entry leaves its line a violation', () => {
    const removedEntry = ALLOWED_LINES[0] ?? '';
    expect(parsingReportOf(SOURCES, ALLOWED_LINES.slice(1))).toEqual({ violations: [removedEntry], unusedAllowances: [] });
  });

  test('an entry nothing uses is named', () => {
    expect(parsingReportOf(SOURCES, [...ALLOWED_LINES, allowedEntry])).toEqual({ violations: [], unusedAllowances: [allowedEntry] });
  });

  test('a second copy of an allowed line in its own file is a violation', () => {
    const doubledSite = { path: 'src/services/hephaestus/Planted.ts', text: 'const parsed: unknown = JSON.parse(line);\nconst parsed: unknown = JSON.parse(line);\n' };
    expect(parsingReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [allowedEntry], unusedAllowances: [] });
  });
});

describe('the guard names each form, planted in memory', () => {
  const plantedPath = 'src/services/hephaestus/Planted.ts';

  test.each([
    ['a parse of a read file', 'const start = JSON.parse(readFileSync(path, \'utf8\')) as JobStart;'],
    ['a parse with spaces around the dot', 'const start = JSON . parse (text);'],
    ['a parse through a bracket', 'const start = JSON[\'parse\'](text);'],
  ])('%s', (_formName, plantedLine) => {
    expect(violationsOfPlanted(plantedPath, plantedLine)).toEqual([`${plantedPath}: ${plantedLine}`]);
  });

  test('a comment, a spec, a testing folder and a file outside the services are not scanned', () => {
    const plantedLine = 'const parsed: unknown = JSON.parse(text);';
    expect(violationsOfPlanted(plantedPath, `// ${plantedLine}`)).toEqual([]);
    expect(violationsOfPlanted(plantedPath, ` * ${plantedLine}`)).toEqual([]);
    expect(violationsOfPlanted('src/services/hephaestus/Planted.spec.ts', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('src/services/hephaestus/testing/Planted.ts', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('src/adapters/planted/PlantedIngestion.ts', plantedLine)).toEqual([]);
  });

  test('a name that only resembles the call passes', () => {
    expect(violationsOfPlanted(plantedPath, 'const parsed = StoredValueUtil.parsedJsonOf(text);')).toEqual([]);
    expect(violationsOfPlanted(plantedPath, 'const text = JSON.stringify(value);')).toEqual([]);
  });
});
