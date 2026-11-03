/**
 * What `agent-progress init` leaves behind and what a second one does, including the root discovered from inside a linked worktree.
 * Git plays recorded answers: each case names the calls `init` makes in its state, so a case also fails when `init` asks git otherwise.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { OperationRefusalWordingUtil }                    from '../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { PRODUCT_NAMES }                                  from '../../../src/shared/constants/ProductNames.ts';
import { type RecordedGitStage, useRecordedGit }          from '../../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { installedFilePathsIn }                           from '../../InstalledFiles.ts';
import { runCommandLine }                                 from '../../Main.ts';
import { INSTALL_VERSION }                                from '../../constants/InstallVersion.ts';
import { createCapturedCommandContext }                   from '../../testing/CapturedCommandContext.ts';
import { createRecordedGitRepository }                    from '../../testing/InitializedScratchRepository.ts';
import {
  COMMON_FOLDER_AT_THE_ROOT,
  commonFolderInAWorktreeOf,
  GIT_VERSION,
  INIT_IN_A_NEW_REPOSITORY,
  INIT_ON_AN_EXISTING_TRACKER,
  ROOT_OF_A_BARE
} from '../../testing/RecordedGitStages.ts';
import { repositoryFileContentsOf }     from '../../testing/RepositoryFileContents.ts';
import { storedProgressOf }             from '../../testing/StoredProgress.ts';
import { CLAUDE_MANAGED_BLOCK_MARKERS } from '../constants/ClaudeManagedBlockMarkers.ts';

const recordedGit = useRecordedGit();

/** `init --root` names the tracked directory, so it never asks git where the repository root is. */
const INIT_WITH_A_ROOT_OPTION: RecordedGitStage = INIT_IN_A_NEW_REPOSITORY.slice(1);

/** A fresh `init` cut short when it writes the skills: it checked the tracker and worktrees lines and nothing after. */
const INIT_CUT_SHORT_AT_THE_SKILLS: RecordedGitStage = INIT_IN_A_NEW_REPOSITORY.slice(0, 6);

/** A second `init` at the root reads the newer manifest after its version check and refuses. */
const INIT_REFUSED_BY_A_NEWER_MANIFEST: RecordedGitStage = [COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION];

const scratchDirectories: string[] = [];

function scratchRepository(): string {
  const repositoryDirectory = createRecordedGitRepository('init-command');
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

/** The context is made inside the stage, since its isolation check asks git for the root of a directory that holds no tracker. */
async function runIn(
  currentDirectory: string, commandLineArguments: readonly string[], stage: RecordedGitStage,
): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  return await recordedGit.playStage(stage, async () => {
    const context = createCapturedCommandContext({ currentDirectory });
    return { exitCode: await runCommandLine(commandLineArguments, context), context };
  });
}

describe('initialising a repository', () => {
  test('creates the tracker tree, ignores it and the worktrees folder, writes the session instructions and no CLAUDE.md, and renders a page', async () => {
    const repositoryDirectory = scratchRepository();

    const { exitCode, context } = await runIn(repositoryDirectory, ['init', '--project', 'Example Agency'], INIT_IN_A_NEW_REPOSITORY);
    expect(exitCode).toBe(0);

    expect(existsSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'))).toBe(true);
    expect(existsSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'tickets'))).toBe(true);
    // A3: with no Overseer running, the stub says so.
    expect(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.html'), 'utf8')).toContain('Overseer down');
    expect(readFileSync(join(repositoryDirectory, '.gitignore'), 'utf8')).toContain(`${PRODUCT_NAMES.DATA_FOLDER}/`);

    expect(readFileSync(join(repositoryDirectory, '.gitignore'), 'utf8')).toContain(`${PRODUCT_NAMES.WORKTREES_FOLDER}/`);
    expect(existsSync(join(repositoryDirectory, 'CLAUDE.md')), 'init never writes CLAUDE.md').toBe(false);

    expect(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'), 'utf8')).toContain('Example Agency');
    expect(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'session-instructions.md'), 'utf8')).toStartWith('## Progress tracking');
    expect(existsSync(installedFilePathsIn(repositoryDirectory).assistantDefault)).toBe(true);
    expect(existsSync(installedFilePathsIn(repositoryDirectory).reference)).toBe(true);
    expect(context.outputText()).toContain('.gitignore:');
    expect(context.outputText()).toContain('progress.html');
    expect(context.errorText()).toBe('');
  });

  // A new tracker's log starts empty, so a log left from a removed tracker is never adopted as its history.
  test('a fresh init empties a log.jsonl left from a removed tracker', async () => {
    const repositoryDirectory = scratchRepository();
    const logFilePath         = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl');
    mkdirSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
    writeFileSync(logFilePath, '{"at":"2026-09-18T08:00:00+02:00","kind":"note","fields":{"text":"A line from a removed tracker"}}\n');

    const { exitCode, context } = await runIn(repositoryDirectory, ['init', '--project', 'Example Agency'], INIT_IN_A_NEW_REPOSITORY);
    expect(exitCode).toBe(0);

    expect(context.outputText()).not.toContain('already initialised');
    expect(readFileSync(logFilePath, 'utf8')).toBe('');
  });

  test('a ticket file left from a removed tracker that will not parse is the first line on standard error, and init still exits 0', async () => {
    const repositoryDirectory = scratchRepository();
    const ticketsDirectory    = join(realpathSync(repositoryDirectory), PRODUCT_NAMES.DATA_FOLDER, 'tickets');
    const ticketFilePath      = join(ticketsDirectory, '001-broken-by-hand.md');
    mkdirSync(ticketsDirectory, { recursive: true });
    writeFileSync(ticketFilePath, 'no frontmatter here\n');

    const { exitCode, context } = await runIn(repositoryDirectory, ['init', '--project', 'Example Agency'], INIT_IN_A_NEW_REPOSITORY);
    expect(exitCode).toBe(0);

    expect(context.errorText().split('\n')[0]).toBe(`Ticket file ignored: ${ticketFilePath} (line 1): the first line must be the frontmatter fence \`---\``);
  });

  test('the project name defaults to the directory the tracker is in', async () => {
    const repositoryDirectory = scratchRepository();

    await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY);

    const stored = storedProgressOf(repositoryDirectory);
    expect(repositoryDirectory.endsWith(stored.project)).toBe(true);
  });

  // It goes in the local settings file, which is per-user and stays out of git, and which a job's `--setting-sources project` never loads.
  test('writes the SessionStart entry into .claude/settings.local.json by default, leaving the shared settings file alone', async () => {
    const repositoryDirectory = scratchRepository();

    const { exitCode, context } = await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY);
    expect(exitCode).toBe(0);

    const settings = JSON.parse(readFileSync(join(repositoryDirectory, '.claude', 'settings.local.json'), 'utf8')) as Record<string, unknown>;
    expect(settings['hooks']).toEqual({ SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: `${PRODUCT_NAMES.PROGRAM} hook session-start`, timeout: 10 }] }], });
    expect(existsSync(join(repositoryDirectory, '.claude', 'settings.json'))).toBe(false);
    expect(context.outputText()).toContain('settings.local.json (installed)');
    expect(context.errorText()).toBe('');
  });

  test('--no-hooks leaves both settings files unwritten', async () => {
    const withoutHooks = scratchRepository();
    const { exitCode, context: optedOut } = await runIn(withoutHooks, ['init', '--no-hooks'], INIT_IN_A_NEW_REPOSITORY);
    expect(exitCode).toBe(0);

    expect(existsSync(join(withoutHooks, '.claude', 'settings.local.json'))).toBe(false);
    expect(existsSync(join(withoutHooks, '.claude', 'settings.json'))).toBe(false);
    expect(optedOut.outputText()).toContain('hooks:       left alone (--no-hooks)');
  });

  test('each retired opt-out flag is unknown, refused with exit 1 before anything is written', async () => {
    for (const retiredFlag of ['--no-claude-md', '--no-workflow', '--no-agent-definition']) {
      const repositoryDirectory = scratchRepository();
      const { exitCode, context } = await runIn(repositoryDirectory, ['init', retiredFlag], [COMMON_FOLDER_AT_THE_ROOT]);
      expect(exitCode, retiredFlag).toBe(1);
      expect(context.errorText(), retiredFlag).toContain(`${PRODUCT_NAMES.PROGRAM} init [--project <name>] [--root <path>] [--no-hooks]`);
      expect(existsSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER)), retiredFlag).toBe(false);
    }
  });

  test('records the install version in the tracker directory as exactly the CLI\'s own', async () => {
    const repositoryDirectory = scratchRepository();

    expect((await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY)).exitCode).toBe(0);

    expect(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'version.json'), 'utf8')).toBe(`{\n  "installVersion": ${INSTALL_VERSION}\n}\n`);
  });

  test('a fresh init cut short after its first installed file leaves the tracker unversioned, so the next command asks for a rerun', async () => {
    const repositoryDirectory = scratchRepository();
    const rootDirectory       = realpathSync(repositoryDirectory);
    // A file where the skills folder goes makes the skills' write fail after the briefs and the hook.
    mkdirSync(join(rootDirectory, '.claude'), { recursive: true });
    writeFileSync(join(rootDirectory, '.claude', 'skills'), 'Example file in the way\n');

    expect((await runIn(repositoryDirectory, ['init'], INIT_CUT_SHORT_AT_THE_SKILLS)).exitCode).toBe(2);
    expect(existsSync(installedFilePathsIn(rootDirectory).sessionInstructions)).toBe(true);
    expect(existsSync(installedFilePathsIn(rootDirectory).installManifest)).toBe(false);

    const { exitCode, context: nextCommand } = await runIn(repositoryDirectory, ['task', 'add', 'Example row'], []);
    expect(exitCode).toBe(1);
    expect(nextCommand.errorText()).toBe(OperationRefusalWordingUtil.installVersionMismatchMessageOf({
      kind:             'install-version-mismatch',
      rootDirectory,
      manifestFilePath: installedFilePathsIn(rootDirectory).installManifest,
      installVersion:   INSTALL_VERSION,
      mismatch:         { reason: 'unversioned' },
    }));
  });

  test('--root tracks the directory it names rather than the discovered repository root', async () => {
    const repositoryDirectory = scratchRepository();
    const plainDirectory      = createRecordedGitRepository('init-command-root');
    scratchDirectories.push(plainDirectory);

    expect((await runIn(repositoryDirectory, ['init', '--root', plainDirectory], INIT_WITH_A_ROOT_OPTION)).exitCode).toBe(0);

    expect(existsSync(join(plainDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'))).toBe(true);
    expect(existsSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'))).toBe(false);
  });
});

describe('a second init', () => {
  test('at the same root removes the CLAUDE.md block, refreshes the briefs, keeps the tracker and exits 0', async () => {
    const repositoryDirectory = scratchRepository();
    await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY);
    const trackerIdBefore = storedProgressOf(repositoryDirectory).trackerId;

    const claudeFilePath = join(repositoryDirectory, 'CLAUDE.md');
    writeFileSync(claudeFilePath, `${CLAUDE_MANAGED_BLOCK_MARKERS.start}\n${CLAUDE_MANAGED_BLOCK_MARKERS.end}\n`);
    const briefFilePath = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'session-instructions.md');
    writeFileSync(briefFilePath, 'An older brief nobody refreshed.\n');

    const { exitCode, context: second } = await runIn(repositoryDirectory, ['init'], INIT_ON_AN_EXISTING_TRACKER);
    expect(exitCode).toBe(0);

    expect(second.outputText()).toContain('already initialised');
    expect(second.outputText(), 'a re-run says so on both paths, or the hook is invisible to a repository that adopted the tool a month ago').toContain('hooks:       ');
    expect(second.outputText(), 'the refresh has its own verb now').toContain(`\`${PRODUCT_NAMES.PROGRAM} update\` is the command for this refresh`);
    expect(existsSync(claudeFilePath), 'a file the block was all of goes with it').toBe(false);
    expect(second.outputText()).toContain('  CLAUDE.md:   removed; commit CLAUDE.md');
    expect(readFileSync(briefFilePath, 'utf8'), 'the brief is shipped guidance, so a re-run restores the current wording').toStartWith('## Progress tracking');
    // The tracker id is the page's localStorage key, so a re-run that reset it would reset every reader's stored range.
    expect(storedProgressOf(repositoryDirectory).trackerId).toBe(trackerIdBefore);
  });

  test('one directory below an existing tracker is refused with exit 1 and names where the tracker is', async () => {
    const repositoryDirectory = scratchRepository();
    await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY);
    const nestedDirectory = join(repositoryDirectory, 'packages', 'example');
    mkdirSync(nestedDirectory, { recursive: true });

    const { exitCode, context } = await runIn(nestedDirectory, ['init', '--root', nestedDirectory], [GIT_VERSION]);
    expect(exitCode).toBe(1);

    expect(context.errorText()).toContain(repositoryDirectory);
    expect(context.errorText(), 'the refresh at the tracker\'s root is `update`, and it refreshes more than the block').toContain(`${PRODUCT_NAMES.PROGRAM} update`);
    expect(context.errorText()).not.toContain('only refreshes the CLAUDE.md block');
    expect(existsSync(join(nestedDirectory, PRODUCT_NAMES.DATA_FOLDER))).toBe(false);
  });

  // The tracker walk misses a progress file that is not a readable regular file, so only the create-exclusive store write keeps it.
  test('a progress file the tracker walk does not recognise is refreshed around, never replaced', async () => {
    const repositoryDirectory = scratchRepository();
    const progressFilePath    = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json');
    const missingTargetPath   = join(repositoryDirectory, 'missing-progress-target.json');
    mkdirSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
    symlinkSync(missingTargetPath, progressFilePath);

    const { exitCode, context } = await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY);
    expect(exitCode).toBe(0);

    expect(context.outputText()).toContain('already initialised');
    expect(readlinkSync(progressFilePath)).toBe(missingTargetPath);
    expect(existsSync(missingTargetPath)).toBe(false);
  });

  test('over files a newer agent-progress installed is refused with exit 1 and the newer paragraph, and nothing is written', async () => {
    const repositoryDirectory = scratchRepository();
    await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY);
    writeFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'session-instructions.md'), 'An older brief nobody refreshed.\n');
    const rootDirectory    = realpathSync(repositoryDirectory);
    const manifestFilePath = installedFilePathsIn(rootDirectory).installManifest;
    writeFileSync(manifestFilePath, `{\n  "installVersion": ${INSTALL_VERSION + 1}\n}\n`);
    const filesBefore = repositoryFileContentsOf(repositoryDirectory);

    const { exitCode, context } = await runIn(repositoryDirectory, ['init'], INIT_REFUSED_BY_A_NEWER_MANIFEST);
    expect(exitCode).toBe(1);

    expect(context.errorText()).toBe(OperationRefusalWordingUtil.installVersionMismatchMessageOf({
      kind:           'install-version-mismatch',
      rootDirectory,
      manifestFilePath,
      installVersion: INSTALL_VERSION,
      mismatch:       { reason: 'newer', installedVersion: INSTALL_VERSION + 1 },
    }));
    expect(context.outputText()).toBe('');
    expect(repositoryFileContentsOf(repositoryDirectory)).toEqual(filesBefore);
    expect(filesBefore.size, 'the fixture holds the tracker and its installed files, so the comparison above is about something').toBeGreaterThan(3);
  });
});

describe('from inside a linked worktree', () => {
  test('the tracker is created in the main checkout, not in the worktree', async () => {
    const repositoryDirectory = scratchRepository();
    const worktreeDirectory   = createScratchDirectory('init-command-worktree');
    scratchDirectories.push(worktreeDirectory);
    const inTheWorktree = commonFolderInAWorktreeOf(realpathSync(repositoryDirectory));

    const { exitCode } = await runIn(worktreeDirectory, ['init'], [inTheWorktree, inTheWorktree, ...INIT_IN_A_NEW_REPOSITORY.slice(2)]);
    expect(exitCode).toBe(0);

    expect(existsSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'))).toBe(true);
    expect(existsSync(join(worktreeDirectory, PRODUCT_NAMES.DATA_FOLDER))).toBe(false);
  });
});

describe('the two places init refuses before it writes anything', () => {
  test('a bare repository is refused, rather than tracked from its parent directory', async () => {
    const parentDirectory = createScratchDirectory('init-bare-parent');
    scratchDirectories.push(parentDirectory);
    const bareDirectory = join(parentDirectory, 'example.git');
    mkdirSync(bareDirectory);

    const { exitCode, context } = await runIn(bareDirectory, ['init'], [...ROOT_OF_A_BARE, ...ROOT_OF_A_BARE]);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('bare git repository');
    expect(existsSync(join(parentDirectory, PRODUCT_NAMES.DATA_FOLDER)), 'nothing was written beside the bare repository').toBe(false);
    expect(existsSync(join(parentDirectory, 'CLAUDE.md'))).toBe(false);
  });

  test('--root naming a file or a path that is not there is refused with exit 1, not a raw errno', async () => {
    const repositoryDirectory = scratchRepository();
    writeFileSync(join(repositoryDirectory, 'notes.txt'), 'not a directory\n');

    for (const rootOption of ['notes.txt', 'no-such-directory']) {
      const { exitCode, context } = await runIn(repositoryDirectory, ['init', '--root', rootOption], [COMMON_FOLDER_AT_THE_ROOT]);

      expect(exitCode, rootOption).toBe(1);
      expect(context.errorText(), rootOption).toContain('is not an existing directory');
    }
    expect(existsSync(join(repositoryDirectory, 'no-such-directory'))).toBe(false);
  });

  test('the .gitignore line is reported in words a person reads, not as a verdict name', async () => {
    const repositoryDirectory = scratchRepository();

    const { context } = await runIn(repositoryDirectory, ['init'], INIT_IN_A_NEW_REPOSITORY);

    expect(context.outputText()).toContain('.gitignore:  entry added');
    expect(context.outputText()).not.toContain('no-gitignore-written');
  });
});
