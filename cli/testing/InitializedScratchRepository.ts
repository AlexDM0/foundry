/**
 * A scratch git repository `init` has already run in, copied from one template per init arguments and clock reading rather than built by
 * running `init` for every case.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync
} from 'node:fs';
import { basename, join, sep } from 'node:path';

import type { FakeGit }           from '../../src/testing/FakeGit.ts';
import type { RecordedGit }       from '../../src/testing/RecordedGit.ts';
import {
  createScratchCopyOf,
  createScratchDirectory,
  createScratchGitRepository,
  keptAsTemplateUntilTheRunEnds
} from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }               from '../Main.ts';
import { createCapturedCommandContext } from './CapturedCommandContext.ts';
import { INIT_IN_A_NEW_REPOSITORY }     from './RecordedGitStages.ts';

const GIT_DIRECTORY_NAME = '.git';

type EmptyRepositoryMaker = (prefix: string) => string;
interface InitOutcome {
  exitCode:  number;
  errorText: string;
}

type InitRunner = (runInit: () => Promise<InitOutcome>) => Promise<InitOutcome>;

/** A repository only as the files show it: git itself is never asked, its answers come from the recording. */
export function createRecordedGitRepository(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  mkdirSync(join(directory, GIT_DIRECTORY_NAME));
  return directory;
}

const initializedTemplates = new Map<string, string>();

/** A copy is exactly what `init` would have written in the copy's own directory only while no file `init` wrote names the directory. */
function requireNoFileNamesItsDirectory(templateDirectory: string): void {
  const directoryName = basename(templateDirectory);
  const filesNamingIt = readdirSync(templateDirectory, { recursive: true, encoding: 'utf8' })
    .filter((relativePath) => relativePath !== GIT_DIRECTORY_NAME && !relativePath.startsWith(`${GIT_DIRECTORY_NAME}${sep}`))
    .filter((relativePath) => statSync(join(templateDirectory, relativePath)).isFile())
    .filter((relativePath) => readFileSync(join(templateDirectory, relativePath), 'utf8').includes(directoryName));
  if (filesNamingIt.length > 0) throw new Error(`init wrote its directory into ${filesNamingIt.join(', ')}, so a copy of it would not be what init writes there.`);
}

async function initializedTemplateFor(
  initArguments: readonly string[], now: () => Date, emptyRepository: EmptyRepositoryMaker, initRunner: InitRunner = async (runInit) => runInit()
): Promise<string> {
  const templateKey      = JSON.stringify([emptyRepository.name, initArguments, now().toISOString()]);
  const existingTemplate = initializedTemplates.get(templateKey);
  if (existingTemplate !== undefined) return existingTemplate;
  const templateDirectory = keptAsTemplateUntilTheRunEnds(emptyRepository('initialized-repository-template'));
  const { exitCode, errorText } = await initRunner(async () => {
    const context = createCapturedCommandContext({ currentDirectory: templateDirectory, now });
    return { exitCode: await runCommandLine(['init', ...initArguments], context), errorText: context.errorText() };
  });
  if (exitCode !== 0) throw new Error(`\`agent-progress init ${initArguments.join(' ')}\` exited ${exitCode}: ${errorText}`);
  requireNoFileNamesItsDirectory(templateDirectory);
  initializedTemplates.set(templateKey, templateDirectory);
  return templateDirectory;
}

/** What `createScratchGitRepository` followed by `init <initArguments>` under the clock `now` leaves, in a directory of its own. */
export async function createInitializedScratchRepository(prefix: string, initArguments: readonly string[], now: () => Date): Promise<string> {
  return createScratchCopyOf(await initializedTemplateFor(initArguments, now, createScratchGitRepository), prefix);
}

/** The same behind `useFakeGit`, for a default spec: `fakeGit` makes the repository, and `init` reaches no real git. */
export async function createInitializedFakeGitRepository(prefix: string, initArguments: readonly string[], now: () => Date, fakeGit: FakeGit): Promise<string> {
  return createScratchCopyOf(await initializedTemplateFor(initArguments, now, fakeGit.createRepository), prefix);
}

/** The same behind `useRecordedGit`, for a default spec: `init` plays its recorded git answers, and no git process starts. */
export async function createInitializedRecordedGitRepository(
  prefix: string, initArguments: readonly string[], now: () => Date, recordedGit: RecordedGit
): Promise<string> {
  const initRunner: InitRunner = async (runInit) => recordedGit.playStage(INIT_IN_A_NEW_REPOSITORY, runInit);
  return createScratchCopyOf(await initializedTemplateFor(initArguments, now, createRecordedGitRepository, initRunner), prefix);
}
