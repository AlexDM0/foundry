/**
 * User's setup kinds on a forge over entities, applied to a Board in a change. What matters: once User continues the `entities` step,
 * each entity of the draft gets a pipeline-agent session of its own, stamped with its entity and held in its part of the record; an
 * advise opens at the forge or at one entity of the stored pipeline, and the record names that entity; an update at an entity holds
 * that entity's part, whose session a resume opens without one at the forge; a resume opens the level the record opened at and each
 * entity a session served, never an entity whose part only a check made; a level the pipeline has no entity for is refused before
 * anything is written; an answer, a constitution edit, a discard and a check message the session of the level they change and no other;
 * a check covers each entity whose gates the draft touched, with its own gates; a start over stops every session; an Apply reads each
 * entity's constitution path on main and starts the product owner with the request's words; a draft edit that whitelists a package
 * with a review is accepted; and a copy to another entity stores its edits under one `batch`, the first of their edit ids, which
 * `wholeBatch` undoes at once with the entity's session hearing every edit of it in one message, while a copy that names a field outside an
 * entity is refused with the record untouched. An edit that leaves entities the validator refuses lands, and the forge's session hears
 * each refusal that stands, while a malformed value is still refused. A forge without entities keeps one session and stores no batch,
 * which `PipelineSetupControls.spec.ts` holds.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }                         from '../../domain/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit, PipelineSetup } from '../../domain/tracker-model/@types/PipelineSetup.ts';
import type { Ticket }                           from '../../domain/tracker-model/@types/Ticket.ts';
import { BoardRefusal }                          from '../../domain/tracker-model/BoardRefusal.ts';
import type { ControlCommand }                   from '../../shared/@types/ControlCommand.ts';
import type { ControlContext }                   from '../../shared/@types/ControlContext.ts';
import { OperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                         from '../../shared/constants/ProductNames.ts';
import {
  boardFixture,
  entityPipelineFixture,
  ticketFixture,
  type BoardFixture
} from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { EXAMPLE_PIPELINE_AGENT }                               from '../../testing/ExamplePipelineAgent.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                    from '../tracker/Workspace.ts';
import { ControlService }                                       from './ControlService.ts';
import { entityAssignmentRequestOf }                            from './EntityAssignmentRequest.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';

const WORKSPACE = workspacePathsFor('/example-agency/storefront');

const WEB_TEST_GATE = { name: 'test', run: 'bun test' };

function changeOf(fixture: BoardFixture): BoardTransaction {
  return {
    board:                          fixture.board,
    workspace:                      WORKSPACE,
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(fixture.board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline:             null,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function apply(fixture: BoardFixture, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(fixture), ECHOED_CONTROL_CONTEXT).result;
}

function refusalOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BoardRefusal) return error.detail;
    throw error;
  }
  throw new Error('the command was not refused');
}

function operationRefusalDetailOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error.detail;
    throw error;
  }
  throw new Error('the command was not refused');
}

function messagesOf(fixture: BoardFixture): { jobId: string; message: unknown }[] {
  return fixture.records
    .filter((record) => record.kind === 'job-messaged')
    .map((record) => ({ jobId: String(record.jobId), message: JSON.parse(String((record.fields as { text: string }).text)) as unknown }));
}

function setupOf(fixture: BoardFixture): PipelineSetup {
  const setup = fixture.board.pipelineSetup();
  if (setup === null) throw new Error('no setup record is open');
  return setup;
}

function withWebTestGate(pipeline: Pipeline): Pipeline {
  const draft = structuredClone(pipeline);
  const web = draft.entities?.['web'];
  if (web === undefined) throw new Error('the fixture has no web entity');
  web.gates = [WEB_TEST_GATE];
  web.phases.build = ['test'];
  return draft;
}

/** A first setup S1 at the `entities` step whose draft holds the root entity, `web` and `design-system`; its forge session is J1. */
function boardAtEntitiesStep(tickets: Ticket[] = []): BoardFixture {
  const opened = boardFixture();
  apply(opened, {
    kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, agent: EXAMPLE_PIPELINE_AGENT
  });
  const setup: PipelineSetup = {
    ...structuredClone(setupOf(opened)),
    stepStates: {
      agent: 'done', billing: 'done', research: 'done', entities: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started'
    },
    currentStep: 'entities',
    draft:       entityPipelineFixture(),
  };
  const fixture = boardFixture({ tickets, pipelineSetup: { verdict: 'readable', setup } });
  fixture.board.startPipelineAgent(CHANGED_AT);
  fixture.records.length = 0;
  return fixture;
}

/** S1 past the `entities` step: J1 serves the forge, J2 the root entity, J3 `web` and J4 `design-system`. */
function boardWithEntitySessions(tickets: Ticket[] = []): BoardFixture {
  const fixture = boardAtEntitiesStep(tickets);
  apply(fixture, {
    kind: 'pipeline-setup-step', setupId: 'S1', step: 'entities', move: 'continue'
  });
  fixture.records.length = 0;
  return fixture;
}

describe('one session per entity', () => {
  test('the Continue of the entities step launches a session for each entity of the draft, stamped with its entity', () => {
    const fixture = boardAtEntitiesStep();

    apply(fixture, {
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'entities', move: 'continue'
    });

    const setup = setupOf(fixture);
    expect(setup.agentJobId).toBe('J1');
    expect(Object.entries(setup.entities ?? {}).map(([entityKey, part]) => [entityKey, part.agentJobId])).toEqual([
      ['root', 'J2'], ['web', 'J3'], ['design-system', 'J4'],
    ]);
    expect(['J2', 'J3', 'J4'].map((jobId) => fixture.board.jobById(jobId)?.entity)).toEqual(['root', 'web', 'design-system']);
    expect(fixture.board.jobById('J1')?.entity).toBeUndefined();
    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J1',
      message: {
        kind: 'step-continued', setupId: 'S1', mode: 'setup', step: 'entities', currentStep: 'constitution'
      }
    }]);
  });

  test('a later Continue messages every session and launches none again', () => {
    const fixture = boardWithEntitySessions();

    apply(fixture, {
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'constitution', move: 'continue'
    });

    expect(fixture.records.filter((record) => record.kind === 'job-launched')).toEqual([]);
    expect(messagesOf(fixture).map((sent) => sent.jobId)).toEqual(['J1', 'J2', 'J3', 'J4']);
  });

  test('a start over stops every session of the record', () => {
    const fixture = boardWithEntitySessions();

    apply(fixture, { kind: 'pipeline-setup-start-over', setupId: 'S1' });

    expect(fixture.records.filter((record) => record.kind === 'job-stop-requested').map((record) => record.jobId)).toEqual(['J1', 'J2', 'J3', 'J4']);
  });
});

describe('a level of advise and update', () => {
  test('an advise at an entity launches that entity\'s session alone, held in its part of the record', () => {
    const fixture = boardFixture({ pipeline: entityPipelineFixture() });

    apply(fixture, { kind: 'pipeline-agent-advise', entity: 'web' });

    const setup = setupOf(fixture);
    expect(setup.mode).toBe('advise');
    expect(setup.openedAtEntity).toBe('web');
    expect(setup.agentJobId).toBeNull();
    expect(setup.entities?.['web']?.agentJobId).toBe('J1');
    expect(fixture.board.jobById('J1')).toMatchObject({ kind: 'pipeline-agent', entity: 'web' });
    expect(fixture.records.find((record) => record.kind === 'job-launched')?.fields).toMatchObject({ entity: 'web' });
  });

  test('an advise at the forge launches the forge\'s session, with no entity', () => {
    const fixture = boardFixture({ pipeline: entityPipelineFixture() });

    apply(fixture, { kind: 'pipeline-agent-advise' });

    expect(setupOf(fixture).agentJobId).toBe('J1');
    expect(setupOf(fixture).entities).toBeUndefined();
    expect(Object.hasOwn(setupOf(fixture), 'openedAtEntity')).toBe(false);
    expect(fixture.board.jobById('J1')).not.toHaveProperty('entity');
  });

  test.each([
    ['an entity the stored pipeline does not hold', entityPipelineFixture(), ['root', 'web', 'design-system']],
    ['any entity of a stored pipeline without entities', {
      version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    } as Pipeline, []],
  ])('an advise at %s is refused, with no record opened and no session launched', (_case, pipeline, entityKeys) => {
    const fixture = boardFixture({ pipeline });

    expect(refusalOf(() => apply(fixture, { kind: 'pipeline-agent-advise', entity: 'shop' }))).toEqual({ reason: 'setup-entity-unknown', entity: 'shop', entityKeys });
    expect(fixture.board.pipelineSetup()).toBeNull();
    expect(fixture.board.jobs()).toEqual([]);
  });

  test('an update at an entity holds that entity\'s part, and a resume opens that entity\'s session alone', () => {
    const fixture = boardFixture({ pipeline: entityPipelineFixture() });

    apply(fixture, { kind: 'pipeline-update-start', entity: 'web' });
    expect(setupOf(fixture).openedAtEntity).toBe('web');
    expect(setupOf(fixture).entities).toEqual({
      web: {
        agentJobId: null, findings: [], questions: [], constitution: null
      }
    });
    expect(fixture.board.jobs()).toEqual([]);

    apply(fixture, { kind: 'pipeline-setup-resume', setupId: 'S1' });

    expect(setupOf(fixture).agentJobId).toBeNull();
    expect(setupOf(fixture).entities?.['web']?.agentJobId).toBe('J1');
    expect(fixture.board.jobById('J1')?.entity).toBe('web');
  });

  test('an update at the forge whose check made an entity\'s part resumes the forge\'s session alone', () => {
    const fixture = boardFixture({ pipeline: entityPipelineFixture() });
    apply(fixture, { kind: 'pipeline-update-start' });
    setupOf(fixture).draft = withWebTestGate(entityPipelineFixture());
    apply(fixture, { kind: 'pipeline-check', setupId: 'S1' });
    expect(Object.keys(setupOf(fixture).entities ?? {})).toEqual(['web']);

    apply(fixture, { kind: 'pipeline-setup-resume', setupId: 'S1' });

    expect(setupOf(fixture).agentJobId).toBe('J1');
    expect(setupOf(fixture).entities?.['web']?.agentJobId).toBeNull();
    expect(fixture.board.jobs().map((job) => [job.id, job.entity ?? null])).toEqual([['J1', null]]);
  });

  test('a resume of a setup past the entities step messages the forge\'s session and each entity\'s, and launches none', () => {
    const fixture = boardWithEntitySessions();

    apply(fixture, { kind: 'pipeline-setup-resume', setupId: 'S1' });

    expect(messagesOf(fixture).map((message) => message.jobId)).toEqual(['J1', 'J2', 'J3', 'J4']);
    expect(fixture.board.jobs()).toHaveLength(4);
  });
});

describe('the session that hears a move', () => {
  test('an answer to an entity\'s question messages that entity\'s session alone', () => {
    const fixture = boardWithEntitySessions();
    fixture.board.askSetupQuestion('S1', {
      step: 'constitution', subject: null, question: 'Does web keep its own lint rules?', context: '', optionTexts: ['Yes', 'No'], recommendedLetters: ['a'], multiple: false
    }, CHANGED_AT, 'web');
    fixture.records.length = 0;

    apply(fixture, {
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['a'] }
    });

    expect(setupOf(fixture).entities?.['web']?.questions[0]?.answer).toMatchObject({ letters: ['a'] });
    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J3',
      message: {
        kind: 'question-answered', setupId: 'S1', questionId: 'Q1', reply: { letters: ['a'] }
      }
    }]);
  });

  test('a constitution edit at an entity changes that entity\'s draft and messages its session alone', () => {
    const fixture = boardWithEntitySessions();

    apply(fixture, {
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, markdown: '# Web\n', entity: 'web'
    });

    expect(setupOf(fixture).constitution).toBeNull();
    expect(setupOf(fixture).entities?.['web']?.constitution).toMatchObject({ markdown: '# Web\n', revision: 1 });
    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J3',
      message: {
        kind: 'constitution-edited', setupId: 'S1', revision: 1, markdown: '# Web\n', draftedFrom: null
      }
    }]);
  });

  test('a constitution edit at an entity the draft does not hold is refused, with the record untouched', () => {
    const fixture = boardWithEntitySessions();

    expect(refusalOf(() => apply(fixture, {
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, markdown: '# Shop\n', entity: 'shop'
    }))).toEqual({ reason: 'setup-entity-unknown', entity: 'shop', entityKeys: ['root', 'web', 'design-system'] });
    expect(fixture.records).toEqual([]);
  });

  test('a discard messages the session of each entity whose fields it changed, with only its own fields', () => {
    const fixture = boardFixture({ pipeline: entityPipelineFixture() });
    apply(fixture, { kind: 'pipeline-agent-advise' });
    setupOf(fixture).draft = withWebTestGate(entityPipelineFixture());
    fixture.board.startPipelineAgent(CHANGED_AT, 'web');
    fixture.board.attachSetupAgent('S1', 'J2', null, 'web');
    fixture.records.length = 0;

    apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J2',
      message: {
        kind:          'draft-discarded',
        setupId:       'S1',
        draftRevision: 1,
        changes:       [
          { field: 'entity:web/gate:test', value: null },
          { field: 'entity:web/phase-order:build', value: [] },
        ],
      },
    }]);
  });
});

describe('the pipeline check per entity', () => {
  function updateWithWebGate(): BoardFixture {
    const fixture = boardFixture({ pipeline: entityPipelineFixture() });
    apply(fixture, { kind: 'pipeline-update-start' });
    setupOf(fixture).draft = withWebTestGate(entityPipelineFixture());
    fixture.board.startPipelineAgent(CHANGED_AT, 'web');
    fixture.board.attachSetupAgent('S1', 'J1', null, 'web');
    fixture.records.length = 0;
    return fixture;
  }

  test('covers only the entities whose gates the draft touched, each with its own gates, and messages each one\'s session', () => {
    const fixture = updateWithWebGate();

    apply(fixture, { kind: 'pipeline-check', setupId: 'S1' });

    const setup = setupOf(fixture);
    expect(setup.check).toBeUndefined();
    expect(setup.entities?.['web']?.check).toEqual({
      draftRevision: 0, gateNames: ['test'], state: 'queued', result: null, reason: null
    });
    expect(Object.keys(setup.entities ?? {})).toEqual(['web']);
    expect(fixture.board.queuedPipelineCheckLevels()).toEqual(['web']);
    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J1',
      message: {
        kind: 'check-requested', setupId: 'S1', draftRevision: 0, gateNames: ['test']
      }
    }]);
  });

  test('an entity\'s check runs its steps and gates with its first home, and a second press waits for it', () => {
    const fixture = updateWithWebGate();
    apply(fixture, { kind: 'pipeline-check', setupId: 'S1' });

    expect(fixture.board.startPipelineCheck('S1', 'web')).toEqual({
      draftRevision: 0, prepare: [], gates: [WEB_TEST_GATE], entityHome: '/apps/web'
    });
    expect(refusalOf(() => apply(fixture, { kind: 'pipeline-check', setupId: 'S1' }))).toEqual({ reason: 'pipeline-check-running', setupId: 'S1' });
    expect(fixture.board.stopRunningPipelineCheck()?.setup.entities?.['web']?.check?.state).toBe('stopped');
  });

  test('a draft that touches no entity\'s gate is refused no-gate-to-check', () => {
    const fixture = boardFixture({ pipeline: entityPipelineFixture() });
    apply(fixture, { kind: 'pipeline-update-start' });

    expect(refusalOf(() => apply(fixture, { kind: 'pipeline-check', setupId: 'S1' }))).toEqual({ reason: 'no-gate-to-check', setupId: 'S1' });
  });
});

describe('an Apply over entities', () => {
  test('reads each entity\'s constitution path on main, adopts a file main holds, and starts the product owner with its request', () => {
    const fixture = boardWithEntitySessions([ticketFixture({ id: '021', status: 'committed' })]);
    for (const step of ['constitution', 'design'] as const) {
      apply(fixture, {
        kind: 'pipeline-setup-step', setupId: 'S1', step, move: 'continue'
      });
    }
    const askedPaths: (string | undefined)[] = [];
    const designSystemFile = { path: 'packages/design-system/CONSTITUTION.md', markdown: '# Design system\n', blob: 'b'.repeat(40) };
    const context: ControlContext = {
      ...ECHOED_CONTROL_CONTEXT,
      mainConstitutionOf: (_rootDirectory, constitutionPath) => {
        askedPaths.push(constitutionPath);
        return constitutionPath === designSystemFile.path ? { verdict: 'read', constitution: designSystemFile } : { verdict: 'absent' };
      },
    };

    ControlService.apply({
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: false
    }, changeOf(fixture), context);

    expect(askedPaths).toEqual([undefined, 'CONSTITUTION.md', 'apps/web/CONSTITUTION.md', 'packages/design-system/CONSTITUTION.md']);
    expect(fixture.board.pipeline()?.entities?.['design-system']?.constitution).toEqual({ path: designSystemFile.path });
    const productOwner = fixture.board.jobs().find((job) => job.kind === 'product-owner');
    expect(productOwner?.intake?.text).toBe(entityAssignmentRequestOf(['021']));
    expect(productOwner?.intake?.text).toContain('#021');
    expect(productOwner?.intake?.text).toContain(`\`${PRODUCT_NAMES.PROGRAM} ticket entity <id> <key> --reason "<reason>"\``);
  });
});

describe('a whitelist in the draft', () => {
  test('an edit that whitelists a package with a review is accepted, and the draft keeps the whitelist', () => {
    const fixture = boardAtEntitiesStep();
    const designSystem = setupOf(fixture).draft?.entities?.['design-system'];
    if (designSystem === undefined) throw new Error('the fixture has no design-system entity');
    designSystem.review = { name: 'review' };

    apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: setupOf(fixture).draftRevision,
      edits:         [{ target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: ['design-system'] } }],
    });

    expect(setupOf(fixture).draft?.entities?.['web']?.whitelist).toEqual(['design-system']);
  });
});

describe('an unfinished entities draft', () => {
  const SHARED_HOME_EDIT: PipelineDraftEdit = { target: 'entity', entityKey: 'admin', value: { kind: 'app', home: ['/apps/web'] } };

  test('an edit that leaves two entities on one home lands at the next revision, and the forge\'s session hears the refusal that stands', () => {
    const fixture  = boardAtEntitiesStep();
    const revision = setupOf(fixture).draftRevision;

    apply(fixture, {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: revision, edits: [SHARED_HOME_EDIT]
    });

    expect(setupOf(fixture).draftRevision).toBe(revision + 1);
    expect(setupOf(fixture).draft?.entities?.['admin']?.home).toEqual(['/apps/web']);
    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J1',
      message: expect.objectContaining({ kind: 'draft-edited', standingEntityRefusals: ['the entities web, admin share the home "/apps/web"'] }),
    }]);
  });

  test('an edit with a malformed entity value is still refused pipeline-draft-invalid, with the record untouched', () => {
    const fixture = boardAtEntitiesStep();
    const before  = structuredClone(setupOf(fixture));

    const detail = operationRefusalDetailOf(() => apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: before.draftRevision,
      edits:         [{ target: 'entity', entityKey: 'admin', value: { kind: 'app', home: [] } }],
    }));

    expect(detail).toMatchObject({ kind: 'pipeline-draft-invalid', setupId: 'S1' });
    expect(setupOf(fixture)).toEqual(before);
  });
});

describe('a copy to another entity', () => {
  const COPIED_GATE_EDITS: PipelineDraftEdit[] = [
    { target: 'within-entity', entityKey: 'design-system', edit: { target: 'gate', name: 'test', value: WEB_TEST_GATE } },
    { target: 'within-entity', entityKey: 'design-system', edit: { target: 'phase-order', phase: 'build', names: ['test'] } },
  ];

  /** S1 past the `entities` step with an approval edited first, then web's test gate copied to the design system as E2 and E3. */
  function boardWithACopy(): BoardFixture {
    const fixture = boardWithEntitySessions();
    apply(fixture, {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: setupOf(fixture).draftRevision, edits: [{ target: 'approval', approval: 'merge', value: true }]
    });
    apply(fixture, {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: setupOf(fixture).draftRevision, edits: COPIED_GATE_EDITS, isACopy: true
    });
    fixture.records.length = 0;
    return fixture;
  }

  test('stores the copy\'s edits under one batch, the first edit id, and an edit that is no copy under none', () => {
    const fixture = boardWithACopy();

    expect(setupOf(fixture).edits.map((edit) => [edit.editId, edit.batch])).toEqual([['E1', undefined], ['E2', 'E2'], ['E3', 'E2']]);
    expect(Object.hasOwn(setupOf(fixture).edits[0] ?? {}, 'batch')).toBe(false);
  });

  test('undoes the copy\'s whole set at once with wholeBatch, and messages the entity\'s session the set\'s edits with each value now', () => {
    const fixture = boardWithACopy();

    apply(fixture, {
      kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2', wholeBatch: true
    });

    expect(setupOf(fixture).edits.map((edit) => [edit.editId, edit.undone])).toEqual([['E1', false], ['E2', true], ['E3', true]]);
    expect(setupOf(fixture).draft?.entities?.['design-system']?.gates).toEqual([]);
    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J4',
      message: {
        kind:          'draft-batch-undone',
        setupId:       'S1',
        draftRevision: 3,
        editIds:       ['E2', 'E3'],
        fields:        ['entity:design-system/gate:test', 'entity:design-system/phase-order:build'],
        changes:       [{ field: 'entity:design-system/gate:test', value: null }, { field: 'entity:design-system/phase-order:build', value: [] }],
      },
    }]);
  });

  test('a copy that names a field outside an entity is refused, naming it, with the record untouched', () => {
    const fixture = boardWithEntitySessions();
    const before = structuredClone(setupOf(fixture));

    expect(operationRefusalDetailOf(() => apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: before.draftRevision,
      edits:         [...COPIED_GATE_EDITS, { target: 'approval', approval: 'merge', value: true }],
      isACopy:       true,
    }))).toEqual({ kind: 'draft-copy-outside-entities', setupId: 'S1', fields: ['approval:merge'] });
    expect(setupOf(fixture)).toEqual(before);
    expect(fixture.records).toEqual([]);
  });
});
