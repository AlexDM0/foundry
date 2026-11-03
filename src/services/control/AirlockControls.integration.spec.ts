/**
 * `merge accept` and `merge update` on a scratch repository. What matters: an accept is refused with merge approval off, for a ticket
 * not waiting for merge, and whenever git does not predict a clean merge into the target's current tip, and only a clean prediction sets
 * `mergeAccepted`; an update merges the target into the ticket's worktree with no Airlock held, leaving the queue mark for the Overseer's
 * gate run, while a conflict is aborted, the worktree left at its tip, and the ticket loses its review done and its accept.
 */
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { Board }                                   from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }                          from '../../shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }                                from '../../shared/constants/ProductNames.ts';
import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';
import { queueOnCurrentGreen }                          from '../../testing/GreenQueue.ts';
import {
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
}                                   from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import type { TrackerChange }       from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor }        from '../tracker/Workspace.ts';
import { ControlService }           from './ControlService.ts';

const AT = '2026-11-03T10:00:00+01:00';

let repository: string | null = null;

afterEach(() => {
  if (repository !== null) removeScratchDirectory(repository);
  repository = null;
});

interface Scenario {
  root:     string;
  worktree: string;
  board:    Board;
  apply:    (command: ControlCommand) => unknown;
}

/** Ticket 001 in review on main, its branch changing `base.ts` and its green current and queued; `mainChange` commits on main afterwards. */
function scenario(mainChange: [string, string] | null, mergeApprovalIsOn = true): Scenario {
  const root = createScratchGitRepository('airlock-controls');
  repository = root;
  gitOutputIn(root, ['checkout', '-q', '-B', 'main']);
  commitFile(root, 'base.ts', 'export const base = 1;\n');
  const worktree = join(root, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001');
  gitOutputIn(root, ['worktree', 'add', '-q', '-b', 'ticket-001', worktree, 'main']);
  commitFile(worktree, 'base.ts', 'export const base = 2;\n');
  if (mainChange !== null) commitFile(root, ...mainChange);
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review' })] });
  queueOnCurrentGreen(board, '001', 'main', AT, gitOutputIn(root, ['rev-parse', 'refs/heads/ticket-001^{tree}']));
  board.setApproval('merge', mergeApprovalIsOn, AT);
  const change = {
    board, workspace: workspacePathsFor(root), at: AT, malformedTickets: []
  } as unknown as TrackerChange;
  return {
    root, worktree, board, apply: (command) => ControlService.apply(command, change).result
  };
}

const ACCEPT: ControlCommand = { kind: 'merge-accept', ticketReference: '1' };
const UPDATE: ControlCommand = { kind: 'merge-update', ticketReference: '1' };

describeWhenGitIsPresent('merge accept', () => {
  test('a clean prediction sets mergeAccepted and logs it; a second accept changes nothing', () => {
    const { board, apply } = scenario(['cart.ts', 'export const cart = 1;\n']);
    expect(apply(ACCEPT)).toMatchObject({ logged: [{ kind: 'merge-acceptance-set', ticketId: '001', fields: { state: 'accepted' } }] });
    expect(board.ticketIsMergeAccepted('001')).toBe(true);
    expect(apply(ACCEPT)).toEqual({ logged: [], changed: false });
  });

  test('a branch that would conflict with the target\'s tip is refused with its files, and stays unaccepted', () => {
    const { board, apply } = scenario(['base.ts', 'export const base = 3;\n']);
    expect(refusalDetailOf(() => apply(ACCEPT))).toEqual({
      reason: 'merge-accept-would-conflict', ticketId: '001', target: 'main', conflictedFiles: ['base.ts']
    });
    expect(board.ticketIsMergeAccepted('001')).toBe(false);
  });

  test('is refused with merge approval off, and for a ticket whose review done is gone', () => {
    expect(refusalDetailOf(() => scenario(null, false).apply(ACCEPT))).toEqual({ reason: 'merge-approval-off', ticketId: '001' });
    const { board, apply } = scenario(null);
    board.setTicketMergeQueued('001', false, AT);
    expect(refusalDetailOf(() => apply(ACCEPT))).toEqual({ reason: 'merge-accept-of-a-ticket-not-waiting', ticketId: '001', status: 'in-review' });
  });

  test('a ticket whose branch moved past its green is not waiting, so it is refused', () => {
    const { worktree, apply } = scenario(null);
    commitFile(worktree, 'cart.ts', 'export const cart = 1;\n');
    expect(refusalDetailOf(() => apply(ACCEPT))).toMatchObject({ reason: 'merge-accept-of-a-ticket-not-waiting' });
  });
});

describeWhenGitIsPresent('merge update', () => {
  test('merges the target into the worktree with no job launched, keeping the queue mark for the Overseer\'s gate run', () => {
    const {
      root, worktree, board, apply
    } = scenario(['cart.ts', 'export const cart = 1;\n']);
    const mainTip = gitOutputIn(root, ['rev-parse', 'refs/heads/main']);
    expect(apply(UPDATE)).toMatchObject({ logged: [{ kind: 'merge-updated', ticketId: '001', fields: { target: 'main', outcome: 'merged' } }] });
    gitOutputIn(worktree, ['merge-base', '--is-ancestor', mainTip, 'HEAD']);
    expect(board.jobs()).toEqual([]);
    expect(board.ticketIsMergeQueued('001')).toBe(true);
    expect(board.greenIsCurrent('001', gitOutputIn(root, ['rev-parse', 'refs/heads/ticket-001^{tree}']))).toBe(false);
  });

  test('a conflict is aborted, the worktree left at its tip, and the ticket loses its review done and its accept', () => {
    const {
      root, worktree, board, apply
    } = scenario(['base.ts', 'export const base = 3;\n']);
    board.setTicketMergeAccepted('001', true, AT);
    const branchTip = gitOutputIn(root, ['rev-parse', 'refs/heads/ticket-001']);
    expect(apply(UPDATE)).toMatchObject({ logged: [{ kind: 'merge-updated', fields: { outcome: 'conflicted' } }] });
    expect(gitOutputIn(worktree, ['rev-parse', 'HEAD'])).toBe(branchTip);
    expect(gitOutputIn(worktree, ['status', '--porcelain'])).toBe('');
    expect(board.ticketIsMergeQueued('001')).toBe(false);
    expect(board.ticketIsMergeAccepted('001')).toBe(false);
  });

  test('is refused with merge approval off and for a ticket a job holds', () => {
    expect(refusalDetailOf(() => scenario(null, false).apply(UPDATE))).toEqual({ reason: 'merge-approval-off', ticketId: '001' });
    const { board, apply } = scenario(null);
    board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT);
    expect(refusalDetailOf(() => apply(UPDATE))).toEqual({ reason: 'merge-update-of-a-ticket-not-waiting', ticketId: '001', status: 'in-review' });
  });
});
