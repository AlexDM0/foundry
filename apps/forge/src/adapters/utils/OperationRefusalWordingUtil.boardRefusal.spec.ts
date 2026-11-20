/**
 * A refusal is what the person who ran the command reads, and scripts match on it, so each reason must word as the command did before
 * the Board refused for it. The frozen table pins one row per reason, plus both hold actions, the singular and plural limit, a
 * rereview with and without the first-review advice, and a ticket-owned row sent to each end of the verb table. Through the API, which
 * the Bridge and a monitor show to User, no reason names a command line or a flag.
 */
import { expect, test } from 'bun:test';

import type { BoardRefusalDetail }               from '../../lib/tracker-model/BoardRefusal.ts';
import { OperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { ORIGINAL_PRODUCT_NAMES, PRODUCT_NAMES } from '../../shared/constants/ProductNames.ts';
import { COMMAND_LINE_FORM }                     from '../../testing/CommandLineForm.ts';
import { OperationRefusalWordingUtil }           from './OperationRefusalWordingUtil.ts';

const { boardRefusalMessageOf: messageOf } = OperationRefusalWordingUtil;

/** The table keeps the released program's name it was taken with; the wording names the program this build is linked by. */
function namingThisProgram(message: string): string {
  return message.replaceAll(new RegExp(`\`${RegExp.escape(ORIGINAL_PRODUCT_NAMES.PROGRAM)} (?!row:)`, 'g'), `\`${PRODUCT_NAMES.PROGRAM} `);
}

/**
 * Taken from the binary before the Board existed, at bc42604 (the last commit before step 4b). To retake a row, check that commit out in
 * a worktree, run the refused command with `bun run <worktree>/agent-progress.ts` in a scratch git repository after `init`, and copy its
 * standard error. Rows no command reaches easily (the singular limit, a ticket-owned row sent to re-review) are read from the wording in
 * bc42604:cli/task/TaskCommand.ts, bc42604:cli/ticket/TicketCommand.ts and bc42604:lib/tickets/TicketTransitions.ts. The two review-record
 * reasons are newer than bc42604, and their rows were taken from the wording util when they were added, as were the four draft reasons, the
 * lowering row's "draft or committed", the three network reasons, the five entity reasons and the already-filed ticket id.
 */
const MESSAGE_FOR_REFUSAL: readonly (readonly [BoardRefusalDetail, string])[] = [
  [{ reason: 'unknown-task', taskId: 99 }, 'There is no task #99. Run `agent-progress status` to see the rows this tracker holds.'],
  [
    {
      reason:       'ticket-owned-row',
      taskId:       3,
      ticketId:     '004',
      targetStatus: 'in-review',
    },
    'Task #3 belongs to ticket #004, so moving it here would leave the row and the ticket disagreeing. '
    + 'Run `agent-progress ticket status 004 in-review` instead, which moves both, or pass --force to move only the row.',
  ],
  [
    {
      reason:       'ticket-owned-row',
      taskId:       3,
      ticketId:     '004',
      targetStatus: 'committed',
    },
    'Task #3 belongs to ticket #004, so moving it here would leave the row and the ticket disagreeing. '
    + 'Run `agent-progress ticket reopen 004` instead, which moves both, or pass --force to move only the row.',
  ],
  [
    {
      reason:       'ticket-owned-row',
      taskId:       1,
      ticketId:     '001',
      targetStatus: 're-review',
    },
    'Task #1 belongs to ticket #001, so moving it here would leave the row and the ticket disagreeing. '
    + 'Run `agent-progress ticket rereview 001` instead, which moves both, or pass --force to move only the row.',
  ],
  [
    {
      reason:   'ticket-already-has-row',
      ticketId: '001',
      taskId:   1,
      taskName: '#001 Example checkout flow',
    },
    'Ticket #001 already has task #1 ("#001 Example checkout flow"). Pass --force to move the ticket on to the new row, or leave --ticket off.',
  ],
  [
    { reason: 'ticket-id-already-filed', ticketId: '015' },
    'Ticket #015 is already on the board, so a second ticket cannot take its id. Nothing was written.',
  ],
  [
    {
      reason:         'task-belongs-to-another-ticket',
      taskId:         3,
      owningTicketId: '004',
      ticketId:       '007',
    },
    'Task #3 already belongs to ticket #004. Pass --force to move it to ticket #007.',
  ],
  [
    { reason: 'ticket-already-in-status', ticketId: '004', status: 'reviewed' },
    'Ticket #004 is already reviewed, so nothing was changed and nothing was logged.',
  ],
  [
    {
      reason:       'illegal-ticket-move',
      ticketId:     '001',
      status:       'committed',
      targetStatus: 'reviewed',
    },
    'Ticket #001 is committed, and a move to reviewed takes a ticket that is in-progress or in-review. '
    + 'Run `agent-progress ticket status 001 reviewed` if you mean to set it directly.',
  ],
  [
    { reason: 'abandon-without-reason', ticketId: '006' },
    'Ticket #006 was not moved: abandon needs --reason. Say why the work was dropped, for example `agent-progress ticket abandon 3 --reason "superseded by #7"`.',
  ],
  [
    { reason: 'tokens-without-a-row', ticketId: '006' },
    'Ticket #006 has no row, so --tokens has nowhere to be recorded: a low-priority ticket gets its row when it is started. Drop --tokens.',
  ],
  [
    { reason: 'review-record-without-a-review-bar', ticketId: '006' },
    'Ticket #006 has no in-progress review bar, so there is no review pass to record and nothing was logged. '
    + 'A review is recorded on its own bar: `agent-progress task add "<name>" --review-of 006 --start` starts one.',
  ],
  [
    { reason: 'review-bar-without-a-round', ticketId: '006', taskId: 7 },
    'Review bar #7 of ticket #006 stores no round, so the pass cannot be recorded and nothing was logged. '
    + 'Start the pass on a bar of its own with `agent-progress task add "<name>" --review-of 006 --start`.',
  ],
  [
    { reason: 'review-record-on-a-row-that-is-not-a-review-bar', ticketId: '006', taskId: 7 },
    'Row #7 is not an in-progress review bar, so the review of ticket #006 cannot be recorded on it and nothing was logged. '
    + 'Pass --bar the row your review runs on, the `agent-progress row:` line of your prompt.',
  ],
  [
    {
      reason: 'review-record-on-a-bar-outside-the-bundle', ticketId: '006', taskId: 7, reviewOf: '004'
    },
    'Review bar #7 reviews ticket #004, which was not claimed with ticket #006, so the review cannot be recorded on it and nothing was logged. '
    + 'Pass --bar the review bar of the bundle holding the ticket.',
  ],
  [
    { reason: 'rereview-outside-review', ticketId: '001', status: 'committed' },
    'Ticket #001 is committed, and another review pass needs a ticket that is in-review.',
  ],
  [
    { reason: 'rereview-outside-review', ticketId: '003', status: 'in-progress' },
    'Ticket #003 is in-progress, and another review pass needs a ticket that is in-review. Run `agent-progress ticket status 003 in-review` to send it to its first reviewer.',
  ],
  [
    { reason: 'unclaimable-status', ticketId: '003', status: 'in-progress' },
    'Ticket #003 is in-progress, and a claim takes a ticket that is committed or in-review. Nothing was written.',
  ],
  [
    { reason: 'claim-waits-on-dependencies', ticketId: '007', unsettledTicketIds: ['001'] },
    'Ticket #007 is waiting on #001, which must be reviewed or delivered before it is claimed. Nothing was written.',
  ],
  [
    { reason: 'claim-of-a-held-ticket', ticketId: '001' },
    'Ticket #001 is held, so it is not claimed. Nothing was written; `agent-progress ticket unhold 001` lets it be claimed.',
  ],
  [
    { reason: 'network-of-a-ticket-past-committed', ticketId: '006', status: 'in-progress' },
    'Ticket #006 is in-progress, and its network line was not changed: it is set only while the ticket is draft or committed. Nothing was written.',
  ],
  [
    { reason: 'network-domain-not-public', ticketId: '002', domains: ['localhost'] },
    'Ticket #002\'s network line was not changed: localhost is not a public domain, '
    + 'and a loopback name, a .local name or a loopback or private IP address is never granted. Nothing was written.',
  ],
  [
    { reason: 'network-domain-not-public', ticketId: '002', domains: ['printer.local', '10.0.0.1'] },
    'Ticket #002\'s network line was not changed: printer.local, 10.0.0.1 are not public domains, '
    + 'and a loopback name, a .local name or a loopback or private IP address is never granted. Nothing was written.',
  ],
  [
    { reason: 'network-unchanged', ticketId: '002', domains: [] },
    'Ticket #002\'s network line was not changed: it already reads no domain. Nothing was written.',
  ],
  [
    {
      reason: 'unknown-entity', ticketId: '002', entity: 'web', entityKeys: []
    },
    'Ticket #002 was not given the entity web: the pipeline names no entity. Nothing was written.',
  ],
  [
    {
      reason: 'unknown-entity', ticketId: '002', entity: 'shop', entityKeys: ['root', 'web']
    },
    'Ticket #002 was not given the entity shop: the pipeline names no such entity, only root, web. Nothing was written.',
  ],
  [
    { reason: 'entity-of-a-ticket-past-committed', ticketId: '006', status: 'in-progress' },
    'Ticket #006 is in-progress, and its entity was not changed: it is set only while the ticket is draft, ready for review or committed. '
      + 'Nothing was written.',
  ],
  [{ reason: 'entity-unchanged', ticketId: '002', entity: 'web' }, 'Ticket #002\'s entity was not changed: it already is web. Nothing was written.'],
  [
    { reason: 'entity-without-reason', ticketId: '002' },
    'Ticket #002\'s entity was not changed: it needs --reason. Say why the ticket belongs to that entity. Nothing was written.',
  ],
  [
    { reason: 'need-outside-an-entity-build', jobId: 'J3' },
    'Job J3 declared no need: only a build job of an entity declares one. Nothing was written.',
  ],
  [
    {
      reason: 'need-entity-unknown', jobId: 'J3', entity: 'shop', entityKeys: ['root', 'web']
    },
    'Job J3 declared no need for shop: the pipeline names no such entity, only root, web. Nothing was written.',
  ],
  [
    { reason: 'need-of-own-entity', jobId: 'J3', entity: 'web' },
    'Job J3 declared no need for web: it builds in that entity, so it makes the change itself. Nothing was written.',
  ],
  [
    { reason: 'need-incomplete', jobId: 'J3', gaps: ['title-missing', 'acceptance-unnumbered'] },
    'Job J3 declared no need: the need is incomplete: it has no title (title-missing), and its `## Acceptance` holds no numbered item '
      + '(acceptance-unnumbered). Nothing was written.',
  ],
  [
    { reason: 'need-limit-reached', jobId: 'J3', limit: 5 },
    'Job J3 declared no need: it has already declared 5, as many as one job may. Nothing was written.',
  ],
  [
    { reason: 'claim-under-review', ticketId: '004', reviewBarTaskId: 7 },
    'Ticket #004 is under review: its review row #7 is in progress. Nothing was written.',
  ],
  [
    {
      reason:             'concurrency-limit-reached',
      ticketIds:          ['001'],
      agentsInFlight:     3,
      inProgressRowCount: 4,
      limit:              2,
    },
    'Ticket #001 was not claimed: 3 agents are in flight (4 rows are in progress) and the concurrency limit is 2 agents. '
    + 'Nothing was written; claim once an agent has finished.',
  ],
  [
    {
      reason:             'concurrency-limit-reached',
      ticketIds:          ['001'],
      agentsInFlight:     1,
      inProgressRowCount: 1,
      limit:              1,
    },
    'Ticket #001 was not claimed: 1 agent is in flight (1 row is in progress) and the concurrency limit is 1 agent. '
    + 'Nothing was written; claim once an agent has finished.',
  ],
  [
    {
      reason:             'concurrency-limit-reached',
      ticketIds:          ['003', '004', '005'],
      agentsInFlight:     2,
      inProgressRowCount: 2,
      limit:              2,
    },
    'Tickets #003, #004, #005 were not claimed: 2 agents are in flight (2 rows are in progress) and the concurrency limit is 2 agents. '
    + 'Nothing was written; claim once an agent has finished.',
  ],
  [
    { reason: 'unknown-dependency', missingTicketIds: ['042'] },
    'There is no ticket #042. Run `agent-progress ticket list` to see what this tracker holds.',
  ],
  [
    { reason: 'dependency-loop', loopTicketIds: ['001', '003', '001'] },
    'That would make tickets wait on each other in a circle: #001 → #003 → #001.',
  ],
  [
    { reason: 'dependency-loop', loopTicketIds: ['001', '001'] },
    'That would make tickets wait on each other in a circle: #001 → #001.',
  ],
  [
    {
      reason:   'priority-unchanged',
      ticketId: '001',
      status:   'committed',
      priority: 'normal',
    },
    'Ticket #001 is committed, and its priority was not changed: it is already normal priority. Nothing was written.',
  ],
  [
    { reason: 'lowering-a-ticket-that-is-not-committed', ticketId: '003', status: 'in-progress' },
    'Ticket #003 is in-progress, and its priority was not changed: only a draft or committed ticket can be lowered to low, since a low ticket has no row until it is started. '
    + 'Nothing was written.',
  ],
  [
    { reason: 'move-to-draft', ticketId: '003', status: 'committed' },
    'Ticket #003 is committed, and no move returns a ticket to draft: filing is the only way in. '
    + 'Run `agent-progress ticket hold 003` to keep it from being built for now.',
  ],
  [
    { reason: 'move-of-a-draft', ticketId: '003', targetStatus: 'in-progress' },
    'Ticket #003 is a draft ticket, so it was not moved: '
    + 'run `agent-progress ticket ready 003` to ready it to build, which checks its Acceptance and Brief.',
  ],
  [
    { reason: 'ready-of-a-ticket-not-in-draft', ticketId: '003', status: 'in-review' },
    'Ticket #003 is in-review, not a draft ticket, so nothing was readied: only a draft ticket is readied. Nothing was written.',
  ],
  [
    {
      reason:            'incomplete-tickets',
      incompleteTickets: [{ ticketId: '003', gaps: ['acceptance-unnumbered'] }, { ticketId: '004', gaps: ['acceptance-unnumbered', 'brief-missing'] }],
    },
    'Nothing was readied: ticket #003 is incomplete: its `## Acceptance` holds no numbered item (acceptance-unnumbered); '
    + 'ticket #004 is incomplete: its `## Acceptance` holds no numbered item (acceptance-unnumbered), and it has no `## Brief` with a non-blank line (brief-missing). '
    + 'Number every Acceptance item as `A1.` at the start of a line and write a `## Brief`, then ready them again.',
  ],
  [
    { reason: 'ticket-without-entity', ticketIds: ['003'] },
    'Nothing was readied: ticket #003 has no entity, and each ticket builds in the pipeline of its entity. '
    + 'Give it one with `agent-progress ticket entity <id> <key> --reason <text>`, then ready it again.',
  ],
  [
    { reason: 'ticket-without-entity', ticketIds: ['003', '004'] },
    'Nothing was readied: ticket #003, ticket #004 have no entity, and each ticket builds in the pipeline of its entity. '
    + 'Give each one with `agent-progress ticket entity <id> <key> --reason <text>`, then ready them again.',
  ],
  [
    {
      reason:         'work-outside-entity',
      ticketsOutside: [
        { ticketId: '003', entity: 'shop', paths: ['/apps/admin/src/Example.ts', '/scripts/Example.ts'] },
        { ticketId: '004', entity: 'admin', paths: ['/apps/shop/src/Example.ts'] },
      ],
    },
    'Nothing was readied: ticket #003 of shop names /apps/admin/src/Example.ts, /scripts/Example.ts as its work; '
    + 'ticket #004 of admin names /apps/shop/src/Example.ts as its work, outside its entity and the packages it may cross into. '
    + 'A ticket builds only in its own entity: file that work as a ticket of the entity that owns it, or correct the Brief, then ready it again.',
  ],
  [
    { reason: 'agents-of-a-settled-ticket', ticketId: '004', status: 'delivered' },
    'Ticket #004 is delivered, and its agents were not changed: no agent will work it again. Nothing was written.',
  ],
  [
    {
      reason:   'size-unchanged',
      ticketId: '003',
      status:   'delivered',
      size:     'M',
    },
    'Ticket #003 is delivered, and its size was not changed: it is already M. Nothing was written.',
  ],
  [
    {
      reason:   'agents-unchanged',
      ticketId: '003',
      status:   'in-progress',
      agents:   { model: 'sonnet', effort: 'high' },
    },
    'Ticket #003 is in-progress, and its agents were not changed: they already run on sonnet/high. Nothing was written.',
  ],
  [
    {
      reason:   'hold-of-a-settled-ticket',
      ticketId: '004',
      status:   'delivered',
      action:   'hold',
    },
    'Ticket #004 is delivered, and no agent will work it again, so there is nothing to hold. Nothing was written.',
  ],
  [
    {
      reason:   'hold-of-a-settled-ticket',
      ticketId: '004',
      status:   'delivered',
      action:   'unhold',
    },
    'Ticket #004 is delivered, and no agent will work it again, so there is nothing to unhold. Nothing was written.',
  ],
  [{ reason: 'ticket-already-held', ticketId: '001' }, 'Ticket #001 is already held. Nothing was written.'],
  [{ reason: 'ticket-not-held', ticketId: '001' }, 'Ticket #001 is not held. Nothing was written.'],
  [
    { reason: 'ticket-not-interrupted', ticketId: '001' },
    'Ticket #001 has no interrupted job and no hold an interruption put on, so there is nothing of it to resume. Nothing was written.',
  ],
  [
    {
      reason:   'release-mark-of-a-settled-ticket',
      ticketId: '004',
      status:   'abandoned',
      action:   'mark',
    },
    'Ticket #004 is abandoned, and its release mark was not set: no agent will work it again. Nothing was written.',
  ],
  [
    {
      reason:   'release-mark-of-a-settled-ticket',
      ticketId: '004',
      status:   'delivered',
      action:   'clear',
    },
    'Ticket #004 is delivered, and its release mark was not cleared: no agent will work it again. Nothing was written.',
  ],
  [
    { reason: 'release-mark-of-an-ungrouped-ticket', ticketId: '001' },
    'Ticket #001 belongs to no group, so it cannot be a group\'s release ticket. Nothing was written.',
  ],
  [
    {
      reason:          'group-already-has-a-release-ticket',
      ticketId:        '003',
      group:           'example-shop',
      releaseTicketId: '002',
    },
    'Group example-shop already has its release ticket, #002: clear it with `agent-progress ticket release-of 002 --clear` first. Nothing was written.',
  ],
  [
    {
      reason:          'group-already-has-a-release-ticket',
      ticketId:        '002',
      group:           'example-shop',
      releaseTicketId: '002',
    },
    'Ticket #002 is already the release ticket of group example-shop. Nothing was written.',
  ],
  [{ reason: 'ticket-is-not-a-release-ticket', ticketId: '001' }, 'Ticket #001 is not its group\'s release ticket. Nothing was written.'],
  [
    {
      reason:          'reopen-beside-an-open-release-ticket',
      ticketId:        '001',
      status:          'abandoned',
      targetStatus:    'committed',
      group:           'example-shop',
      releaseTicketId: '002',
    },
    'Ticket #001 is abandoned and carries the release mark of group example-shop, so it was not moved to committed: '
      + 'the group already has its open release ticket, #002, and a group has one. '
      + 'Clear that mark with `agent-progress ticket release-of 002 --clear` first. Nothing was written.',
  ],
  [
    { reason: 'malformed-epic-key', epicKey: 'Checkout_Redesign' },
    '"Checkout_Redesign" is not a usable epic key: a key is lower-case letters and digits, in words joined by single hyphens, '
    + 'such as `checkout-redesign`, and not a device name Windows reserves (con, prn, aux, nul, com1-9, lpt1-9). Nothing was written.',
  ],
  [
    { reason: 'malformed-group-name', group: 'Example_Shop' },
    '"Example_Shop" is not a usable group name: a group is lower-case letters and digits, in words joined by single hyphens, '
    + 'such as `checkout-redesign`, on every OS. Nothing was written.',
  ],
  [
    { reason: 'group-name-case-twin', group: 'example-shop', existingGroup: 'Example-Shop' },
    'Group "example-shop" differs from the existing group "Example-Shop" only in case, and a case-insensitive '
    + 'file system gives both one branch and one worktree. Nothing was written.',
  ],
  [
    { reason: 'group-of-a-settled-ticket', ticketId: '001', status: 'abandoned' },
    'Ticket #001 is abandoned, and it was not put into a group: no agent will work it again. Nothing was written.',
  ],
  [
    { reason: 'ticket-already-in-a-group', ticketId: '001', group: 'example-shop' },
    'Ticket #001 is already in group example-shop, and a ticket stays in the group it is in. Nothing was written.',
  ],
  [
    { reason: 'epic-already-exists', epicKey: 'checkout-redesign' },
    'There is already an epic checkout-redesign. Nothing was written; `agent-progress epic edit checkout-redesign` changes it.',
  ],
  [
    { reason: 'unknown-epic', missingEpicKeys: ['checkout-redesign', 'search'] },
    'There is no epic checkout-redesign, search. Nothing was written; run `agent-progress epic list` to see what this tracker holds.',
  ],
  [
    { reason: 'epic-still-named', epicKey: 'checkout-redesign', ticketIds: ['003'] },
    'Epic checkout-redesign was not removed: #003 still names it. Nothing was written; '
    + '`agent-progress ticket epic <id> --remove checkout-redesign` takes it off a ticket.',
  ],
  [
    { reason: 'unknown-gate', gateName: 'lint', gateNames: ['test', 'types'] },
    'There is no gate lint: the gates are test, types. Nothing was written.',
  ],
  [
    { reason: 'approval-without-pipeline', approval: 'tickets' },
    'No gate pipeline is stored, so approval tickets was not set: set the gates first with `agent-progress gate add` or '
    + '`agent-progress gate none`. Nothing was written.',
  ],
];

const REFUSAL_REASON_COUNT = 63;

test('every reason words as the refusal the command printed before the Board refused for it', () => {
  expect(new Set(MESSAGE_FOR_REFUSAL.map(([detail]) => detail.reason)).size, 'the table covers every reason').toBe(REFUSAL_REASON_COUNT);
  for (const [detail, message] of MESSAGE_FOR_REFUSAL) expect(messageOf(detail), detail.reason).toBe(namingThisProgram(message));
});

test('through the API no reason names a command line or a flag, though the command line names one for some', () => {
  const apiSentenceOf = (detail: BoardRefusalDetail): string => OperationRefusalWordingUtil.apiMessageOf(
    new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal: detail })
  );
  expect(MESSAGE_FOR_REFUSAL.filter(([detail]) => COMMAND_LINE_FORM.test(messageOf(detail))).length).toBeGreaterThan(0);
  for (const [detail] of MESSAGE_FOR_REFUSAL) expect(apiSentenceOf(detail), detail.reason).not.toMatch(COMMAND_LINE_FORM);
});

// No earlier command refused for a job, so these rows are this suite's own wording; an illegal move names the states the table allows.
test.each<[BoardRefusalDetail, string]>([
  [{ reason: 'unknown-job', jobId: 'J9' }, 'There is no job J9. Nothing was written.'],
  [{ reason: 'job-finished', jobId: 'J3' }, 'Job J3 is finished, and a finished job is never continued. Nothing was written.'],
  [{ reason: 'job-not-interrupted', jobId: 'J3' }, 'Job J3 is not interrupted, so there is nothing of it to resume. Nothing was written.'],
  [
    {
      reason: 'job-move-illegal', jobId: 'J3', state: 'running', targetState: 'landing'
    },
    'Job J3 is running, so it cannot move to landing: only a job gating can. Nothing was written.',
  ],
  [
    {
      reason: 'job-move-illegal', jobId: 'J3', state: 'running', targetState: 'launching'
    },
    'Job J3 is running, so it cannot move to launching: only a job being launched can. Nothing was written.',
  ],
  [
    { reason: 'merge-queue-of-a-ticket-not-in-review', ticketId: '004', status: 'in-progress' },
    'Ticket #004 is in-progress, so it was not queued to merge: only a ticket in review whose review passed is. Nothing was written.',
  ],
])('the job refusal %o words as its sentence', (detail, message) => {
  expect(messageOf(detail)).toBe(message);
});

// No earlier command refused a decision or an incident, so these rows are this suite's own wording.
test.each<[BoardRefusalDetail, string]>([
  [{ reason: 'unknown-decision', decisionId: 'E9' }, 'There is no decision E9. Nothing was written.'],
  [{ reason: 'decision-already-answered', decisionId: 'E7' }, 'Decision E7 is already settled, and the first answer wins. Nothing was written.'],
  [
    {
      reason: 'decision-answer-count', decisionId: 'E7', answerCount: 1, questionCount: 2
    },
    'Decision E7 asks 2 questions, so it takes one answer for each, not 1. Nothing was written.',
  ],
  [
    {
      reason: 'decision-answer-count', decisionId: 'E7', answerCount: 2, questionCount: 1
    },
    'Decision E7 asks 1 question, so it takes one answer for each, not 2. Nothing was written.',
  ],
  [{ reason: 'decision-without-questions' }, 'A decision asks at least one question, and this one asks none. Nothing was written.'],
  [
    { reason: 'decision-questions-repeat', question: 'Same?' },
    'A decision\'s answers are kept by question, so no two of its questions may read "Same?". Nothing was written.',
  ],
  [{ reason: 'unknown-incident', incidentId: 'I9' }, 'There is no incident I9. Nothing was written.'],
  [{ reason: 'incident-closed', incidentId: 'I4' }, 'Incident I4 is already closed. Nothing was written.'],
])('the decision or incident refusal %o words as its sentence', (detail, message) => {
  expect(messageOf(detail)).toBe(message);
});

// No earlier command placed a gate in a phase, so these rows are this suite's own wording; a reorder names the gates the phase runs.
test.each<[BoardRefusalDetail, string]>([
  [{ reason: 'gate-without-phase', gateName: 'lint' }, 'The gate lint must run in at least one phase: build, review or merge. Nothing was written.'],
  [
    { reason: 'unknown-gate-phase', phase: 'deploy', phases: ['build', 'review', 'merge'] },
    'There is no phase deploy: the phases are build, review, merge. Nothing was written.',
  ],
  [
    {
      reason: 'phase-order-not-a-reorder', phase: 'merge', names: ['test'], phaseGateNames: ['types', 'test']
    },
    'The merge phase was not reordered: name each of types, test once, and no other gate. Nothing was written; '
    + '`agent-progress gate add <name> --phases` changes the phases a gate runs in.',
  ],
  [
    {
      reason: 'phase-order-not-a-reorder', phase: 'review', names: ['test'], phaseGateNames: []
    },
    'The review phase was not reordered: it runs no gate. Nothing was written; `agent-progress gate add <name> --phases` changes the phases a '
    + 'gate runs in.',
  ],
])('the gate phase refusal %o words as its sentence', (detail, message) => {
  expect(messageOf(detail)).toBe(namingThisProgram(message));
});

// No earlier command refused a pipeline setup move, so these rows are this suite's own wording.
test.each<[BoardRefusalDetail, string]>([
  [{ reason: 'setup-in-progress', setupId: 'S1' }, 'Pipeline setup S1 is open, and only one setup is open at a time. Nothing was written. Resume it, or start it over.'],
  [{ reason: 'no-setup-open', setupId: 'S2' }, 'Pipeline setup S2 is not open. Nothing was written.'],
  [
    { reason: 'pipeline-setup-unreadable', problem: 'setupId is missing' },
    'The pipeline setup record cannot be read: setupId is missing. Nothing was written. Repair or remove pipeline-setup.json in the data folder.',
  ],
  [{ reason: 'no-pipeline-to-update', mode: 'update' }, 'No pipeline is stored, so there is nothing to update: set the pipeline up first. Nothing was written.'],
  [{ reason: 'pipeline-apply-pending', setupId: 'S1' }, 'Pipeline setup S1 waits for its Apply to land, so it cannot change now: cancel the Apply first. Nothing was written.'],
  [{ reason: 'billing-cap-not-positive', maxBudgetUsd: 0 }, 'A budget cap of 0 USD is not above 0: give a positive cap, or none. Nothing was written.'],
  [
    {
      reason: 'setup-step-not-current', setupId: 'S1', step: 'design', currentStep: 'research'
    },
    'Pipeline setup S1 is at the research step, not design, so design was not continued. Nothing was written.',
  ],
  [{ reason: 'setup-step-not-reached', setupId: 'S1', step: 'design' }, 'Pipeline setup S1 has not reached the design step, so it cannot go back to it. Nothing was written.'],
  [{ reason: 'setup-step-not-continued', setupId: 'S1', step: 'apply' }, 'The apply step of pipeline setup S1 ends with an Apply, not a Continue. Nothing was written.'],
  [{ reason: 'unknown-setup-question', setupId: 'S1', questionId: 'Q9' }, 'Pipeline setup S1 has no question Q9. Nothing was written.'],
  [
    { reason: 'empty-setup-answer', setupId: 'S1', questionId: 'Q1' },
    'The answer to Q1 of pipeline setup S1 names no option and holds no text. Nothing was written.',
  ],
  [
    {
      reason: 'setup-question-option-count', optionCount: 1, minimum: 2, maximum: 4
    },
    'A setup question takes 2 to 4 options, and 1 was given. Nothing was written.',
  ],
  [{ reason: 'setup-question-without-recommendation' }, 'A setup question needs the option the agent recommends. Nothing was written.'],
  [{ reason: 'unknown-setup-option-letters', unknownLetters: ['c'], optionLetters: ['a', 'b'] }, 'There is no option c: the options are a, b. Nothing was written.'],
  [{ reason: 'several-letters-on-single-select-setup-question', letters: ['a', 'b'] }, 'a, b names several options, and the setup question takes one. Nothing was written.'],
  [{ reason: 'constitution-empty' }, 'The constitution has no text. Nothing was written.'],
  [{ reason: 'constitution-too-long', characterCount: 20_001, limit: 20_000 }, 'The constitution holds 20001 characters, and it may hold at most 20000. Nothing was written.'],
  [
    { reason: 'constitution-source-unanchored', lineText: '- Keep it small.', occurrence: 2 },
    'A source names the line "- Keep it small." (occurrence 2), and the constitution does not hold that line that many times. Nothing was written.',
  ],
  [
    { reason: 'constitution-source-repeated', lineText: '- Keep it small.', occurrence: 1 },
    'Two sources name the line "- Keep it small." (occurrence 1); a line takes one source. Nothing was written.',
  ],
  [
    {
      reason: 'constitution-source-not-ticked', lineText: '- Keep it small.', occurrence: 1, kind: 'installed-default'
    },
    'A source names the line "- Keep it small." (occurrence 1) as installed-default, and the SOURCES ticks of the setup do not select '
      + 'installed-default. Nothing was written. Name only the sources the ticks select.',
  ],
  [
    {
      reason: 'constitution-draft-stale', setupId: 'S1', revision: 1, currentRevision: 2
    },
    'The constitution of pipeline setup S1 is at revision 2, not 1: it changed since it was read. Nothing was written. Read it again, then edit.',
  ],
  [
    {
      reason: 'pipeline-draft-stale', setupId: 'S1', revision: 3, currentRevision: 4
    },
    'The draft pipeline of pipeline setup S1 is at revision 4, not 3: it changed since it was read. Nothing was written. Read it again, then edit.',
  ],
  [{ reason: 'no-draft-edits', setupId: 'S1' }, 'The edit of pipeline setup S1 names no change. Nothing was written.'],
  [
    { reason: 'draft-edit-name-mismatch', field: 'gate:test', name: 'lint' },
    'The edit of gate:test names lint: a gate or prepare step keeps the name its field gives it. Nothing was written.',
  ],
  [
    { reason: 'prepare-order-not-a-reorder', names: ['build'], prepareNames: ['install', 'build'] },
    'The prepare steps were not reordered: name each of install, build once, and no other step. Nothing was written.',
  ],
  [{ reason: 'unknown-setup-edit', setupId: 'S1', editId: 'E9' }, 'Pipeline setup S1 has no edit E9. Nothing was written.'],
  [{ reason: 'setup-edit-already-undone', setupId: 'S1', editId: 'E1' }, 'Edit E1 of pipeline setup S1 is already undone. Nothing was written.'],
])('the pipeline setup refusal %o words as its sentence', (detail, message) => {
  expect(messageOf(detail)).toBe(message);
});

const ENTITY_APPLY_REFUSALS: readonly (readonly [BoardRefusalDetail, string, string])[] = [
  [
    {
      reason: 'entity-named-by-tickets', setupId: 'S1', entity: 'docs', ticketIds: ['019']
    },
    'The Apply would remove or rename entity docs, and ticket #019 names it. Nothing was written. '
      + `Give it another entity with \`${PRODUCT_NAMES.PROGRAM} ticket entity <id> <key> --reason <text>\`, or let it land, then apply again.`,
    'The Apply would remove or rename entity docs, and ticket #019 names it. Nothing was written. '
      + 'The product owner gives it another entity, or it lands; then apply again.',
  ],
  [
    { reason: 'entities-while-tickets-in-flight', setupId: 'S1', ticketIds: ['014', '015'] },
    'This pipeline cannot turn into entities yet: tickets #014, #015 are in progress, in review or reviewed under the pipeline without '
      + 'entities. Nothing was written. Apply once they land.',
    'This pipeline cannot turn into entities yet: tickets #014, #015 are in progress, in review or reviewed under the pipeline without '
      + 'entities. Nothing was written. Apply once they land.',
  ],
  [
    {
      reason: 'constitution-moved', setupId: 'S1', baseBlob: 'a1', mainBlob: 'b2', entity: 'web'
    },
    'The constitution of entity web on the main line changed since the Apply of pipeline setup S1 read it (blob b2, not a1), so the Apply '
      + 'would overwrite that change. Nothing was written. Apply again.',
    'The constitution of entity web on the main line changed since the Apply of pipeline setup S1 read it (blob b2, not a1), so the Apply '
      + 'would overwrite that change. Nothing was written. Apply again.',
  ],
];

test.each(ENTITY_APPLY_REFUSALS)('the entity Apply refusal %o words as its sentence on the command line and through the API', (detail, message, apiMessage) => {
  expect(messageOf(detail)).toBe(message);
  expect(OperationRefusalWordingUtil.apiMessageOf(new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal: detail }))).toBe(apiMessage);
});

test('a draft question without a recommendation words as needing the option the agent recommends, with the flag only on the command line', () => {
  const detail: BoardRefusalDetail = { reason: 'draft-question-without-recommendation', draftId: 'D2' };
  expect(messageOf(detail)).toBe('A question needs --recommended <letter>, the option the agent recommends. Nothing was written.');
  expect(OperationRefusalWordingUtil.apiMessageOf(new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal: detail })))
    .toBe('A question needs the option the agent recommends. Nothing was written.');
});
