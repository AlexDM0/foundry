/**
 * A `src/lib/` package is a building block that knows nothing about its callers: no shipping file of it names forge's Hephaestus, a job, a
 * ticket or a tracker, in code or in a comment. Forge's own models live in `src/domain/`. The scan proves it read the packages, the
 * allowlist is exact both ways, and each form is planted. Specs and testing folders are not scanned: a spec may set a scene in forge's words.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                    from '../src/testing/ImportGraph.ts';
import { programTypeScriptSources, type RepositorySource } from '../src/testing/RepositorySources.ts';

const SCANNED_FOLDER = 'src/lib/';
const CALLER_WORD_PATTERN = /hephaestus|ticket|tracker|job/i;

/** The files that still name a caller, each listed until it no longer does. */
const ALLOWED_FILES: readonly string[] = [
  'src/lib/agent-launch/AgentAdapter.ts',
  'src/lib/agent-launch/AgentLaunchRequest.ts',
  'src/lib/agent-launch/LaunchEnvironment.ts',
  'src/lib/agent-launch/LaunchEnvironmentFor.ts',
  'src/lib/agent-launch/PosixLaunchEnvironment.ts',
  'src/lib/agent-launch/WindowsLaunchEnvironment.ts',
  'src/lib/agent-launch/WorkerProfile.ts',
  'src/lib/atomic-file/FileReplaceFor.ts',
  'src/lib/atomic-file/WindowsFileReplace.ts',
  'src/lib/claude-code/ClaudeCodeAdapter.ts',
  'src/lib/claude-code/ClaudeSessionSubagents.ts',
  'src/lib/claude-code/ClaudeStreamLines.ts',
  'src/lib/data-folders/DataFolders.ts',
  'src/lib/gate-confinement/LinuxBubblewrap.ts',
  'src/lib/gate-confinement/WindowsNoConfinement.ts',
  'src/lib/git/RepositoryRootWithoutGit.ts',
  'src/lib/process-identity/ProcessSupervision.ts',
  'src/lib/process-identity/SpawnOptionsFor.ts',
  'src/lib/process-identity/WindowsProcessIdentity.ts',
];

interface CallerNamesReport {
  /** `<path>:<line>: <trimmed line>`, one per line of a file the allowlist does not hold. */
  readonly violations:       readonly string[];
  readonly unusedAllowances: readonly string[];
}

function isScannedShippingFile(path: string): boolean {
  return path.startsWith(SCANNED_FOLDER) && !/\.spec\.tsx?$/.test(path) && !path.split('/').includes('testing');
}

function callerLinesOf(source: RepositorySource): readonly string[] {
  return source.text.split('\n').flatMap((line, index) => (CALLER_WORD_PATTERN.test(line) ? [`${source.path}:${index + 1}: ${line.trim()}`] : []));
}

function reportOf(sources: readonly RepositorySource[], allowedFiles: readonly string[]): CallerNamesReport {
  const naming = sources.filter((source) => isScannedShippingFile(source.path) && callerLinesOf(source).length > 0);
  return {
    violations:       naming.filter((source) => !allowedFiles.includes(source.path)).flatMap(callerLinesOf),
    unusedAllowances: allowedFiles.filter((path) => !naming.some((source) => source.path === path)),
  };
}

const SOURCES = programTypeScriptSources(repositoryRootOfThisCheckout());

describe('no src/lib/ package names its callers', () => {
  test('the scan reads the shipping files of the lib packages', () => {
    const scannedPaths = SOURCES.filter((source) => isScannedShippingFile(source.path)).map((source) => source.path);
    expect(scannedPaths.length).toBeGreaterThanOrEqual(50);
    expect(scannedPaths).toEqual(expect.arrayContaining(['src/lib/git/GitProcess.ts', 'src/lib/atomic-file/AtomicFile.ts']));
  });

  test('no shipping file of a lib package names Hephaestus, a job, a ticket or a tracker but those the allowlist holds, and each is used', () => {
    expect(reportOf(SOURCES, ALLOWED_FILES)).toEqual({ violations: [], unusedAllowances: [] });
  });
});

describe('each form is named, planted in memory', () => {
  const plantedPath = 'src/lib/planted/Planted.ts';

  test.each([
    ['a comment naming Hephaestus', '/** Hephaestus reads this. */'],
    ['an identifier naming a job', 'export const plantedJobId = 1;'],
    ['a string naming a ticket', 'export const planted = \'ticket\';'],
    ['a parameter naming a tracker', 'export function planted(trackerId: string): string { return trackerId; }'],
  ])('%s', (_formName, plantedLine) => {
    const planted = [...SOURCES, { path: plantedPath, text: `${plantedLine}\n` }];
    expect(reportOf(planted, ALLOWED_FILES).violations).toEqual([`${plantedPath}:1: ${plantedLine}`]);
  });

  test('a spec and a testing folder of a lib package are not scanned, nor a file outside src/lib/', () => {
    for (const path of ['src/lib/planted/Planted.spec.ts', 'src/lib/planted/testing/Planted.ts', 'src/domain/planted/Planted.ts']) {
      expect(reportOf([{ path, text: '// a ticket\n' }], []).violations).toEqual([]);
    }
  });

  test('an allowlisted file that no longer names a caller is named', () => {
    expect(reportOf([{ path: 'src/lib/planted/Planted.ts', text: 'export const planted = 1;\n' }], ['src/lib/planted/Planted.ts']).unusedAllowances)
      .toEqual(['src/lib/planted/Planted.ts']);
  });
});
