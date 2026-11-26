/**
 * The `status --json` and Hephaestus state fields of the installed surface, which `cli/InstalledSurface.spec.ts` cannot read from the help
 * screen: the CLI's side is the keys of both `status --json` documents over a real tracker holding every kind of entry, with the top-level
 * keys of Hephaestus's state document built on them. The frozen surface is compared whole here, so after an `INSTALL_VERSION` bump the
 * failure prints every kind to freeze.
 */
import {
  afterAll,
  beforeAll,
  expect,
  test
}                                                                             from 'bun:test';

import { requireWorkspace }                       from '../src/services/tracker/Workspace.ts';
import { nativePlatformPorts }                    from '../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                         from '../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                 from '../src/testing/TalosChildReadings.ts';
import { describeWhenGitIsRecorded }              from '../src/testing/ToolGuard.ts';
import { boardStoreIn }                           from './BoardStoreOf.ts';
import { helpText }                               from './HelpText.ts';
import { INSTALL_VERSION }                        from './constants/InstallVersion.ts';
import { readBoardState }                         from './hephaestus/routes/BoardStateReader.ts';
import { createCapturedCommandContext }           from './testing/CapturedCommandContext.ts';
import { runCommandLineWithHephaestusMoves }      from './testing/HephaestusTicketMoves.ts';
import { createInitializedRecordedGitRepository } from './testing/InitializedScratchRepository.ts';
import type { CliSurface }                        from './testing/InstalledSurfaceScan.ts';
import {
  cliSurfaceOf,
  frozenSurfaceTable,
  installedTextsByPath,
  namedSurfaceOf,
  SURFACE_KINDS,
  surfaceSentencesOf
}                                                                             from './testing/InstalledSurfaceScan.ts';
import { fileReadyTicketThrough } from './testing/ReadyTicketFiling.ts';

function keysOf(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

/** Every kind of entry both documents can hold: ready, grouped, held, in progress, paused, waiting on review, under one, settled, a running Hephaestus. */
async function statusDocumentKeysOfAFullBoard(repositoryDirectory: string): Promise<ReadonlySet<string>> {
  const run = async (commandLineArguments: readonly string[]): Promise<string> => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
    if (exitCode !== 0) throw new Error(`\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`);
    return context.outputText();
  };
  await run(['concurrency', '10']);
  for (const title of ['Example build', 'Example review', 'Example waiting review', 'Example paused build', 'Example held', 'Example ready', 'Example settled']) {
    await fileReadyTicketThrough(run, (output) => output, ['ticket', 'add', '--type', 'ticket', title]);
  }
  await run(['ticket', 'claim', '1', '--owner', 'opus', '--note', 'Example note']);
  await run(['ticket', 'claim', '2']);
  await run(['ticket', 'finish', '2', '--start-review', '--owner', 'opus']);
  await run(['ticket', 'claim', '3']);
  await run(['ticket', 'finish', '3']);
  await run(['ticket', 'claim', '4', '--note', 'Example paused note']);
  const pausedRowId = (JSON.parse(await run(['ticket', 'show', '4', '--json'])) as { task?: string | number }).task ?? '';
  await run(['task', 'pause', String(pausedRowId)]);
  await run(['ticket', 'hold', '5', '--reason', 'Example reason']);
  await fileReadyTicketThrough(run, (output) => output, ['ticket', 'add', '--type', 'ticket', 'Example grouped ready', '--group', 'example-group']);
  await run(['ticket', 'claim', '7']);
  await run(['ticket', 'finish', '7']);
  await run(['ticket', 'approve', '7']);
  await run(['ticket', 'deliver', '7']);
  await run(['unpause']);
  await run(['log', 'Example milestone']);
  const documents = [await run(['status', '--json']), await run(['status', '--json', '--full'])].map((text) => JSON.parse(text) as unknown);
  const hephaestusState = readBoardState({
    context:       createCapturedCommandContext({ currentDirectory: repositoryDirectory }),
    workspace:     requireWorkspace(repositoryDirectory),
    boardReads:    boardStoreIn(createCapturedCommandContext({ currentDirectory: repositoryDirectory }), requireWorkspace(repositoryDirectory)).reads,
    boardChildren: talosChildReadingsWith(nativePlatformPorts(), requireWorkspace(repositoryDirectory).trackerDirectory),
    notices:       () => [],
    hephaestus:    () => ({
      state: 'down', url: null, generation: null, codeVersion: 'example', installVersion: INSTALL_VERSION, restartWarning: null, unreadableFiles: []
    }),
  }).state;
  return new Set([...documents.flatMap(keysOf), ...Object.keys(hephaestusState)]);
}

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const FROZEN_TABLE = frozenSurfaceTable();

const INSTALLED_TEXTS = installedTextsByPath();

let repositoryDirectory = '';

let cliSurface: CliSurface = { commands: new Set(), flags: new Set(), statusJsonFields: new Set() };

const recordedGit = useRecordedGit();

beforeAll(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('installed-surface', ['--project', 'Example Agency', '--no-hooks'], () => FROZEN_NOW, recordedGit);
  cliSurface = cliSurfaceOf(helpText('posix-shell'), await statusDocumentKeysOfAFullBoard(repositoryDirectory));
});

afterAll(() => {
  if (repositoryDirectory !== '') removeScratchDirectory(repositoryDirectory);
});

function sentencesWith(plantedCliSurface: CliSurface): readonly string[] {
  return surfaceSentencesOf(namedSurfaceOf(INSTALLED_TEXTS, plantedCliSurface), plantedCliSurface, FROZEN_TABLE, INSTALL_VERSION, SURFACE_KINDS);
}

describeWhenGitIsRecorded('the status fields', () => {
  /** A floor well under today's count, to fail a scan that read the wrong files or a board that held too little. */
  test('the scan finds status fields in the installed files and in both documents of the CLI', () => {
    expect(namedSurfaceOf(INSTALLED_TEXTS, cliSurface).statusJsonFields.length, 'status fields named').toBeGreaterThanOrEqual(10);
    expect(cliSurface.statusJsonFields).toContain('hephaestusState');
    expect(cliSurface.statusJsonFields, 'a top-level key of Hephaestus\'s state document').toContain('mergeQueue');
  });

  test(`the frozen surface holds for INSTALL_VERSION ${INSTALL_VERSION}: the CLI still has every name frozen, and every name installed is frozen`, () => {
    expect(sentencesWith(cliSurface)).toEqual([]);
  });

  test('a status field the installed files name, removed from the CLI, fails naming the rule', () => {
    const withoutJobs = { ...cliSurface, statusJsonFields: new Set([...cliSurface.statusJsonFields].filter((field) => field !== 'jobs')) };
    expect(sentencesWith(withoutJobs)).toEqual([`the files installed at INSTALL_VERSION ${INSTALL_VERSION} name the \`status --json\` field `
      + 'jobs, which the CLI no longer has: an installed file became wrong, so bump INSTALL_VERSION in cli/constants/InstallVersion.ts '
      + '(.claude/rules/forge.md, Generated and installed files) and freeze the new version\'s surface']);
  });
});
