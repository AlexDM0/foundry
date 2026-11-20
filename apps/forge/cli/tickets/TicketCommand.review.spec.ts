/**
 * `ticket finish|rereview --start-review`: the move to review and the review bar in one lock hold, closing the round before's bar. A row takes
 * no launch slot, so what matters is the round each bar stores, that every move out of review closes the running bar, and that a running bar
 * refuses a claim of its ticket.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
}                                                                             from 'bun:test';
import type { Task }                              from '../../src/lib/tracker-model/@types/Task.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { runCommandLineWithOverseerMoves }        from '../testing/OverseerTicketMoves.ts';
import { fileReadyTicket }                        from '../testing/ReadyTicketFiling.ts';
import { storedLogEntriesOf }                     from '../testing/StoredLogEntries.ts';
import { storedProgressOf }                       from '../testing/StoredProgress.ts';

const FROZEN_NOW = new Date('2026-09-24T12:00:00Z');

const REVIEWED_TICKET_TITLE = 'Double-click a role to edit it';

let repositoryDirectory = '';

function contextHere(): ReturnType<typeof createCapturedCommandContext> {
  return createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
}

async function runWithExitCode(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = contextHere();
  const exitCode = await runCommandLineWithOverseerMoves(commandLineArguments, context);
  return { exitCode, context };
}

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const { context, exitCode } = await runWithExitCode(commandLineArguments);
  expect(exitCode, `\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

function inProgressBarsReviewing(ticketId: string): Task[] {
  return storedProgressOf(repositoryDirectory).tasks.filter((task) => task.status === 'in-progress' && task.reviewOf === ticketId);
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('ticket-start-review', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', REVIEWED_TICKET_TITLE]);
  await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Show the role history']);
  await run(['ticket', 'claim', '1', '--owner', 'opus']);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('starting the review bar with the move to review', () => {
  test('ticket rereview --start-review closes the round\'s running bar and starts the next, numbered from the ticket\'s review sections', async () => {
    await run(['ticket', 'finish', '1', '--start-review']);
    const [firstBar] = inProgressBarsReviewing('001');
    await run(['ticket', 'board-record', '1', '--append', '--body', '## Review\nRound 1 reworked 900 lines.\n']);

    await run(['ticket', 'rereview', '1', '--start-review', '--owner', 'opus']);

    const bars = inProgressBarsReviewing('001');
    expect(bars).toHaveLength(1);
    expect(bars[0]?.name).toBe(`Review 2 #001 — ${REVIEWED_TICKET_TITLE}`);
    expect(storedProgressOf(repositoryDirectory).tasks.find((task) => task.id === firstBar?.id)?.status).toBe('delivered');
  });

  test('each bar stores the round it was started for: 1 on finish, and the review sections plus one on rereview', async () => {
    await run(['ticket', 'finish', '1', '--start-review']);
    expect(inProgressBarsReviewing('001')[0]).toMatchObject({ reviewOf: '001', reviewBarRound: 1 });

    await run(['ticket', 'board-record', '1', '--append', '--body', '## Review\nExample round.\n']);
    await run(['ticket', 'rereview', '1', '--start-review']);

    expect(inProgressBarsReviewing('001')[0]).toMatchObject({ reviewOf: '001', reviewBarRound: 2 });
  });

  // A single-ticket dispatcher run launched late would otherwise claim the in-review ticket its whole-board twin is reviewing, and rebuild it.
  test('a claim of a ticket whose review bar runs is refused, and one after the bar is closed takes it for the rebuild', async () => {
    await run(['ticket', 'finish', '1', '--start-review']);
    const [bar] = inProgressBarsReviewing('001');

    const refused = await runWithExitCode(['ticket', 'claim', '1']);
    expect(refused.exitCode).toBe(1);
    expect(refused.context.errorText()).toContain(`Ticket #001 is under review: its review row #${bar?.id} is in progress`);
    expect(JSON.parse((await run(['ticket', 'show', '1', '--json'])).outputText())).toMatchObject({ status: 'in-review' });

    await run(['task', 'finish', String(bar?.id)]);
    await run(['task', 'deliver', String(bar?.id)]);
    await run(['ticket', 'claim', '1']);
    expect(JSON.parse((await run(['ticket', 'show', '1', '--json'])).outputText())).toMatchObject({ status: 'in-progress' });
  });

  // A bar left running would refuse the ticket's own claim.
  test('every move out of review closes the ticket\'s running bar with one log line', async () => {
    const movesOutOfReview: string[][] = [
      ['ticket', 'abandon', '1', '--reason', 'superseded by #2'],
      ['ticket', 'reopen', '1'],
      ['ticket', 'status', '1', 'reviewed'],
      ['ticket', 'status', '1', 'committed'],
    ];
    for (const moveOutOfReview of movesOutOfReview) {
      await run(['ticket', 'status', '1', 'in-review']);
      await run(['ticket', 'rereview', '1', '--start-review']);
      const [bar] = inProgressBarsReviewing('001');

      const output = (await run(moveOutOfReview)).outputText();

      expect(inProgressBarsReviewing('001'), moveOutOfReview.join(' ')).toHaveLength(0);
      expect(storedProgressOf(repositoryDirectory).tasks.find((task) => task.id === bar?.id)?.status).toBe('delivered');
      expect(output).toContain(`Closed the review row #${bar?.id}, delivered`);
      expect(storedLogEntriesOf(repositoryDirectory).filter((entry) => entry.text.startsWith(`Closed the review row #${bar?.id}`))).toHaveLength(1);
    }
  });

  test('a reopened ticket whose review bar ran can be claimed again', async () => {
    await run(['ticket', 'finish', '1', '--start-review']);
    await run(['ticket', 'reopen', '1']);

    await run(['ticket', 'claim', '1']);
  });

  // A bundle is one agent: its first ticket's reviewer works beside the builder that still runs the rest.
  test('a bundle\'s review bar carries the claim\'s agent key while the bundle\'s other rows still run', async () => {
    await run(['ticket', 'reopen', '1']);
    await run(['ticket', 'claim', '1', '2']);

    await run(['ticket', 'finish', '1', '--start-review']);
    expect(inProgressBarsReviewing('001')[0]?.agent).toBe('001,002');
  });

  test('--owner or --note without --start-review is refused, and nothing moves', async () => {
    const { exitCode, context } = await runWithExitCode(['ticket', 'rereview', '1', '--owner', 'opus']);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('only with --start-review');
    expect(JSON.parse((await run(['ticket', 'show', '1', '--json'])).outputText())).toMatchObject({ status: 'in-progress' });
  });
});
