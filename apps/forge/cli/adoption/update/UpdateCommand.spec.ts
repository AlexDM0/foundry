/**
 * What `agent-progress update` refreshes, what it reports about each of those files, that it leaves what an earlier install version wrote
 * where it is, and that it leaves a current tracker's progress file, tickets and log byte for byte; and that it refuses, writing nothing,
 * files a newer agent-progress installed and a directory at the manifest's path, which it could not replace. Git plays recorded answers:
 * each case names the calls `update` makes in its state.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
}               from 'node:fs';
import { join } from 'node:path';

import { afterEach, expect, test }                                from 'bun:test';
import { OperationRefusalWordingUtil }                            from '../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { PRODUCT_NAMES }                                          from '../../../src/shared/constants/ProductNames.ts';
import { GIT_CALL_SHAPES, type RecordedGitStage, useRecordedGit } from '../../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded, testWhenNotRunningAsRoot }    from '../../../src/testing/ToolGuard.ts';
import { agentAdapterOfThisProcess }                              from '../../CommandContext.ts';
import { installedFilePathsIn }                                   from '../../InstalledFiles.ts';
import { runCommandLine }                                         from '../../Main.ts';
import { INSTALL_VERSION }                                        from '../../constants/InstallVersion.ts';
import { createCapturedCommandContext }                           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                 from '../../testing/InitializedScratchRepository.ts';
import {
  checkIgnoreOf,
  COMMON_FOLDER_OUTSIDE,
  commonFolderInAWorktreeOf,
  REFRESH_OF_AN_IGNORING_REPOSITORY
} from '../../testing/RecordedGitStages.ts';
import { repositoryFileContentsOf } from '../../testing/RepositoryFileContents.ts';
import { installedFileTextsFor }    from '../InstalledFileGeneration.ts';

const recordedGit = useRecordedGit();

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const scratchDirectories: string[] = [];

const READ_AND_ENTER_ONLY_MODE = 0o555;

const OWNER_FULL_ACCESS_MODE = 0o755;

const GENERATED_SESSION_INSTRUCTIONS = installedFileTextsFor().sessionInstructions ?? '';

const SHARED_SETTINGS = 'settings.json';

const LOCAL_SETTINGS = 'settings.local.json';

const SESSION_START_GROUP = { matcher: '', hooks: [{ type: 'command', command: `${PRODUCT_NAMES.PROGRAM} hook session-start`, timeout: 10 }] };

type CapturedContext = ReturnType<typeof createCapturedCommandContext>;

/** The context is made inside the stage, since its isolation check asks git for the root of a directory that holds no tracker. */
async function runIn(
  currentDirectory: string, commandLineArguments: readonly string[], stage: RecordedGitStage,
): Promise<{ exitCode: number; context: CapturedContext }> {
  return await recordedGit.playStage(stage, async () => {
    const context = createCapturedCommandContext({ currentDirectory, now: () => FROZEN_NOW });
    return { exitCode: await runCommandLine(commandLineArguments, context), context };
  });
}

/** `update` at the root of a tracker whose `.gitignore` names every folder, which is all it asks git about. */
async function update(repositoryDirectory: string, commandLineArguments: readonly string[] = ['update']): Promise<{ exitCode: number; context: CapturedContext }> {
  return await runIn(repositoryDirectory, commandLineArguments, REFRESH_OF_AN_IGNORING_REPOSITORY);
}

function settingsFilePathIn(repositoryDirectory: string, settingsFileName: string): string {
  return join(repositoryDirectory, '.claude', settingsFileName);
}

function writeSettings(repositoryDirectory: string, settingsFileName: string, settings: unknown): void {
  mkdirSync(join(repositoryDirectory, '.claude'), { recursive: true });
  writeFileSync(settingsFilePathIn(repositoryDirectory, settingsFileName), `${JSON.stringify(settings, null, 2)}\n`);
}

function settingsIn(repositoryDirectory: string, settingsFileName: string): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsFilePathIn(repositoryDirectory, settingsFileName), 'utf8')) as Record<string, unknown>;
}

function hookGroupsIn(repositoryDirectory: string, settingsFileName: string, event: string): unknown {
  return (settingsIn(repositoryDirectory, settingsFileName)['hooks'] as Record<string, unknown> | undefined)?.[event];
}

function sessionInstructionsPathIn(repositoryDirectory: string): string {
  return join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'session-instructions.md');
}

/**
 * A tracked repository whose instructions an older version of the tool left behind. It is initialised with `--no-hooks`, which lets each
 * test below say for itself what its `.claude/` folder holds.
 */
async function trackedRepositoryWithStaleFiles(): Promise<string> {
  const repositoryDirectory = await createInitializedRecordedGitRepository('update-command', ['--project', 'Example Agency', '--no-hooks'], () => FROZEN_NOW, recordedGit);
  scratchDirectories.push(repositoryDirectory);
  writeFileSync(sessionInstructionsPathIn(repositoryDirectory), '## Progress tracking\n\nThe wording two releases ago, which nobody refreshed.\n');
  return repositoryDirectory;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

describeWhenGitIsRecorded('updating a tracked repository', () => {
  test('rewrites session instructions left behind by an older version and says to re-read them', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();

    const { exitCode, context } = await update(repositoryDirectory);
    expect(exitCode).toBe(0);

    expect(readFileSync(sessionInstructionsPathIn(repositoryDirectory), 'utf8')).toBe(GENERATED_SESSION_INSTRUCTIONS);
    expect(context.outputText()).toContain('brief:       updated — re-read it before your next brief');
    expect(context.errorText()).toBe('');
  });

  test('briefs that are already the shipped ones are reported unchanged, and missing ones count as updated', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    await update(repositoryDirectory);

    const second = await update(repositoryDirectory);
    expect(second.exitCode).toBe(0);
    expect(second.context.outputText()).toContain('brief:       unchanged');

    rmSync(installedFilePathsIn(repositoryDirectory).assistantDefault);
    const third = await update(repositoryDirectory);
    expect(third.exitCode).toBe(0);
    expect(third.context.outputText()).toContain('brief:       updated');
    expect(existsSync(installedFilePathsIn(repositoryDirectory).assistantDefault)).toBe(true);
  });

  test('a CLAUDE.md and the files an earlier install version wrote stay where they are, and the report names neither', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const instructionFilePath = join(repositoryDirectory, 'CLAUDE.md');
    const earlierBriefPath    = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'agent-brief.md');
    writeFileSync(instructionFilePath, '# Example Agency\n\nExample instructions an earlier install wrote.\n');
    writeFileSync(earlierBriefPath, 'Example earlier brief\n');

    const { exitCode, context } = await update(repositoryDirectory);
    expect(exitCode, context.errorText()).toBe(0);

    expect(readFileSync(instructionFilePath, 'utf8')).toBe('# Example Agency\n\nExample instructions an earlier install wrote.\n');
    expect(readFileSync(earlierBriefPath, 'utf8')).toBe('Example earlier brief\n');
    expect(context.outputText()).not.toMatch(/^ {2}(?:CLAUDE\.md|retired):/m);
  });

  test('the SessionStart hook is installed by default into the local settings file, the shared one is not created, and a rerun is unchanged', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();

    const { exitCode, context } = await update(repositoryDirectory);
    expect(exitCode).toBe(0);
    expect(hookGroupsIn(repositoryDirectory, LOCAL_SETTINGS, 'SessionStart')).toEqual([SESSION_START_GROUP]);
    expect(existsSync(settingsFilePathIn(repositoryDirectory, SHARED_SETTINGS)), 'nothing lands in the file colleagues share').toBe(false);
    expect(context.outputText()).toContain('settings.local.json (installed)');

    const settingsBefore = readFileSync(settingsFilePathIn(repositoryDirectory, LOCAL_SETTINGS), 'utf8');
    const second = await update(repositoryDirectory);
    expect(second.exitCode).toBe(0);
    expect(readFileSync(settingsFilePathIn(repositoryDirectory, LOCAL_SETTINGS), 'utf8')).toBe(settingsBefore);
    expect(second.context.outputText()).toContain('settings.local.json (unchanged)');
  });

  test('a local settings file that holds other keys keeps every one of them', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    writeSettings(repositoryDirectory, LOCAL_SETTINGS, {
      model:       'claude-opus-4-8',
      permissions: { allow: ['Bash(bun test:*)'] },
      hooks:       { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hello' }] }] },
    });

    expect((await update(repositoryDirectory)).exitCode).toBe(0);

    const settings = settingsIn(repositoryDirectory, LOCAL_SETTINGS);
    expect(settings['model']).toBe('claude-opus-4-8');
    expect(settings['permissions']).toEqual({ allow: ['Bash(bun test:*)'] });
    expect(hookGroupsIn(repositoryDirectory, LOCAL_SETTINGS, 'SessionStart')).toEqual([
      { matcher: '', hooks: [{ type: 'command', command: 'echo hello' }] },
      SESSION_START_GROUP,
    ]);
  });

  /** A shared file holding a retired entry tells a refusal to touch settings apart from having nothing to remove. */
  test('--no-hooks writes neither settings file and leaves a retired hook in the shared one byte for byte, and says so', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const retiredGroup = { matcher: '', hooks: [{ type: 'command', command: `${PRODUCT_NAMES.PROGRAM} hook subagent-stop`, timeout: 3 }] };
    writeSettings(repositoryDirectory, SHARED_SETTINGS, { hooks: { SubagentStop: [retiredGroup] } });
    const sharedSettingsBefore = readFileSync(settingsFilePathIn(repositoryDirectory, SHARED_SETTINGS), 'utf8');

    const { exitCode, context } = await update(repositoryDirectory, ['update', '--no-hooks']);
    expect(exitCode).toBe(0);

    expect(readFileSync(settingsFilePathIn(repositoryDirectory, SHARED_SETTINGS), 'utf8')).toBe(sharedSettingsBefore);
    expect(existsSync(settingsFilePathIn(repositoryDirectory, LOCAL_SETTINGS))).toBe(false);
    expect(context.outputText()).toContain('hooks:       left alone (--no-hooks)');
  });

  test('the worktrees folder is git-ignored', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    writeFileSync(join(repositoryDirectory, '.gitignore'), `${PRODUCT_NAMES.DATA_FOLDER}/\n`);
    const { installer } = agentAdapterOfThisProcess();
    const bundleFolders = [PRODUCT_NAMES.PRODUCT_OWNER_SKILL, PRODUCT_NAMES.ORCHESTRATE_SKILL].map((bundleName) => installer.instructionBundleFolderOf(bundleName));
    const refreshIgnoringNothing = [...bundleFolders, PRODUCT_NAMES.WORKTREES_FOLDER]
      .map((folder) => checkIgnoreOf(folder, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED));

    const { exitCode, context } = await runIn(repositoryDirectory, ['update'], refreshIgnoringNothing);
    expect(exitCode).toBe(0);

    expect(readFileSync(join(repositoryDirectory, '.gitignore'), 'utf8')).toContain(`${PRODUCT_NAMES.WORKTREES_FOLDER}/`);
    expect(context.outputText()).toContain(`  worktrees:   ${PRODUCT_NAMES.WORKTREES_FOLDER} entry added`);
  });

  // The briefs come after the hooks and skills and the manifest after all of them, so a rerun after a failed write still reports the stale
  // brief and every checked command keeps asking for update until one finishes.
  testWhenNotRunningAsRoot('a refresh cut short by an unwritable skills folder leaves the stale brief and no install version for the rerun to report and record', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const manifestFilePath    = installedFilePathsIn(repositoryDirectory).installManifest;
    const skillsDirectory     = join(repositoryDirectory, '.claude', 'skills');
    rmSync(manifestFilePath);
    rmSync(skillsDirectory, { recursive: true, force: true });
    mkdirSync(skillsDirectory, { recursive: true });

    chmodSync(skillsDirectory, READ_AND_ENTER_ONLY_MODE);
    try {
      // The skills are written before git is asked whether their folders are ignored.
      expect((await runIn(repositoryDirectory, ['update'], [])).exitCode).toBe(2);
    } finally {
      chmodSync(skillsDirectory, OWNER_FULL_ACCESS_MODE);
    }
    expect(readFileSync(sessionInstructionsPathIn(repositoryDirectory), 'utf8')).not.toBe(GENERATED_SESSION_INSTRUCTIONS);
    expect(existsSync(manifestFilePath), 'a refresh cut short leaves the old version, so every command keeps asking for update').toBe(false);

    const rerun = await update(repositoryDirectory);
    expect(rerun.exitCode).toBe(0);
    expect(rerun.context.outputText()).toContain('brief:       updated — re-read it before your next brief');
    expect(JSON.parse(readFileSync(manifestFilePath, 'utf8'))).toEqual({ installVersion: INSTALL_VERSION });
  });

  // A tracker adopted before the manifest existed has none, and `update` is what gives it one.
  test('records the install version on a tracker that has none, and a second run leaves it byte for byte', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const manifestFilePath    = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'version.json');
    rmSync(manifestFilePath);

    expect((await update(repositoryDirectory)).exitCode).toBe(0);
    const manifestAfterTheFirstRun = readFileSync(manifestFilePath, 'utf8');
    expect(manifestAfterTheFirstRun).toBe(`{\n  "installVersion": ${INSTALL_VERSION}\n}\n`);

    expect((await update(repositoryDirectory)).exitCode).toBe(0);
    expect(readFileSync(manifestFilePath, 'utf8')).toBe(manifestAfterTheFirstRun);
  });

  test('a local settings file that will not parse is left exactly as it was and reported on standard error', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const malformed           = '{ "hooks": { "SubagentStop": [ ';
    mkdirSync(join(repositoryDirectory, '.claude'), { recursive: true });
    writeFileSync(settingsFilePathIn(repositoryDirectory, LOCAL_SETTINGS), malformed);

    const { exitCode, context } = await update(repositoryDirectory);
    expect(exitCode, 'the refresh of everything else still happened').toBe(0);

    expect(readFileSync(settingsFilePathIn(repositoryDirectory, LOCAL_SETTINGS), 'utf8')).toBe(malformed);
    expect(context.outputText()).toContain('hooks:       refused (the settings file could not be read)');
    expect(context.errorText()).toContain('settings.local.json');
  });
});

describeWhenGitIsRecorded('what update never touches', () => {
  test('the progress file, the tickets and the log are byte-identical afterwards', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    await runIn(repositoryDirectory, ['ticket', 'add', 'Rename the export button', '--type', 'ticket'], []);
    await runIn(repositoryDirectory, ['log', 'The orchestrator started the board'], []);

    const progressFilePath = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json');
    const logFilePath      = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl');
    const ticketsDirectory = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'tickets');
    const ticketFileName   = readdirSync(ticketsDirectory)[0] ?? '';
    const ticketFilePath   = join(ticketsDirectory, ticketFileName);
    const progressBefore   = readFileSync(progressFilePath, 'utf8');
    const logBefore        = readFileSync(logFilePath, 'utf8');
    const ticketBefore     = readFileSync(ticketFilePath, 'utf8');
    expect(ticketFileName, 'the fixture filed a ticket, so the comparison below is about a real file').toContain('export-button');

    expect((await update(repositoryDirectory)).exitCode).toBe(0);

    expect(readFileSync(progressFilePath, 'utf8'), 'the rows, the log and the counters are none of this command\'s business').toBe(progressBefore);
    expect(readFileSync(logFilePath, 'utf8')).toBe(logBefore);
    expect(readFileSync(ticketFilePath, 'utf8')).toBe(ticketBefore);
    expect(logBefore, 'the fixture holds a log line, so the comparison above is about something').toContain('The orchestrator started the board');
  });

  test('an unreadable tracker still exits 0 with the untouched line, and its files are left byte for byte', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const progressFilePath    = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json');
    const logFilePath         = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl');
    const unreadableProgress  = '{ "version": 1, "tasks": [';
    writeFileSync(progressFilePath, unreadableProgress);
    const logBefore = readFileSync(logFilePath, 'utf8');

    const { exitCode, context } = await update(repositoryDirectory);
    expect(exitCode).toBe(0);

    expect(context.outputText().split('\n')[0]).toEndWith('; the tracker itself was not touched.');
    expect(readFileSync(progressFilePath, 'utf8')).toBe(unreadableProgress);
    expect(readFileSync(logFilePath, 'utf8')).toBe(logBefore);
  });
});

describeWhenGitIsRecorded('from inside a linked worktree', () => {
  test('the main checkout\'s managed files are the ones refreshed', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const worktreeDirectory   = createScratchDirectory('update-command-worktree');
    scratchDirectories.push(worktreeDirectory);
    const inTheWorktree = commonFolderInAWorktreeOf(realpathSync(repositoryDirectory));

    const { exitCode, context } = await runIn(worktreeDirectory, ['update'], [inTheWorktree, inTheWorktree, ...REFRESH_OF_AN_IGNORING_REPOSITORY]);
    expect(exitCode).toBe(0);

    expect(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'session-instructions.md'), 'utf8')).toBe(GENERATED_SESSION_INSTRUCTIONS);
    expect(existsSync(join(worktreeDirectory, PRODUCT_NAMES.DATA_FOLDER)), 'a worktree never grows a tracker of its own').toBe(false);
    expect(context.outputText()).toContain(realpathSync(repositoryDirectory));
  });
});

describeWhenGitIsRecorded('what update refuses', () => {
  test('a directory with no tracker anywhere above it is refused with exit 1, naming init, and nothing is written', async () => {
    const plainDirectory = createScratchDirectory('update-without-a-tracker');
    scratchDirectories.push(plainDirectory);

    const { exitCode, context } = await runIn(plainDirectory, ['update'], [COMMON_FOLDER_OUTSIDE, COMMON_FOLDER_OUTSIDE]);
    expect(exitCode).toBe(1);

    expect(context.errorText()).toContain(`${PRODUCT_NAMES.PROGRAM} init`);
    expect(existsSync(join(plainDirectory, PRODUCT_NAMES.DATA_FOLDER)), 'update creates no tracker, which is the whole difference from init').toBe(false);
    expect(existsSync(join(plainDirectory, 'CLAUDE.md'))).toBe(false);
    expect(context.outputText()).toBe('');
  });

  test('an unknown option, each retired opt-out flag among them, and an extra positional are each refused with exit 1', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const briefFilePath       = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'session-instructions.md');
    const briefBefore         = readFileSync(briefFilePath, 'utf8');
    const refusedArgumentLists = [
      ['update', '--project', 'Example Agency'],
      ['update', '--root', repositoryDirectory],
      ['update', '--no-claude-md'],
      ['update', '--no-workflow'],
      ['update', '--no-agent-definition'],
      ['update', 'here'],
    ];

    for (const refusedArguments of refusedArgumentLists) {
      const { exitCode, context } = await runIn(repositoryDirectory, refusedArguments, []);
      expect(exitCode, refusedArguments.join(' ')).toBe(1);
      expect(context.errorText(), refusedArguments.join(' ')).toContain(`${PRODUCT_NAMES.PROGRAM} update [--no-hooks]`);
    }
    expect(readFileSync(briefFilePath, 'utf8'), 'a refused invocation writes nothing').toBe(briefBefore);
  });

  // Two colleagues on different versions would otherwise flip the committed installed files back and forth.
  test('files installed by a newer agent-progress are refused with exit 1 and the newer paragraph, and nothing is written', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const rootDirectory       = realpathSync(repositoryDirectory);
    const manifestFilePath    = installedFilePathsIn(rootDirectory).installManifest;
    writeFileSync(manifestFilePath, `{\n  "installVersion": ${INSTALL_VERSION + 1}\n}\n`);
    const filesBefore = repositoryFileContentsOf(repositoryDirectory);

    const { exitCode, context } = await runIn(repositoryDirectory, ['update'], []);
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

  // The manifest is written last, by a rename a directory would refuse, so without the check every other file would be written first.
  test('a directory at the manifest\'s path is refused with exit 1 before anything is written, and update runs once it is removed', async () => {
    const repositoryDirectory = await trackedRepositoryWithStaleFiles();
    const rootDirectory       = realpathSync(repositoryDirectory);
    const manifestFilePath    = installedFilePathsIn(rootDirectory).installManifest;
    rmSync(manifestFilePath, { force: true });
    mkdirSync(manifestFilePath);
    const filesBefore = repositoryFileContentsOf(repositoryDirectory);

    const refused = await runIn(repositoryDirectory, ['update'], []);
    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toBe(OperationRefusalWordingUtil.installVersionMismatchMessageOf({
      kind:           'install-version-mismatch',
      rootDirectory,
      manifestFilePath,
      installVersion: INSTALL_VERSION,
      mismatch:       { reason: 'manifest-is-a-directory' },
    }));
    expect(refused.context.outputText()).toBe('');
    expect(repositoryFileContentsOf(repositoryDirectory)).toEqual(filesBefore);

    rmSync(manifestFilePath, { recursive: true });
    expect((await update(repositoryDirectory)).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(manifestFilePath, 'utf8'))).toEqual({ installVersion: INSTALL_VERSION });
  });
});
