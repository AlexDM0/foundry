/**
 * The `status --json` and Overseer state fields of the installed surface, which `cli/InstalledSurface.spec.ts` cannot read from the help
 * screen: the CLI's side is the keys of both `status --json` documents over a real tracker holding every kind of entry, with the top-level
 * keys of the Overseer's state document built on them. The frozen surface is compared whole here, so after an `INSTALL_VERSION` bump the
 * failure prints every kind to freeze.
 */
import {
  afterAll,
  beforeAll,
  expect,
  test
}                                                                             from 'bun:test';
import { requireWorkspace }                                                   from '../src/services/tracker/Workspace.ts';
import { createScratchGitRepository, gitIsAvailable, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent }                                           from '../src/testing/ToolGuard.ts';
import { helpText }                                                           from './HelpText.ts';
import { INSTALL_VERSION }                                                    from './constants/InstallVersion.ts';
import { readBoardState }                                                     from './overseer/routes/BoardStateReader.ts';
import { createCapturedCommandContext }                                       from './testing/CapturedCommandContext.ts';
import type { CliSurface }                                                    from './testing/InstalledSurfaceScan.ts';
import {
  cliSurfaceOf,
  frozenSurfaceTable,
  installedTextsByPath,
  namedSurfaceOf,
  SURFACE_KINDS,
  surfaceSentencesOf
}                                                                             from './testing/InstalledSurfaceScan.ts';
import { runCommandLineWithOverseerMoves } from './testing/OverseerTicketMoves.ts';
import { fileReadyTicketThrough }          from './testing/ReadyTicketFiling.ts';

function keysOf(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

/** Every kind of entry both documents can hold: ready, grouped, held, in progress, paused, waiting on review, under one, settled, a running Overseer. */
async function statusDocumentKeysOfAFullBoard(repositoryDirectory: string): Promise<ReadonlySet<string>> {
  const run = async (commandLineArguments: readonly string[]): Promise<string> => {
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
    if (exitCode !== 0) throw new Error(`\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`);
    return context.outputText();
  };
  await run(['init', '--project', 'Example Agency', '--no-hooks']);
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
  await run(['oversee', 'resume']);
  await run(['log', 'Example milestone']);
  const documents = [await run(['status', '--json']), await run(['status', '--json', '--full'])].map((text) => JSON.parse(text) as unknown);
  const overseerState = readBoardState({
    context:   createCapturedCommandContext({ currentDirectory: repositoryDirectory }),
    workspace: requireWorkspace(repositoryDirectory),
    notices:   () => [],
    overseer:  () => ({
      state: 'down', url: null, generation: null, codeVersion: 'example', installVersion: INSTALL_VERSION, batonPassWarning: null
    }),
  }).state;
  return new Set([...documents.flatMap(keysOf), ...Object.keys(overseerState)]);
}

const FROZEN_TABLE = frozenSurfaceTable();

const INSTALLED_TEXTS = installedTextsByPath();

let repositoryDirectory = '';

let cliSurface: CliSurface = { commands: new Set(), flags: new Set(), statusJsonFields: new Set() };

beforeAll(async () => {
  if (!gitIsAvailable()) return;
  repositoryDirectory = createScratchGitRepository('installed-surface');
  cliSurface = cliSurfaceOf(helpText('posix-shell'), await statusDocumentKeysOfAFullBoard(repositoryDirectory));
});

afterAll(() => {
  if (repositoryDirectory !== '') removeScratchDirectory(repositoryDirectory);
});

function sentencesWith(plantedCliSurface: CliSurface): readonly string[] {
  return surfaceSentencesOf(namedSurfaceOf(INSTALLED_TEXTS, plantedCliSurface), plantedCliSurface, FROZEN_TABLE, INSTALL_VERSION, SURFACE_KINDS);
}

describeWhenGitIsPresent('the status fields', () => {
  /** A floor well under today's count, to fail a scan that read the wrong files or a board that held too little. */
  test('the scan finds status fields in the installed files and in both documents of the CLI', () => {
    expect(namedSurfaceOf(INSTALLED_TEXTS, cliSurface).statusJsonFields.length, 'status fields named').toBeGreaterThanOrEqual(10);
    expect(cliSurface.statusJsonFields).toContain('overseerState');
    expect(cliSurface.statusJsonFields, 'a top-level key of the Overseer\'s state document').toContain('mergeQueue');
  });

  test(`the frozen surface holds for INSTALL_VERSION ${INSTALL_VERSION}: the CLI still has every name frozen, and every name installed is frozen`, () => {
    expect(sentencesWith(cliSurface)).toEqual([]);
  });

  test('a status field the installed files name, removed from the CLI, fails naming the rule', () => {
    const withoutJobs = { ...cliSurface, statusJsonFields: new Set([...cliSurface.statusJsonFields].filter((field) => field !== 'jobs')) };
    expect(sentencesWith(withoutJobs)).toEqual([`the files installed at INSTALL_VERSION ${INSTALL_VERSION} name the \`status --json\` field `
      + 'jobs, which the CLI no longer has: an installed file became wrong, so bump INSTALL_VERSION in cli/constants/InstallVersion.ts '
      + '(CLAUDE.md, Generated and installed files) and freeze the new version\'s surface']);
  });
});
