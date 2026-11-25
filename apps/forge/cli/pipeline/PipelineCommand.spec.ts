/**
 * The `pipeline` verbs over a scratch tracker. What matters: each verb builds its command from the command line and writes the setup
 * record through the lock; ids are read in either case; the constitution text arrives byte for byte from a file or standard input, line
 * endings and all, while `--file -` in a terminal is refused rather than read as empty text; a draft edit sets several fields in one
 * move; a setup over a record of an older format starts that record over first; outside a job the pipeline agent's verbs name the record
 * and apply its moves; under a job a setup naming its agent is refused;
 * and a usage mistake or a Board refusal exits 1 with the record, the progress file and the log as they were.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
}                                             from 'bun:test';
import type { PipelineSetup }                     from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { localStoreLayoutOf }                     from '../../src/services/tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                      from '../../src/services/tracker/Workspace.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { MAIN_WITHOUT_A_CONSTITUTION }            from '../testing/RecordedGitStages.ts';

const FROZEN_NOW = new Date('2026-11-12T09:00:00Z');

const CONSTITUTION_TEXT = '# Example Agency\r\n\r\n- Keep the basket page fast.\r\n';

let repositoryDirectory = '';

function setupFilePath(): string {
  return localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).pipelineSetupRecordPath;
}

function storedFiles(): string[] {
  const workspace = workspacePathsFor(repositoryDirectory);
  return [localStoreLayoutOf(workspace).progressRecordPath, localStoreLayoutOf(workspace).logRecordPath, localStoreLayoutOf(workspace).pipelineSetupRecordPath]
    .map((filePath) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''));
}

async function runWithExitCode(
  commandLineArguments: readonly string[],
  standardInputText?: string,
): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW, ...(standardInputText === undefined ? {} : { standardInputText }) });
  const exitCode = await runCommandLine(commandLineArguments, context);
  return { exitCode, context };
}

async function run(commandLineArguments: readonly string[], standardInputText?: string): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const { context, exitCode } = await runWithExitCode(commandLineArguments, standardInputText);
  expect(exitCode, `\`pipeline ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

/** `pipeline setup` reads main's `CONSTITUTION.md`, which the scratch repository's main line does not hold. */
async function runSetup(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  return recordedGit.playStage(MAIN_WITHOUT_A_CONSTITUTION, async () => run(commandLineArguments));
}

function storedSetup(): PipelineSetup {
  return JSON.parse(readFileSync(setupFilePath(), 'utf8')) as PipelineSetup;
}

async function setupAtDesign(): Promise<void> {
  await runSetup(['pipeline', 'setup', '--agent', process.execPath, '--billing', 'subscription']);
  for (const step of ['research', 'constitution']) await run(['pipeline', 'continue', 's1', step]);
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('pipeline-verbs', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the pipeline verbs', () => {
  test('pipeline setup opens S1 billed as named, launches its pipeline agent, prints the record under --json, and logs both', async () => {
    const context = await runSetup(['pipeline', 'setup', '--billing', 'api', '--max-budget-usd', '15', '--agent', process.execPath, '--json']);

    const printed = JSON.parse(context.outputText()) as { setup: PipelineSetup; logged: { kind: string }[] };
    expect(printed.setup).toMatchObject({
      setupId: 'S1', mode: 'setup', billing: { mode: 'api', maxBudgetUsd: 15 }, agentJobId: 'J1'
    });
    expect(printed.logged.map((record) => record.kind)).toEqual(['pipeline-setup-opened', 'job-launched']);
    expect(storedSetup().setupId).toBe('S1');
  });

  test('pipeline setup with the agent alone opens at billing, and pipeline billing and pipeline continue move the stored record', async () => {
    await runSetup(['pipeline', 'setup', '--agent', process.execPath]);
    expect(storedSetup()).toMatchObject({ billing: null, currentStep: 'billing', agentJobId: null });

    await run(['pipeline', 'billing', 'S1', 'api', '--max-budget-usd', '30']);
    await run(['pipeline', 'continue', 'S1', 'billing']);
    await run(['pipeline', 'continue', 'S1', 'research']);

    const stepStates = {
      agent: 'done', billing: 'done', research: 'done', constitution: 'in-progress'
    };
    expect(storedSetup()).toMatchObject({ billing: { mode: 'api', maxBudgetUsd: 30 }, currentStep: 'constitution', stepStates });
  });

  test('pipeline constitution stores the text of a file byte for byte, and of standard input with --file -', async () => {
    await setupAtDesign();
    const constitutionFile = join(repositoryDirectory, 'constitution-draft.md');
    writeFileSync(constitutionFile, CONSTITUTION_TEXT);

    await run(['pipeline', 'constitution', 'S1', '--revision', '0', '--file', 'constitution-draft.md']);
    expect(storedSetup().constitution?.markdown).toBe(CONSTITUTION_TEXT);

    await run(['pipeline', 'constitution', 'S1', '--revision', '1', '--file', '-', '--sources', 'installed-default'], '# Piped\n');
    expect(storedSetup().constitution).toMatchObject({ markdown: '# Piped\n', revision: 2, draftedFrom: { contributing: false, research: false, installedDefault: true } });
  });

  test('--file - in a terminal is refused at exit 1 with nothing written, for User\'s text and the agent\'s payload; an empty file still clears the text', async () => {
    await setupAtDesign();
    writeFileSync(join(repositoryDirectory, 'constitution-draft.md'), CONSTITUTION_TEXT);
    writeFileSync(join(repositoryDirectory, 'empty.md'), '');
    await run(['pipeline', 'constitution', 'S1', '--revision', '0', '--file', 'constitution-draft.md']);
    const before = storedFiles();

    for (const commandLine of [
      ['pipeline', 'constitution', 'S1', '--revision', '1', '--file', '-'],
      ['pipeline', 'draft-constitution', 'S1', '--file', '-'],
    ]) {
      const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW, standardInputIsTerminal: true });
      expect(await runCommandLine(commandLine, context), commandLine.join(' ')).toBe(1);
      expect(context.errorText()).toContain('--file - reads standard input, and standard input is a terminal');
    }
    expect(storedFiles()).toEqual(before);

    await run(['pipeline', 'constitution', 'S1', '--revision', '1', '--file', 'empty.md']);
    expect(storedSetup().constitution).toMatchObject({ markdown: '', revision: 2 });
  });

  test('pipeline edit sets several fields in one move, pipeline undo takes one back unless that leaves no valid pipeline, and discard all', async () => {
    await setupAtDesign();

    await run(['pipeline', 'edit', 'S1', '--revision', '0', '--set', 'gate:test={"name": "test", "run": "bun test"}', '--set', 'phase-order:build=["test"]']);
    expect(storedSetup()).toMatchObject({ draftRevision: 1, draft: { gates: [{ name: 'test', run: 'bun test' }], phases: { build: ['test'] } } });

    const before = storedFiles();
    const refused = await runWithExitCode(['pipeline', 'undo', 'S1', 'e2']);
    expect(refused.exitCode, 'the gate would run in no phase').toBe(1);
    expect(storedFiles()).toEqual(before);

    await run(['pipeline', 'undo', 'S1', 'e1']);
    expect(storedSetup()).toMatchObject({ draftRevision: 2, draft: { gates: [], phases: { build: [] } } });

    await run(['pipeline', 'discard', 'S1']);
    expect(storedSetup().edits.every((edit) => edit.undone)).toBe(true);
  });

  test('pipeline check queues the gates the draft adds, and with none refuses no-gate-to-check at exit 1 with nothing written', async () => {
    await setupAtDesign();
    const before = storedFiles();

    const refused = await runWithExitCode(['pipeline', 'check', 's1']);
    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain('nothing to check');
    expect(storedFiles()).toEqual(before);

    await run(['pipeline', 'edit', 'S1', '--revision', '0', '--set', 'gate:test={"name": "test", "run": "bun test"}', '--set', 'phase-order:build=["test"]']);
    await run(['pipeline', 'check', 's1']);
    expect(storedSetup().check).toEqual({
      draftRevision: 1, gateNames: ['test'], state: 'queued', result: null, reason: null
    });
  });

  test('pipeline answer refuses a question the record does not hold, at exit 1 with nothing written', async () => {
    await setupAtDesign();
    const before = storedFiles();

    const { exitCode, context } = await runWithExitCode(['pipeline', 'answer', 'S1', 'Q4', 'a']);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('Q4');
    expect(storedFiles()).toEqual(before);
  });

  test('usage mistakes exit 1 with nothing written', async () => {
    await setupAtDesign();
    const before = storedFiles();

    for (const commandLine of [
      ['pipeline', 'setup', '--billing', 'credit'],
      ['pipeline', 'setup', '--billing', 'subscription'],
      ['pipeline', 'setup', '--agent', process.execPath, '--max-budget-usd', '5'],
      ['pipeline', 'continue', 'S1', 'deploy'],
      ['pipeline', 'answer', 'S1', 'Q1'],
      ['pipeline', 'constitution', 'S1', '--revision', '1'],
      ['pipeline', 'edit', 'S1', '--revision', '0', '--set', 'gates=[]'],
      ['pipeline', 'edit', 'S1', '--revision', '0', '--set', 'review={not json'],
      ['pipeline', 'undo', 'S1', 'X1'],
      ['pipeline', 'check', 'S1', 'extra'],
      ['pipeline', 'rename', 'S1'],
    ]) {
      const { exitCode } = await runWithExitCode(commandLine);
      expect(exitCode, commandLine.join(' ')).toBe(1);
    }
    expect(storedFiles()).toEqual(before);
    const unknownField = await runWithExitCode(['pipeline', 'edit', 'S1', '--revision', '0', '--set', 'gates=[]']);
    expect(unknownField.context.errorText()).toContain('approval:<approval>, ticket-writing or constitution');
  });

  test('outside a job the pipeline agent\'s verbs name the record first and apply its moves; a misshapen payload writes nothing', async () => {
    await setupAtDesign();
    const constitution = JSON.stringify({
      markdown: CONSTITUTION_TEXT,
      sources:  [{
        lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
      }],
    });
    const proposal = '{"edits": [{"field": "review", "value": {"name": "Review"}, "summary": "Review every ticket."}]}';

    await run(['pipeline', 'draft-constitution', 's1', '--file', '-'], constitution);
    await run(['pipeline', 'propose', 'S1', '--', proposal]);
    await run(['pipeline', 'ready', 'S1', 'design']);

    const setup = storedSetup();
    expect(setup.constitution?.markdown).toBe(CONSTITUTION_TEXT);
    expect(setup.edits).toMatchObject([{
      editId: 'E1', by: 'agent', field: 'review', summary: 'Review every ticket.'
    }]);
    expect(setup.readyToContinue).toEqual(['design']);

    const before = storedFiles();
    for (const commandLine of [
      ['pipeline', 'finding', 'S1', '--', '{"topic": "note"}'],
      ['pipeline', 'ask', 'S1', '--', '{"step": "design", "question": "Which?", "options": ["Bun", "Other"], "recommended": ["a"]}'],
      ['pipeline', 'propose', 'S1', '--', '{"edits": [{"field": "phases", "value": {}, "summary": "All."}]}'],
      ['pipeline', 'ready', 'S1', 'apply'],
      ['pipeline', 'finding', '--', '{"topic": "note", "label": "No CI"}'],
    ]) {
      const { exitCode } = await runWithExitCode(commandLine);
      expect(exitCode, commandLine.join(' ')).toBe(1);
    }
    expect(storedFiles()).toEqual(before);
  });

  test('under a job, pipeline setup naming its agent is refused verb-not-relayable at exit 1 with nothing written or relayed', async () => {
    const before = storedFiles();
    const hatchDirectory = join(repositoryDirectory, 'example-hatch');
    const context = {
      ...createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW }),
      job: {
        jobId: 'J4', hatchDirectory, replyTries: 1, replyIntervalMilliseconds: 1
      },
    };

    expect(await runCommandLine(['pipeline', 'setup', '--agent', process.execPath], context)).toBe(1);
    expect(context.errorText()).toContain('pipeline setup` cannot run under job J4');
    expect(existsSync(hatchDirectory)).toBe(false);
    expect(storedFiles()).toEqual(before);
  });

  test('pipeline setup over a record of an older format starts it over first, then opens and launches the new one', async () => {
    writeFileSync(setupFilePath(), `${JSON.stringify({
      formatVersion: 2, setupId: 'S1', mode: 'setup', currentStep: 'research'
    })}\n`);
    const context = await runSetup(['pipeline', 'setup', '--agent', process.execPath, '--billing', 'subscription', '--json']);

    const printed = JSON.parse(context.outputText()) as { setup: PipelineSetup; logged: { kind: string }[] };
    expect(printed.logged.map((record) => record.kind)).toEqual(['pipeline-setup-discarded', 'pipeline-setup-opened', 'job-launched']);
    expect(storedSetup()).toMatchObject({ setupId: printed.setup.setupId, mode: 'setup', agentJobId: 'J1' });
  });

  test('pipeline start-over removes the record, and pipeline update then refuses with no pipeline stored', async () => {
    await runSetup(['pipeline', 'setup', '--agent', process.execPath]);

    await run(['pipeline', 'start-over', 'S1']);
    expect(existsSync(setupFilePath())).toBe(false);

    const { exitCode, context } = await runWithExitCode(['pipeline', 'update']);
    expect(exitCode).toBe(1);
    expect(context.errorText()).not.toBe('');
  });
});
