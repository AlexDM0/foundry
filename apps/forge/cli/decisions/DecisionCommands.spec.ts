/**
 * `decisions`, `decide` and `await` on a scratch repository with no Hephaestus: `decide` answers through the write pipeline and the first answer
 * wins; free text is refused on a decision of several questions; `await` wakes only on a `decision-opened` after it started.
 */
import { readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
}                                             from 'bun:test';
import type { DecisionOpening }                   from '../../src/domain/tracker-model/@types/Decision.ts';
import { localStoreLayoutOf }                     from '../../src/services/tracker/LocalStoreLayout.ts';
import { writeTracker }                           from '../../src/services/tracker/TrackerPipeline.ts';
import { workspacePathsFor }                      from '../../src/services/tracker/Workspace.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                from '../../src/testing/LockTakers.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { waitUntil }                              from '../../src/testing/WaitUntil.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                        from '../testing/ReadyTicketFiling.ts';

const FROZEN_NOW = new Date('2026-10-28T09:00:00Z');
const OPENED_AT  = '2026-10-28T10:00:00+01:00';

const EXAMPLE_DECISION = {
  kind:      'agent-question',
  ticketIds: ['001'],
  jobId:     null,
  askedBy:   'builder',
  requestId: 'request-1',
  questions: [
    {
      question:    'Which export format?',
      header:      'Format',
      multiSelect: false,
      options:     [{ label: 'CSV', description: 'Comma separated', isRecommended: true }, { label: 'JSON', description: '', isRecommended: false }],
    },
    {
      question:    'Which columns?',
      header:      'Columns',
      multiSelect: true,
      options:     [
        { label: 'Name', description: '', isRecommended: false },
        { label: 'Total', description: '', isRecommended: false },
      ],
    },
  ],
  context: '',
} satisfies DecisionOpening;

let repositoryDirectory = '';

async function runWithExit(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLineArguments, context);
  return { exitCode, context };
}

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const { exitCode, context } = await runWithExit(commandLineArguments);
  expect(exitCode, `\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

async function openTheExampleDecision(): Promise<void> {
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace: workspacePathsFor(repositoryDirectory),
    at:        OPENED_AT,
    now:       () => FROZEN_NOW,
    mutate:    (change) => change.board.openDecision(EXAMPLE_DECISION, change.at),
  });
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('decision-commands', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  await fileReadyTicket(run, ['ticket', 'add', 'Example export', '--type', 'ticket']);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the decision commands', () => {
  test('decisions letters each option as decide takes it, marks the recommended one from its stored flag, and reads without writing', async () => {
    await openTheExampleDecision();
    const progressPath = localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).progressRecordPath;
    const before = readFileSync(progressPath, 'utf8');

    const listed = await run(['decisions']);
    expect(listed.outputText()).toContain('E1 agent-question on #001 (asked by builder');
    expect(listed.outputText()).toContain('  1. [Format] Which export format?\n     a. CSV (recommended): Comma separated\n     b. JSON\n');
    expect(listed.outputText()).toContain('  2. [Columns] Which columns? (several letters)');
    const recommendedFlags = [{ label: 'CSV', isRecommended: true }, { label: 'JSON', isRecommended: false }];
    const listedDecision   = { id: 'E1', requestId: 'request-1', questions: [{ options: recommendedFlags }, { header: 'Columns' }] };
    expect(JSON.parse((await run(['decisions', '--json'])).outputText())).toMatchObject({ decisions: [listedDecision] });
    expect(readFileSync(progressPath, 'utf8')).toBe(before);
  });

  test('decide answers with Hephaestus down, stores {question: answer}, logs it with its request, and the first answer wins', async () => {
    await openTheExampleDecision();
    const answered = await run(['decide', 'E1', 'b', 'ab', '--json']);
    expect(JSON.parse(answered.outputText())).toEqual({ decisionId: 'E1', answer: { 'Which export format?': 'JSON', 'Which columns?': 'Name, Total' } });
    const log = readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).logRecordPath, 'utf8');
    const storedAnswer = '{"answer":{"Which export format?":"JSON","Which columns?":"Name, Total"},"requestId":"request-1"}';
    expect(log).toContain(`"kind":"decision-answered","decisionId":"E1","fields":${storedAnswer}`);
    expect(JSON.parse((await run(['decisions', '--json'])).outputText())).toEqual({ decisions: [] });

    const second = await runWithExit(['decide', 'E1', 'a', 'a']);
    expect(second.exitCode).toBe(1);
    expect(second.context.errorText()).toContain('the first answer wins');
  });

  test('free text on a decision of two questions is refused, and nothing is written', async () => {
    await openTheExampleDecision();
    const refused = await runWithExit(['decide', 'E1', '--', 'Whatever', 'is', 'simplest']);
    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain('free text is given in the UI');
    expect(JSON.parse((await run(['decisions', '--json'])).outputText())).toMatchObject({ decisions: [{ id: 'E1' }] });
  });

  test('await wakes on a decision-opened past its position, and waits for one opened after it started', async () => {
    const logLength = readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).logRecordPath, 'utf8').split('\n').filter((line) => line !== '').length;
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
    let waitBegan = false;
    const waiting = runCommandLine(['await', '--json', '--after', String(logLength)], {
      ...context,
      onStopSignal: () => {
        waitBegan = true;
        return () => undefined;
      },
    });
    // The command goes from taking the stop signal into its first log read and watch without yielding, so this is it waiting.
    await waitUntil(() => waitBegan, 'await beginning its wait');
    await openTheExampleDecision();
    expect(await waiting).toBe(0);
    const woken = JSON.parse(context.outputText()) as { after: number; position: number; records: { kind: string; position: number }[] };
    expect(woken.records.map((record) => record.kind)).toEqual(['decision-opened']);
    expect(woken.records[0]?.position).toBe(woken.position);

    const replayed = JSON.parse((await run(['await', '--json', '--after', String(woken.after)])).outputText()) as typeof woken;
    expect(replayed.records).toEqual(woken.records);
  });
});
