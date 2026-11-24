/**
 * Apply of a draft over entities. What matters: the Apply refuses to remove or rename an entity a ticket that is not delivered or abandoned
 * names (E91), and refuses to turn a stored pipeline without entities into entities while a ticket is in progress, in review or reviewed
 * (E94), where a first setup and a committed ticket refuse nothing. The forge has no constitution of its own beside entities, so its empty
 * draft refuses nothing: each entity's drafted text that main lacks waits for the commit, each drafted entity takes main's blob of its file
 * as its base, an entity with no draft adopts the file main holds byte for byte, and stage 2 refuses an entity's text main does not hold,
 * naming the entity. Stage 2 refuses E91 and E94 again, for a ticket that started or took the removed entity while the request waited. The
 * first Apply that stores entities starts one product owner, as an intake of the words the caller gives, for the committed tickets without an
 * entity, its launch record naming them; an Apply over a pipeline that already had entities, or one with no such ticket, starts none. An
 * Apply over a pipeline with entities that adds an entity touches no open ticket and starts no product owner (E90), and one that moves an
 * entity's home keeps the entity's key on its open tickets (E92).
 */
import { describe, expect, test } from 'bun:test';

import {
  boardFixture,
  entityPipelineFixture,
  refusalDetailOf,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import type { Pipeline } from './@types/Pipeline.ts';
import type {
  ApplyMainReading,
  ConstitutionDraft,
  MainConstitution,
  PipelineSetup,
  PipelineSetupEntity
} from './@types/PipelineSetup.ts';
import type { Ticket }  from './@types/Ticket.ts';
import type { Board }   from './Board.ts';
import { PipelineUtil } from './utils/PipelineUtil.ts';

const AT = '2026-11-17T10:00:00+01:00';

const SETUP_ID = 'S4';

const WEB_TEXT = '# Web\n\n- Keep the basket page fast.\n';

const WEB_ON_MAIN: MainConstitution = { path: 'apps/web/CONSTITUTION.md', markdown: '# Web\n\n- An older rule.\n', blob: 'a'.repeat(40) };

const DESIGN_SYSTEM_TEXT = '# Design system\n\n- Compose before you add a part.\n';

const DESIGN_SYSTEM_ON_MAIN: MainConstitution = { path: 'packages/design-system/CONSTITUTION.md', markdown: DESIGN_SYSTEM_TEXT, blob: 'b'.repeat(40) };

const SINGLE_PIPELINE: Pipeline = {
  version: 5,
  prepare: [],
  gates:   [{ name: 'test', run: 'bun test' }],
  phases:  { build: ['test'], review: ['test'], merge: ['test'] },
};

/** The three entities of the fixture and `docs`, which the draft no longer holds. */
const STORED_WITH_DOCS: Pipeline = {
  ...entityPipelineFixture(),
  entities: {
    ...entityPipelineFixture().entities,
    docs: {
      kind: 'package', home: ['/docs'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    },
  },
};

function draftOf(markdown: string): ConstitutionDraft {
  return {
    markdown, annotations: [], draftedFrom: { contributing: true, research: true, installedDefault: false }, baseBlob: null, revision: 1
  };
}

function partWith(constitution: ConstitutionDraft | null): PipelineSetupEntity {
  return {
    agentJobId: null, findings: [], questions: [], constitution
  };
}

/** A record at Apply whose draft is the three-entity pipeline: `web` drafted, the others with no draft of their own. */
function recordOver(stored: Pipeline | null, draft: Pipeline = entityPipelineFixture()): PipelineSetup {
  return {
    formatVersion:   3,
    setupId:         SETUP_ID,
    mode:            stored === null ? 'setup' : 'update',
    baseContentHash: stored === null ? null : PipelineUtil.contentHashOf(stored),
    stepStates:      {
      billing: 'done', agent: 'done', research: 'done', entities: 'done', constitution: 'done', design: 'done', apply: 'not-started'
    },
    currentStep:                'design',
    billing:                    { mode: 'subscription' },
    agent:                      { vendor: 'example-agent', program: { follows: 'machine' } },
    agentJobId:                 null,
    snapshotCommit:             null,
    readyToContinue:            [],
    findings:                   [],
    questions:                  [],
    constitution:               null,
    draft,
    draftRevision:              2,
    edits:                      [],
    replacesUnreadablePipeline: false,
    applyRequest:               null,
    entities:                   { 'web': partWith(draftOf(WEB_TEXT)), 'design-system': partWith(null) },
    nextNumbers:                { finding: 1, question: 1, edit: 1 },
    extra:                      [],
  };
}

function boardOver(stored: Pipeline | null, tickets: Ticket[] = [], draft?: Pipeline): Board {
  return boardFixture({ tickets, ...(stored === null ? {} : { pipeline: stored }), pipelineSetup: { verdict: 'readable', setup: recordOver(stored, draft) } }).board;
}

function readingWith(entityConstitutions: Readonly<Record<string, MainConstitution | null>>, words?: ApplyMainReading['entityAssignmentRequestOf']): ApplyMainReading {
  return { mainConstitution: null, entityConstitutions, ...(words === undefined ? {} : { entityAssignmentRequestOf: words }) };
}

const MAIN_WITHOUT_WEB_TEXT = readingWith({ 'root': null, 'web': WEB_ON_MAIN, 'design-system': DESIGN_SYSTEM_ON_MAIN });

const MAIN_WITH_WEB_TEXT = readingWith({ 'root': null, 'web': { ...WEB_ON_MAIN, markdown: WEB_TEXT, blob: 'c'.repeat(40) }, 'design-system': DESIGN_SYSTEM_ON_MAIN });

function wordsOf(ticketIds: readonly string[]): string {
  return `Give ${ticketIds.join(' and ')} an entity.`;
}

describe('stage 1 refuses', () => {
  test('E91: removing an entity that a ticket not yet landed names, naming the entity and the tickets', () => {
    const tickets = [ticketFixture({ id: '019', entity: 'docs', status: 'committed' }), ticketFixture({ id: '020', entity: 'docs', status: 'draft' })];
    const board = boardOver(STORED_WITH_DOCS, tickets);

    expect(refusalDetailOf(() => board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT))).toEqual({
      reason: 'entity-named-by-tickets', setupId: SETUP_ID, entity: 'docs', ticketIds: ['019', '020']
    });
    expect(board.pipelineSetup()?.applyRequest).toBeNull();
  });

  test('E91 not for a ticket that was delivered or abandoned: the entity goes', () => {
    const tickets = [ticketFixture({ id: '019', entity: 'docs', status: 'delivered' }), ticketFixture({ id: '020', entity: 'docs', status: 'abandoned' })];
    const board = boardOver(STORED_WITH_DOCS, tickets);

    expect(board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITH_WEB_TEXT }, AT).outcome).toBe('applied');
    expect(Object.keys(board.pipeline()?.entities ?? {})).toEqual(['root', 'web', 'design-system']);
  });

  test('E94: a stored pipeline without entities turning into entities while tickets are in progress, in review or reviewed', () => {
    const statuses: Ticket['frontmatter']['status'][] = ['in-progress', 'in-review', 'reviewed', 'committed'];
    const tickets = statuses.map((status, index) => ticketFixture({ id: `01${index}`, status }));
    const board = boardOver(SINGLE_PIPELINE, tickets);

    const refusal = refusalDetailOf(() => board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT));
    expect(refusal).toEqual({ reason: 'entities-while-tickets-in-flight', setupId: SETUP_ID, ticketIds: ['010', '011', '012'] });
  });

  test('E94 not for a first setup, nor for committed tickets alone', () => {
    const tickets = [ticketFixture({ id: '010', status: 'in-progress' })];
    expect(boardOver(null, tickets).requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT).outcome).toBe('committing');
    const pendingOnly = boardOver(SINGLE_PIPELINE, [ticketFixture({ id: '010', status: 'committed' })]);
    expect(pendingOnly.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT).outcome).toBe('committing');
  });
});

describe('stage 2 refuses again', () => {
  test('E94 when a committed ticket started while the request waited, and the record stays as the request left it', () => {
    const board = boardOver(SINGLE_PIPELINE, [ticketFixture({ id: '010', status: 'committed' })]);
    expect(board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT).outcome).toBe('committing');
    board.moveTicket('010', 'in-progress', { checksLegality: false }, AT);

    expect(board.entityChangeRefusalOf(SETUP_ID)).toBe('entities-while-tickets-in-flight');
    expect(refusalDetailOf(() => board.finishApply(SETUP_ID, {
      draftRevision: 2, resumesBoard: false, constitutionCommit: 'd'.repeat(40), ...MAIN_WITH_WEB_TEXT
    }, AT))).toEqual({ reason: 'entities-while-tickets-in-flight', setupId: SETUP_ID, ticketIds: ['010'] });
    expect(board.pipeline()).toEqual(SINGLE_PIPELINE);
    expect(board.pipelineSetup()?.applyRequest?.state).toBe('committing');
  });

  test('E91 when a ticket took the entity the draft removes while the request waited', () => {
    const board = boardOver(STORED_WITH_DOCS, [ticketFixture({ id: '019', entity: 'web', status: 'committed' })]);
    expect(board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT).outcome).toBe('committing');
    expect(board.entityChangeRefusalOf(SETUP_ID)).toBeNull();
    board.setTicketEntity('019', { entity: 'docs', reason: 'It changes the guides.', by: 'user' }, AT);

    expect(board.entityChangeRefusalOf(SETUP_ID)).toBe('entity-named-by-tickets');
    expect(refusalDetailOf(() => board.finishApply(SETUP_ID, {
      draftRevision: 2, resumesBoard: false, constitutionCommit: 'd'.repeat(40), ...MAIN_WITH_WEB_TEXT
    }, AT))).toEqual({
      reason: 'entity-named-by-tickets', setupId: SETUP_ID, entity: 'docs', ticketIds: ['019']
    });
    expect(board.pipeline()).toEqual(STORED_WITH_DOCS);
  });
});

describe('the constitutions of a draft over entities', () => {
  test('wait for the commit while main lacks a drafted text, with no forge constitution asked for, each drafted entity based on main\'s blob', () => {
    const board = boardOver(null);

    const requested = board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT);

    expect(requested.outcome).toBe('committing');
    expect(board.pipeline()).toBeNull();
    expect(board.pipelineSetup()?.entities?.['web']?.constitution?.baseBlob).toBe(WEB_ON_MAIN.blob);
    expect(board.pipelineSetup()?.entities?.['design-system']?.constitution).toBeNull();
  });

  test('apply at once when main holds every drafted text: each drafted entity names its file and one with no draft adopts the file main holds', () => {
    const board = boardOver(null);

    expect(board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITH_WEB_TEXT }, AT).outcome).toBe('applied');

    const entities = board.pipeline()?.entities ?? {};
    expect(entities['web']?.constitution).toEqual({ path: 'apps/web/CONSTITUTION.md' });
    expect(entities['design-system']?.constitution).toEqual({ path: 'packages/design-system/CONSTITUTION.md' });
    expect(entities['root']?.constitution).toBeUndefined();
    expect(board.pipeline()?.constitution).toBeUndefined();
  });

  test('stage 2 refuses an entity\'s text main does not hold, naming the entity', () => {
    const board = boardOver(null);
    board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT);

    expect(refusalDetailOf(() => board.finishApply(SETUP_ID, {
      draftRevision: 2, resumesBoard: false, constitutionCommit: 'd'.repeat(40), ...MAIN_WITHOUT_WEB_TEXT
    }, AT))).toEqual({
      reason: 'constitution-moved', setupId: SETUP_ID, baseBlob: WEB_ON_MAIN.blob, mainBlob: WEB_ON_MAIN.blob, entity: 'web'
    });
  });

  test('stage 2 stores the pipeline once the commit landed every drafted text', () => {
    const board = boardOver(null);
    board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITHOUT_WEB_TEXT }, AT);

    const finished = board.finishApply(SETUP_ID, {
      draftRevision: 2, resumesBoard: false, constitutionCommit: 'd'.repeat(40), ...MAIN_WITH_WEB_TEXT
    }, AT);

    expect(finished.outcome).toBe('applied');
    expect(board.pipeline()?.entities?.['web']?.constitution).toEqual({ path: 'apps/web/CONSTITUTION.md' });
  });
});

describe('the product owner of the first Apply over entities', () => {
  test('starts once, as an intake of the caller\'s words, for the committed tickets without an entity, its launch record naming them', () => {
    const tickets = [
      ticketFixture({ id: '021', status: 'committed' }),
      ticketFixture({ id: '022', status: 'committed', entity: 'web' }),
      ticketFixture({ id: '023', status: 'draft' }),
      ticketFixture({ id: '024', status: 'committed' }),
    ];
    const board = boardOver(SINGLE_PIPELINE, tickets);

    const applied = board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...readingWith(MAIN_WITH_WEB_TEXT.entityConstitutions ?? {}, wordsOf) }, AT);

    const productOwners = board.jobs().filter((job) => job.kind === 'product-owner');
    expect(productOwners.map((job) => job.intake?.text)).toEqual(['Give 021 and 024 an entity.']);
    const launched = applied.logged.find((record) => record.kind === 'job-launched');
    expect(launched?.kind === 'job-launched' ? launched.fields.entitiesToAssign : undefined).toEqual(['021', '024']);
    expect(applied.ticketsAwaitingEntity).toEqual(['021', '024']);
  });

  test('starts none over a pipeline that already had entities, nor with no committed ticket without one', () => {
    const tickets = [ticketFixture({ id: '021', status: 'committed' })];
    const overEntities = boardOver(entityPipelineFixture(), tickets);
    overEntities.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...readingWith(MAIN_WITH_WEB_TEXT.entityConstitutions ?? {}, wordsOf) }, AT);
    expect(overEntities.jobs().filter((job) => job.kind === 'product-owner')).toEqual([]);

    const noneWaiting = boardOver(SINGLE_PIPELINE, [ticketFixture({ id: '021', status: 'committed', entity: 'web' })]);
    noneWaiting.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...readingWith(MAIN_WITH_WEB_TEXT.entityConstitutions ?? {}, wordsOf) }, AT);
    expect(noneWaiting.jobs().filter((job) => job.kind === 'product-owner')).toEqual([]);
  });
});

describe('an Apply that changes the entities of a stored pipeline with entities', () => {
  const OPEN_TICKETS = (): Ticket[] => [
    ticketFixture({ id: '031', status: 'committed', entity: 'web' }),
    ticketFixture({ id: '032', status: 'in-progress', entity: 'design-system' }),
  ];

  function entitiesOfTickets(board: Board): Record<string, string | undefined> {
    return Object.fromEntries(board.tickets().map((ticket) => [ticket.frontmatter.id, ticket.frontmatter.entity]));
  }

  test('E90: adds an entity and leaves every open ticket\'s entity as it was, starting no product owner', () => {
    const stored = entityPipelineFixture();
    const withApi: Pipeline = {
      ...stored,
      entities: {
        ...stored.entities,
        api: {
          kind: 'app', home: ['/apps/api'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
        },
      },
    };
    const board = boardOver(stored, OPEN_TICKETS(), withApi);

    const applied = board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...readingWith({ ...MAIN_WITH_WEB_TEXT.entityConstitutions, api: null }, wordsOf) }, AT);

    expect(applied.outcome).toBe('applied');
    expect(Object.keys(board.pipeline()?.entities ?? {})).toContain('api');
    expect(entitiesOfTickets(board)).toEqual({ '031': 'web', '032': 'design-system' });
    expect(board.jobs().filter((job) => job.kind === 'product-owner')).toEqual([]);
  });

  test('E92: moves an entity\'s home while its tickets are open, and each keeps the entity\'s key', () => {
    const stored = entityPipelineFixture();
    const web = stored.entities?.['web'];
    if (web === undefined) throw new Error('The fixture names web.');
    const webMoved: Pipeline = { ...stored, entities: { ...stored.entities, web: { ...web, home: ['/apps/storefront'] } } };
    const tickets = [ticketFixture({ id: '031', status: 'committed', entity: 'web' }), ticketFixture({ id: '033', status: 'in-progress', entity: 'web' })];
    const board = boardOver(stored, tickets, webMoved);

    expect(board.requestApply(SETUP_ID, { draftRevision: 2, resumesBoard: false, ...MAIN_WITH_WEB_TEXT }, AT).outcome).toBe('applied');
    expect(board.pipeline()?.entities?.['web']?.home).toEqual(['/apps/storefront']);
    expect(entitiesOfTickets(board)).toEqual({ '031': 'web', '033': 'web' });
  });
});
