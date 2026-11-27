/**
 * A need from declaration to its rerun, strategy section 4.3 steps 1 to 6, on a board of a forge with entities. What matters: the need is filed as its
 * entity's ticket, stamped `filedByJob`, with its title and body, `committed` with ticket review off and `ready-for-review` with it on; every ticket of
 * the declaring job waits on it, it waits on none of them, and each waiting ticket logs `need-declared`; the needs leave the board, which then holds no
 * `needs` key, also when the declaring job ends another way; a need for a root entity without gates opens `need-for-root` and files nothing, and one
 * with gates is filed; the waiting ticket keeps its status and launches nothing until the need is delivered, a reviewed need not being on the main line
 * yet, then its stage runs again in the same attempt, as stage 1 of its entity, and is told the needs it declared, resuming the session; the need
 * runs at the waiting ticket's priority, also once it is raised later; and an abandoned need drops out of `dependsOn` with a `need-abandoned`
 * decision that holds the ticket. A crossing ticket's package build that needs a third entity ends `needs-declared` and keeps the ticket in
 * stage 2 of the package, which launches nothing until the need is delivered and then runs the package build again; one that needs the
 * home entity, which consumes the package, opens `need-closes-circle` (E24).
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { JobLaunch }                     from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                     from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                      from '../../domain/tracker-model/@types/Pipeline.ts';
import type { DecisionWording, PlaybookStep } from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { TicketStage }                   from '../../domain/tracker-model/@types/Task.ts';
import type { TrackerProgress }               from '../../domain/tracker-model/@types/TrackerProgress.ts';
import type { Board }                         from '../../domain/tracker-model/Board.ts';
import { LIFECYCLE_LIMITS }                   from '../../shared/constants/LifecycleLimits.ts';
import {
  boardFixture,
  entityPipelineFixture,
  taskFixture,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import { ENTITY_FORGE_ENTITIES, entityForgePipelineOf }      from '../../testing/EntityForgeFixture.ts';
import { NO_LISTED_TICKET_LOCATIONS, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../../testing/ScratchWorkspace.ts';
import type { BoardTransaction }                             from '../tracker/BoardTransaction.ts';
import { createLocalRecordAllocation }                       from '../tracker/LocalRecordAllocation.ts';
import type { Workspace }                                    from '../tracker/Workspace.ts';
import { NeedTickets }                                       from './NeedTickets.ts';

const AT = '2026-11-17T12:00:00+01:00';

const NEED_BODY = '## Acceptance\n\nA1. The web app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n';

const NEED = { entity: 'design-system', title: 'Export the basket total', body: NEED_BODY };

const WORDING: DecisionWording = {
  questions: [{
    question: 'Example decision?', header: 'example', multiSelect: false, options: []
  }],
  context: '',
};

const BUILD_OF_WEB: JobLaunch = {
  kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: 'web', stage: 1
};

const folders: string[] = [];

/** The local adapter's allocation over a scratch tracker folder, so a filed need gets the id its tickets folder gives. */
function scratchRecordAllocationOf(trackerDirectory: string, board: Board): BoardTransaction['records'] {
  return createLocalRecordAllocation({ trackerDirectory } as Workspace, board, NO_UNREADABLE_RECORDS, NO_LISTED_TICKET_LOCATIONS);
}

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface DeclaredBoard {
  board:    Board;
  records:  LogRecord[];
  progress: TrackerProgress;
  change:   BoardTransaction;
}

/** Ticket 001 of `web` in progress, its build J1 having declared `NEED` and nothing else logged yet. */
function boardWithADeclaredNeed(pipeline: Pipeline = entityPipelineFixture(), need: typeof NEED = NEED): DeclaredBoard {
  const fixture = boardFixture({ pipeline, tickets: [ticketFixture({ id: '001', status: 'in-progress', entity: 'web' })] });
  fixture.board.setHephaestusState('running', AT);
  fixture.board.launchJob(BUILD_OF_WEB, AT);
  fixture.board.declareNeed('J1', need, () => []);
  const trackerDirectory = createScratchDirectory('need-tickets');
  folders.push(trackerDirectory);
  // The cast: filing reads only the Board, the stamp of the hold and the records, which allocate in the scratch tracker folder.
  const change = { board: fixture.board, at: AT, records: scratchRecordAllocationOf(trackerDirectory, fixture.board) } as unknown as BoardTransaction;
  return {
    board: fixture.board, records: fixture.records, progress: fixture.progress, change
  };
}

function withTicketReviewOff(pipeline: Pipeline): Pipeline {
  return { ...pipeline, approvals: { tickets: false } };
}

/** The declaring job's need filed and the job ended `needs-declared`, as the hold that verifies its report does. */
function fileAndEnd({ board, change }: DeclaredBoard): void {
  const job = board.jobById('J1');
  if (job === undefined) throw new Error('The declaring job is gone.');
  NeedTickets.fileNeedsOf(change, job, () => WORDING);
  board.endJob('J1', { outcome: 'needs-declared' }, AT);
}

function followThePlaybook(board: Board): readonly PlaybookStep[] {
  return board.followPlaybook({ ...LIFECYCLE_LIMITS, now: AT, usageResetsAt: null }, {
    mainLine:                     'main',
    groupTargetPrefix:            'group-',
    installVersionChanged:        false,
    ticketIdsTouchingAgentConfig: [],
    closedDeliveryTurns:          [],
    budgetSpentDeliveryTurns:     [],
    assistantHasAnswered:         false,
    assistantBootRetryDue:        false,
  }, () => WORDING).steps;
}

function ticketOf(board: Board, ticketId: string) {
  return board.tickets().find((ticket) => ticket.frontmatter.id === ticketId);
}

function launchesOf(steps: readonly PlaybookStep[]): PlaybookStep[] {
  return steps.filter((step) => step.kind === 'launch-build' || step.kind === 'launch-review');
}

describe('filing a declared need', () => {
  test('files it as its entity\'s ticket, filed by the job, committed with ticket review off, and the job\'s ticket waits on it', () => {
    const declared = boardWithADeclaredNeed(withTicketReviewOff(entityPipelineFixture()));
    const job = declared.board.jobById('J1');
    if (job === undefined) throw new Error('The declaring job is gone.');
    const filed = NeedTickets.fileNeedsOf(declared.change, job, () => WORDING);

    expect(filed.filedNeedCount).toBe(1);
    expect(ticketOf(declared.board, '002')?.frontmatter).toMatchObject({
      title: NEED.title, entity: 'design-system', filedByJob: 'J1', status: 'committed'
    });
    expect(ticketOf(declared.board, '002')?.body).toBe(NEED_BODY);
    expect(ticketOf(declared.board, '002')?.frontmatter.dependsOn).toBeUndefined();
    expect(ticketOf(declared.board, '001')?.frontmatter).toMatchObject({ status: 'in-progress', dependsOn: ['002'] });
    expect(filed.logged.find((record) => record.kind === 'need-declared'))
      .toMatchObject({ ticketId: '001', fields: { entity: 'design-system', title: NEED.title, byJob: 'J1' } });
  });

  test('with ticket review on, the need waits for the owner and the job\'s ticket still waits on it', () => {
    const declared = boardWithADeclaredNeed();
    fileAndEnd(declared);

    expect(ticketOf(declared.board, '002')?.frontmatter.status).toBe('ready-for-review');
    expect(ticketOf(declared.board, '001')?.frontmatter.dependsOn).toEqual(['002']);
  });

  test('takes the needs off the board, which then holds no needs key', () => {
    const declared = boardWithADeclaredNeed();
    fileAndEnd(declared);

    expect(declared.board.needs()).toEqual([]);
    expect(Object.hasOwn(declared.progress, 'needs')).toBe(false);
  });

  test.each(['built', 'failed'] as const)('a job that declared a need and ended %s leaves no needs key and files nothing', (outcome) => {
    const declared = boardWithADeclaredNeed();
    declared.board.endJob('J1', { outcome }, AT);

    expect(declared.board.needs()).toEqual([]);
    expect(Object.hasOwn(declared.progress, 'needs')).toBe(false);
    expect(declared.board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
  });

  test('a need for the root entity without gates opens need-for-root for the waiting ticket and files no ticket', () => {
    const declared = boardWithADeclaredNeed(entityPipelineFixture(), { ...NEED, entity: 'root' });
    fileAndEnd(declared);

    expect(declared.board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
    expect(declared.board.decisions().map((decision) => [decision.kind, decision.ticketIds, decision.context]))
      .toEqual([['need-for-root', ['001'], `root: ${NEED.title}`]]);
    expect(launchesOf(followThePlaybook(declared.board))).toEqual([]);
  });

  test('a need for the root entity with gates is filed as a ticket of the root entity', () => {
    const pipeline = entityPipelineFixture();
    const root = pipeline.entities?.['root'];
    if (root === undefined) throw new Error('The fixture names no root entity.');
    const gated: Pipeline = { ...pipeline, entities: { ...pipeline.entities, root: { ...root, gates: [{ name: 'unit', run: 'bun test' }] } } };
    const declared = boardWithADeclaredNeed(gated, { ...NEED, entity: 'root' });
    fileAndEnd(declared);

    expect(ticketOf(declared.board, '002')?.frontmatter.entity).toBe('root');
    expect(declared.board.decisions()).toEqual([]);
  });

  test('a job that kept no need files nothing', () => {
    const { board, change } = boardWithADeclaredNeed();
    board.takeNeedsOf('J1');
    const job = board.jobById('J1');
    if (job === undefined) throw new Error('The declaring job is gone.');

    expect(NeedTickets.fileNeedsOf(change, job, () => WORDING)).toEqual({ logged: [], filedNeedCount: 0 });
  });
});

describe('the waiting ticket', () => {
  test('keeps its status and launches nothing while its need is not delivered; the need itself launches', () => {
    const declared = boardWithADeclaredNeed(withTicketReviewOff(entityPipelineFixture()));
    fileAndEnd(declared);

    expect(ticketOf(declared.board, '001')?.frontmatter.status).toBe('in-progress');
    expect(launchesOf(followThePlaybook(declared.board))).toEqual([{
      kind: 'launch-build', ticketId: '002', attempt: 1, base: 'main', entity: 'design-system', stage: 1
    }]);
  });

  test('runs its stage again in the same attempt once the need is delivered, told the needs it declared and resuming its session', () => {
    const declared = boardWithADeclaredNeed(withTicketReviewOff(entityPipelineFixture()));
    fileAndEnd(declared);
    declared.board.moveTicket('002', 'delivered', { checksLegality: false }, AT);
    const steps = followThePlaybook(declared.board);
    const rerun = declared.board.jobs().find((job) => job.kind === 'build');

    expect(launchesOf(steps)).toEqual([{
      kind: 'launch-build', ticketId: '001', attempt: 1, base: 'main', entity: 'web', stage: 1
    }]);
    expect(rerun === undefined ? null : NeedTickets.needsSettledOf(declared.board, rerun, { mainLine: 'main', resumesSession: true })).toEqual({
      needs: [{
        entity: 'design-system', title: NEED.title, ticketId: '002', status: 'delivered'
      }],
      mainLine:       'main',
      resumesSession: true,
    });
  });

  test('launches nothing while its need is only reviewed, since the main line does not hold the need yet', () => {
    const declared = boardWithADeclaredNeed(withTicketReviewOff(entityPipelineFixture()));
    fileAndEnd(declared);
    declared.board.moveTicket('002', 'reviewed', { checksLegality: false }, AT);

    expect(launchesOf(followThePlaybook(declared.board))).toEqual([]);
  });

  test('a build after a ticket that built tells no needs', () => {
    const { board } = boardWithADeclaredNeed();
    board.endJob('J1', { outcome: 'built' }, AT);
    const { job } = board.launchJob(BUILD_OF_WEB, AT);

    expect(NeedTickets.needsSettledOf(board, job, { mainLine: 'main', resumesSession: false })).toBeNull();
  });

  test('the need runs at the waiting ticket\'s priority, also when the waiting ticket is raised after the filing', () => {
    const declared = boardWithADeclaredNeed(withTicketReviewOff(entityPipelineFixture()));
    fileAndEnd(declared);
    declared.board.setConcurrencyLimit(1, AT);
    declared.board.setTicketPriority('002', 'low', AT);
    declared.board.fileTicket(ticketFixture({
      id: '003', status: 'committed', priority: 'normal', entity: 'web'
    }), AT);
    const launchedTicketIds = (): string[] => launchesOf(followThePlaybook(declared.board)).map((step) => (step.kind === 'launch-build' ? step.ticketId : ''));
    const beforeTheRaise = launchedTicketIds();
    declared.board.endJob(declared.board.jobs().find((job) => job.kind === 'build')?.id ?? '', { outcome: 'stopped' }, AT);
    declared.board.setTicketPriority('001', 'high', AT);

    expect(beforeTheRaise).toEqual(['003']);
    expect(launchedTicketIds()).toEqual(['002']);
  });

  test('an abandoned need leaves its dependencies and opens need-abandoned, which holds it', () => {
    const declared = boardWithADeclaredNeed(withTicketReviewOff(entityPipelineFixture()));
    fileAndEnd(declared);
    declared.board.moveTicket('002', 'abandoned', { checksLegality: false, reason: 'Alex Example dropped it' }, AT);
    const steps = followThePlaybook(declared.board);

    expect(steps.filter((step) => step.kind === 'release-abandoned-need')).toEqual([{ kind: 'release-abandoned-need', ticketId: '001', needTicketId: '002' }]);
    expect(ticketOf(declared.board, '001')?.frontmatter.dependsOn).toBeUndefined();
    expect(declared.board.decisions().map((decision) => [decision.kind, decision.ticketIds])).toEqual([['need-abandoned', ['001']]]);
    expect(launchesOf(followThePlaybook(declared.board))).toEqual([]);
  });
});

const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;

/** A package that neither the package `ui-kit` nor its consumers consume, so a need of `ui-kit` for it closes no circle. */
const ICONS = 'icons';

const PACKAGE_BUILD: TicketStage = { name: 'package-build', entity: UI_KIT.key };

/** The entity-forge pipeline, the shop crossing into `ui-kit`, with ticket review off and the package `icons` beside it. */
function crossingPipelineWithIcons(): Pipeline {
  const pipeline = withTicketReviewOff(entityForgePipelineOf('shop-crosses-into-ui-kit'));
  return {
    ...pipeline,
    entities: {
      ...pipeline.entities,
      [ICONS]: {
        kind:    'package',
        home:    ['/packages/icons'],
        prepare: [],
        gates:   [{ name: 'verify', run: 'bun run check' }],
        phases:  { build: ['verify'], review: [], merge: ['verify'] },
      },
    },
  };
}

/** The shop's ticket 001 in stage 2, its package build J1 of `ui-kit` having declared a need of `needEntity`, filed and ended. */
function packageBuildThatDeclared(needEntity: string): DeclaredBoard {
  const fixture = boardFixture({
    pipeline: crossingPipelineWithIcons(),
    tasks:    [taskFixture({
      id: 1, ticket: '001', status: 'in-progress', stage: PACKAGE_BUILD
    })],
    tickets: [ticketFixture({
      id: '001', status: 'in-progress', task: 1, entity: SHOP.key
    })],
  });
  fixture.board.setHephaestusState('running', AT);
  fixture.board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: UI_KIT.key, stage: 2
  }, AT);
  fixture.board.declareNeed('J1', { ...NEED, entity: needEntity }, () => []);
  const trackerDirectory = createScratchDirectory('need-tickets');
  folders.push(trackerDirectory);
  const change = { board: fixture.board, at: AT, records: scratchRecordAllocationOf(trackerDirectory, fixture.board) } as unknown as BoardTransaction;
  const declared = {
    board: fixture.board, records: fixture.records, progress: fixture.progress, change
  };
  fileAndEnd(declared);
  return declared;
}

describe('a need the package build of a crossing ticket declares (E24)', () => {
  test('E24: for a third entity, files its ticket, which the crossing ticket waits on in stage 2, and the stage runs again once it is delivered', () => {
    const { board } = packageBuildThatDeclared(ICONS);

    expect(board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === 'J1'))
      .toMatchObject({ fields: { outcome: 'needs-declared' } });
    expect(ticketOf(board, '002')?.frontmatter).toMatchObject({ entity: ICONS, filedByJob: 'J1', status: 'committed' });
    expect(ticketOf(board, '001')?.frontmatter).toMatchObject({ status: 'in-progress', dependsOn: ['002'] });
    expect(board.ticketStageOf('001')).toEqual(PACKAGE_BUILD);
    expect(launchesOf(followThePlaybook(board))).toEqual([{
      kind: 'launch-build', ticketId: '002', attempt: 1, base: 'main', entity: ICONS, stage: 1
    }]);

    board.endJob(board.jobs().find((job) => job.kind === 'build')?.id ?? '', { outcome: 'stopped' }, AT);
    expect(launchesOf(followThePlaybook(board)).filter((step) => step.kind === 'launch-build' && step.ticketId === '001')).toEqual([]);
    board.endJob(board.jobs().find((job) => job.kind === 'build')?.id ?? '', { outcome: 'stopped' }, AT);
    board.moveTicket('002', 'delivered', { checksLegality: false }, AT);

    expect(launchesOf(followThePlaybook(board))).toEqual([{
      kind: 'launch-build', ticketId: '001', attempt: 1, base: 'main', entity: UI_KIT.key, stage: 2
    }]);
    expect(board.ticketStageOf('001')).toEqual(PACKAGE_BUILD);
  });

  test('E24: for the home entity, which consumes the package, files no ticket and opens need-closes-circle, the row kept in stage 2', () => {
    const { board } = packageBuildThatDeclared(SHOP.key);

    expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
    expect(board.decisions().map((decision) => [decision.kind, decision.ticketIds])).toEqual([['need-closes-circle', ['001']]]);
    expect(board.ticketStageOf('001')).toEqual(PACKAGE_BUILD);
    expect(launchesOf(followThePlaybook(board))).toEqual([]);
  });
});
