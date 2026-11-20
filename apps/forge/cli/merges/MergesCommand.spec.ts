/**
 * `merges` lists the merge queue read-only. What matters: a held slot is listed with its phase and tips and leaves the queue, the queued
 * tickets follow in priority then queue order, or with merge approval on in User's press order, the accepted tickets first and the ones
 * waiting for an accept after them, as the Airlock takes them; and the read leaves the progress file byte-identical.
 */
import { readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
}                                             from 'bun:test';
import { localStoreLayoutOf }                      from '../../src/services/tracker/LocalStoreLayout.ts';
import { writeTracker }                            from '../../src/services/tracker/TrackerPipeline.ts';
import { workspacePathsFor }                       from '../../src/services/tracker/Workspace.ts';
import { EXAMPLE_GREEN_TREE, queueOnCurrentGreen } from '../../src/testing/GreenQueue.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                 from '../../src/testing/LockTakers.ts';
import { useRecordedGit }                          from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                  from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }               from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                          from '../Main.ts';
import { createCapturedCommandContext }            from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }  from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                         from '../testing/ReadyTicketFiling.ts';

const FROZEN_NOW = new Date('2026-10-28T09:00:00Z');
const QUEUED_AT  = '2026-10-28T10:00:00+01:00';
const TARGET_TIP = 'a'.repeat(40);
const BRANCH_TIP = 'b'.repeat(40);

let repositoryDirectory = '';

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLineArguments, context);
  expect(exitCode, `\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('merges-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  for (const [title, priority] of [['Example cart', 'normal'], ['Example checkout', 'high'], ['Example invoice', 'low']] as const) {
    await fileReadyTicket(run, ['ticket', 'add', title, '--type', 'ticket', '--priority', priority]);
  }
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace: workspacePathsFor(repositoryDirectory),
    at:        QUEUED_AT,
    now:       () => FROZEN_NOW,
    mutate:    (change) => {
      // The low ticket queues first, so only the priority order lists the normal one before it.
      for (const ticketId of ['003', '001', '002']) {
        change.board.moveTicket(ticketId, 'in-review', { checksLegality: false }, change.at);
        queueOnCurrentGreen(change.board, ticketId, 'main', change.at);
      }
      change.board.claimAirlock({
        ticketId: '002', target: 'main', targetTip: TARGET_TIP, branchTip: BRANCH_TIP, predictedConflictFiles: [],
      }, () => 'main', () => EXAMPLE_GREEN_TREE, change.at);
    },
  });
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the merges command', () => {
  test('lists the held slot, then the queued tickets in priority order, and the read leaves the progress file byte-identical', async () => {
    const { progressRecordPath } = localStoreLayoutOf(workspacePathsFor(repositoryDirectory));
    const before = readFileSync(progressRecordPath, 'utf8');

    const report = JSON.parse((await run(['merges', '--json'])).outputText()) as { slots: unknown[]; queue: { ticketId: string; priority: string }[] };

    expect(report.slots).toEqual([{
      target: 'main', jobId: expect.any(String), ticketIds: ['002'], phase: 'merge-in', targetTip: TARGET_TIP, branchTip: BRANCH_TIP,
    }]);
    expect(report.queue.map((queued) => [queued.ticketId, queued.priority])).toEqual([['001', 'normal'], ['003', 'low']]);
    expect((await run(['merges'])).outputText()).toContain('main: job ');
    expect(readFileSync(progressRecordPath, 'utf8')).toBe(before);
  });

  test('with merge approval on lists the accepted tickets in User\'s press order, whatever their priority, then the ones waiting for an accept', async () => {
    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace: workspacePathsFor(repositoryDirectory),
      at:        QUEUED_AT,
      now:       () => FROZEN_NOW,
      mutate:    (change) => {
        change.board.setApproval('merge', true, change.at);
        change.board.setTicketMergeAccepted('003', true, change.at);
      },
    });

    const report = JSON.parse((await run(['merges', '--json'])).outputText()) as { queue: { ticketId: string }[] };

    expect(report.queue.map((queued) => queued.ticketId)).toEqual(['003', '001']);
  });
});
