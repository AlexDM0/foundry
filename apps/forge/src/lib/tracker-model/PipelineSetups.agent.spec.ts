/**
 * The forge's agent and the billing it decides on the Board. What matters: a first setup starts with its agent, at the billing step, which
 * no Continue leaves until the record holds a billing, and with a billing it opens past it; a billing must be one of the ways the agent's
 * vendor bills, and none is taken while a record names no agent; a change of agent keeps a billing the new vendor bills by and otherwise
 * clears it and asks the billing step again, every later done step needing a recheck; an update takes the stored pipeline's agent; Apply
 * stores the record's agent and its billing, an update with none keeping the stored one; the forge's agent goes into the stored pipeline and
 * the open record alike, or into the record alone while no pipeline is stored, and a billing its new vendor does not bill by is never kept
 * silently: the stored pipeline's and an update or advise record's, which have no billing step, refuse the change unless a billing the
 * vendor offers comes with it, while a first setup's record asks its billing step again; the tools need a stored pipeline, and go into an open
 * update's draft too, so its Apply keeps them; and a launch refused for the agent's program stands on its job, logged once, until it is
 * tried again.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, refusalDetailOf }                      from '../../testing/BoardFixtures.ts';
import { EVERY_BILLING_MODE_OFFERED, EXAMPLE_PIPELINE_AGENT } from '../../testing/ExamplePipelineAgent.ts';
import type { Pipeline, PipelineAgent }                       from './@types/Pipeline.ts';
import type { OfferedBillingModesOf, PipelineSetupOpening }   from './@types/PipelineSetup.ts';
import { jobFixture }                                         from './testing/LifecycleFixtures.ts';
import { PipelineUtil }                                       from './utils/PipelineUtil.ts';

const AT = '2026-11-24T10:00:00+01:00';

const WITHOUT_BILLING: PipelineSetupOpening = {
  mode:                       'setup',
  billing:                    null,
  agent:                      EXAMPLE_PIPELINE_AGENT,
  offeredBillingModesOf:      EVERY_BILLING_MODE_OFFERED,
  replacesUnreadablePipeline: false,
  mainConstitution:           null,
  storedAnnotations:          [],
};

const UPDATE_OPENING: PipelineSetupOpening = {
  mode: 'update', billing: { mode: 'subscription' }, agent: EXAMPLE_PIPELINE_AGENT, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
};

const PINNED_AGENT: PipelineAgent = { vendor: 'example-agent', program: { pinned: '/opt/example/bin/agent' } };

/** A vendor that bills only by its login. */
const LOGIN_ONLY_AGENT: PipelineAgent = { vendor: 'login-only-agent', program: { follows: 'machine' } };

const LOGIN_ONLY_FOR_ITS_VENDOR: OfferedBillingModesOf = (vendor) => (vendor === LOGIN_ONLY_AGENT.vendor ? ['subscription'] : ['subscription', 'api']);

const STORED_PIPELINE: Pipeline = { ...PipelineUtil.minimalPipelineOf(), agent: EXAMPLE_PIPELINE_AGENT };

describe('the agent and billing steps', () => {
  test('a first setup starts with its agent, at the billing step, with research not started', () => {
    const { board } = boardFixture();
    const { setup } = board.openSetup(WITHOUT_BILLING, AT);
    expect([setup.currentStep, setup.agent, setup.billing, setup.stepStates.agent, setup.stepStates.billing, setup.stepStates.research])
      .toEqual(['billing', EXAMPLE_PIPELINE_AGENT, null, 'done', 'in-progress', 'not-started']);
  });

  test('the billing step\'s Continue is refused while the record holds no billing, and once it holds one research opens', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup(WITHOUT_BILLING, AT).setup;
    expect(refusalDetailOf(() => board.continueSetupStep(setupId, 'billing', AT))).toEqual({ reason: 'setup-billing-not-chosen', setupId });

    const chosen = board.setSetupBilling(setupId, { mode: 'api', maxBudgetUsd: 4 }, EVERY_BILLING_MODE_OFFERED, AT);
    expect(chosen.logged).toEqual([{
      at: AT, kind: 'pipeline-setup-billing-set', setupId, fields: { mode: 'api', maxBudgetUsd: 4 }
    }]);
    const { setup } = board.continueSetupStep(setupId, 'billing', AT);
    expect([setup.currentStep, setup.stepStates.billing, setup.stepStates.research]).toEqual(['research', 'done', 'in-progress']);
  });

  test('a first setup started with a billing too opens past the billing step, and an update takes the stored pipeline\'s agent', () => {
    const first = boardFixture().board.openSetup({ ...WITHOUT_BILLING, billing: { mode: 'subscription' } }, AT).setup;
    expect([first.currentStep, first.stepStates.billing, first.billing]).toEqual(['research', 'done', { mode: 'subscription' }]);
    const update = boardFixture({ pipeline: STORED_PIPELINE }).board.openSetup({ ...UPDATE_OPENING, agent: STORED_PIPELINE.agent ?? null }, AT).setup;
    expect([update.stepStates.agent, update.agent]).toEqual(['done', EXAMPLE_PIPELINE_AGENT]);
  });

  test('a billing the agent\'s vendor does not bill by is refused, at the start and on the step, and takes no setup id', () => {
    const { board, progress } = boardFixture();
    const apiStart = {
      ...WITHOUT_BILLING, agent: LOGIN_ONLY_AGENT, billing: { mode: 'api' }, offeredBillingModesOf: LOGIN_ONLY_FOR_ITS_VENDOR
    } as const;
    expect(refusalDetailOf(() => board.openSetup(apiStart, AT))).toEqual({
      reason: 'billing-not-offered', setupId: 'S1', vendor: 'login-only-agent', mode: 'api'
    });
    expect(progress.nextSetupId ?? 1).toBe(1);
    const { setupId } = board.openSetup({ ...apiStart, billing: null }, AT).setup;
    expect(refusalDetailOf(() => board.setSetupBilling(setupId, { mode: 'api' }, LOGIN_ONLY_FOR_ITS_VENDOR, AT))).toEqual({
      reason: 'billing-not-offered', setupId, vendor: 'login-only-agent', mode: 'api'
    });
  });

  test('an update over a pipeline without an agent takes no billing before an agent is chosen', () => {
    const { board } = boardFixture({ pipeline: PipelineUtil.minimalPipelineOf() });
    const { setupId } = board.openSetup({ ...UPDATE_OPENING, agent: null }, AT).setup;
    expect(refusalDetailOf(() => board.setSetupBilling(setupId, { mode: 'subscription' }, EVERY_BILLING_MODE_OFFERED, AT)))
      .toEqual({ reason: 'setup-billing-before-agent', setupId });
  });

  test('a change of agent keeps a billing its vendor bills by, its cap included, and reopens no step', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup({ ...WITHOUT_BILLING, billing: { mode: 'api', maxBudgetUsd: 3 } }, AT).setup;
    const changed = board.setSetupAgent(setupId, PINNED_AGENT, EVERY_BILLING_MODE_OFFERED, AT);
    expect(changed.logged.map((record) => record.kind)).toEqual(['pipeline-setup-agent-set']);
    expect([changed.setup.billing, changed.setup.currentStep]).toEqual([{ mode: 'api', maxBudgetUsd: 3 }, 'research']);
  });

  test('a change to an agent that does not bill that way clears the billing and asks the billing step again, later done steps rechecked', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup({ ...WITHOUT_BILLING, billing: { mode: 'api' }, offeredBillingModesOf: LOGIN_ONLY_FOR_ITS_VENDOR }, AT).setup;
    board.continueSetupStep(setupId, 'research', AT);
    const changed = board.setSetupAgent(setupId, LOGIN_ONLY_AGENT, LOGIN_ONLY_FOR_ITS_VENDOR, AT);
    expect(changed.logged.map((record) => record.kind)).toEqual(['pipeline-setup-agent-set', 'pipeline-setup-step-moved']);
    expect([changed.setup.billing, changed.setup.currentStep, changed.setup.stepStates.billing, changed.setup.stepStates.research])
      .toEqual([null, 'billing', 'in-progress', 'needs-recheck']);
    expect(refusalDetailOf(() => board.continueSetupStep(setupId, 'billing', AT))).toEqual({ reason: 'setup-billing-not-chosen', setupId });
  });

  test('a change at the billing step clears a billing the new vendor does not bill by and moves no step', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup(WITHOUT_BILLING, AT).setup;
    board.setSetupBilling(setupId, { mode: 'api' }, EVERY_BILLING_MODE_OFFERED, AT);
    const changed = board.setSetupAgent(setupId, LOGIN_ONLY_AGENT, LOGIN_ONLY_FOR_ITS_VENDOR, AT);
    expect(changed.logged.map((record) => record.kind)).toEqual(['pipeline-setup-agent-set']);
    expect([changed.setup.billing, changed.setup.currentStep]).toEqual([null, 'billing']);
  });

  test('Apply stores the record\'s billing beside its agent, so every job after it launches billed that way', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup({ ...WITHOUT_BILLING, billing: { mode: 'api', maxBudgetUsd: 6 } }, AT).setup;
    board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT);
    expect(board.pipeline()?.billing).toEqual({ mode: 'api', maxBudgetUsd: 6 });
  });

  test('an update with no billing chosen keeps the stored pipeline\'s billing at Apply, absent staying absent', () => {
    const stored: Pipeline = { ...STORED_PIPELINE, billing: { mode: 'api' } };
    const { board } = boardFixture({ pipeline: stored });
    const { setupId } = board.openSetup({ ...UPDATE_OPENING, billing: null }, AT).setup;
    board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT);
    expect(board.pipeline()?.billing).toEqual({ mode: 'api' });

    const withoutBilling = boardFixture({ pipeline: STORED_PIPELINE }).board;
    const update = withoutBilling.openSetup({ ...UPDATE_OPENING, billing: null }, AT).setup;
    withoutBilling.requestApply(update.setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT);
    expect(withoutBilling.pipeline()).not.toHaveProperty('billing');
  });

  test('Apply stores the record\'s agent in the pipeline', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup({ ...WITHOUT_BILLING, agent: PINNED_AGENT, billing: { mode: 'subscription' } }, AT).setup;
    board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT);
    expect(board.pipeline()?.agent).toEqual(PINNED_AGENT);
  });
});

describe('the forge\'s agent and tools', () => {
  test('the agent goes into the stored pipeline and the open record alike, and nothing else of the pipeline changes', () => {
    const { board } = boardFixture({ pipeline: STORED_PIPELINE });
    board.openSetup(UPDATE_OPENING, AT);
    const { logged } = board.setAgent(PINNED_AGENT, undefined, EVERY_BILLING_MODE_OFFERED, AT);
    expect(logged).toEqual([{ at: AT, kind: 'pipeline-agent-set', fields: { vendor: 'example-agent', program: '/opt/example/bin/agent' } }]);
    expect([board.pipeline()?.agent, board.pipelineSetup()?.agent, board.agentOfForge()]).toEqual([PINNED_AGENT, PINNED_AGENT, PINNED_AGENT]);
    expect(PipelineUtil.contentHashOf(board.pipeline() ?? STORED_PIPELINE)).toBe(PipelineUtil.contentHashOf(STORED_PIPELINE));
  });

  test('a forge agent that does not bill the stored way is refused billing-not-offered, with nothing changed, unless a way it bills comes with it', () => {
    const stored: Pipeline = { ...STORED_PIPELINE, billing: { mode: 'api' } };
    const { board } = boardFixture({ pipeline: stored });
    expect(refusalDetailOf(() => board.setAgent(LOGIN_ONLY_AGENT, undefined, LOGIN_ONLY_FOR_ITS_VENDOR, AT))).toEqual({
      reason: 'billing-not-offered', setupId: null, vendor: 'login-only-agent', mode: 'api'
    });
    expect(board.pipeline()).toEqual(stored);
    expect(refusalDetailOf(() => board.setAgent(LOGIN_ONLY_AGENT, { mode: 'api' }, LOGIN_ONLY_FOR_ITS_VENDOR, AT))).toMatchObject({ reason: 'billing-not-offered' });

    board.setAgent(LOGIN_ONLY_AGENT, { mode: 'subscription' }, LOGIN_ONLY_FOR_ITS_VENDOR, AT);
    expect([board.pipeline()?.agent, board.pipeline()?.billing]).toEqual([LOGIN_ONLY_AGENT, { mode: 'subscription' }]);
  });

  test('an open update or advise record has no billing step: its billing is judged with the agent change, and takes the billing sent', () => {
    const { board } = boardFixture({ pipeline: STORED_PIPELINE });
    board.openSetup({ ...UPDATE_OPENING, billing: { mode: 'api' } }, AT);
    expect(refusalDetailOf(() => board.setAgent(LOGIN_ONLY_AGENT, undefined, LOGIN_ONLY_FOR_ITS_VENDOR, AT))).toEqual({
      reason: 'billing-not-offered', setupId: 'S1', vendor: 'login-only-agent', mode: 'api'
    });

    const { logged } = board.setAgent(LOGIN_ONLY_AGENT, { mode: 'subscription' }, LOGIN_ONLY_FOR_ITS_VENDOR, AT);
    expect(logged.map((record) => record.kind)).toEqual(['pipeline-agent-set']);
    expect([board.pipelineSetup()?.agent, board.pipelineSetup()?.billing, board.pipelineSetup()?.currentStep])
      .toEqual([LOGIN_ONLY_AGENT, { mode: 'subscription' }, 'design']);
  });

  test('a first setup\'s record beside a stored pipeline follows a forge agent that does not bill its way by asking its billing step again', () => {
    const { board } = boardFixture({ pipeline: STORED_PIPELINE });
    const { setupId } = board.openSetup({ ...WITHOUT_BILLING, billing: { mode: 'api' } }, AT).setup;
    board.continueSetupStep(setupId, 'research', AT);
    const { logged } = board.setAgent(LOGIN_ONLY_AGENT, undefined, LOGIN_ONLY_FOR_ITS_VENDOR, AT);
    expect(logged.map((record) => record.kind)).toEqual(['pipeline-agent-set', 'pipeline-setup-step-moved']);
    expect([board.pipelineSetup()?.billing, board.pipelineSetup()?.currentStep]).toEqual([null, 'billing']);
  });

  test('with no stored pipeline the open record alone takes the agent, and with neither it is refused', () => {
    const { board } = boardFixture();
    expect(refusalDetailOf(() => board.setAgent(PINNED_AGENT, undefined, EVERY_BILLING_MODE_OFFERED, AT))).toEqual({ reason: 'agent-without-pipeline' });
    board.openSetup(WITHOUT_BILLING, AT);
    board.setAgent(PINNED_AGENT, undefined, EVERY_BILLING_MODE_OFFERED, AT);
    expect([board.pipeline(), board.pipelineSetup()?.agent, board.agentOfForge()]).toEqual([null, PINNED_AGENT, PINNED_AGENT]);
    expect(refusalDetailOf(() => board.setAgent(LOGIN_ONLY_AGENT, { mode: 'api' }, LOGIN_ONLY_FOR_ITS_VENDOR, AT))).toMatchObject({ reason: 'billing-not-offered', setupId: 'S1' });
    expect(board.pipelineSetup()?.agent).toEqual(PINNED_AGENT);
    board.setAgent(LOGIN_ONLY_AGENT, { mode: 'subscription' }, LOGIN_ONLY_FOR_ITS_VENDOR, AT);
    expect([board.pipelineSetup()?.agent, board.pipelineSetup()?.billing]).toEqual([LOGIN_ONLY_AGENT, { mode: 'subscription' }]);
  });

  test('the tools need a stored pipeline, and null removes the list', () => {
    expect(refusalDetailOf(() => boardFixture().board.setTools([], AT))).toEqual({ reason: 'tools-without-pipeline' });
    const { board } = boardFixture({ pipeline: STORED_PIPELINE });
    board.setTools([{ name: 'bun', path: '/opt/example/bin/bun' }], AT);
    expect(board.pipeline()?.tools).toEqual([{ name: 'bun', path: '/opt/example/bin/bun' }]);
    const { logged } = board.setTools(null, AT);
    expect([board.pipeline()?.tools, logged.map((record) => record.fields)]).toEqual([undefined, [{ paths: [] }]]);
  });

  test('tools set while an update is open go into its draft too, so its Apply never writes the older list back', () => {
    const { board } = boardFixture({ pipeline: { ...STORED_PIPELINE, tools: [{ name: 'bun', path: '/opt/example/bin/bun' }] } });
    const { setupId } = board.openSetup(UPDATE_OPENING, AT).setup;
    const tools = [{ name: 'bun', path: '/opt/example/bin/bun' }, { name: 'gh', path: '/opt/example/bin/gh' }];
    board.setTools(tools, AT);
    board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT);
    expect(board.pipeline()?.tools).toEqual(tools);
  });
});

describe('a launch that is not launched', () => {
  test('stands on its job, logged once however often it is refused alike, until it is tried again, which every agent change does', () => {
    const { board, progress } = boardFixture({ pipeline: STORED_PIPELINE });
    progress.jobs = [jobFixture({ id: 'J1', state: 'launching' })];
    const notLaunched = { cause: 'not-there', programPath: '/opt/example/bin/agent' } as const;
    expect(board.recordNotLaunched('J1', notLaunched, AT).logged.map((record) => record.kind)).toEqual(['job-not-launched']);
    expect(board.recordNotLaunched('J1', notLaunched, AT).logged).toEqual([]);
    expect(board.jobById('J1')?.notLaunched).toEqual(notLaunched);

    expect(board.setAgent(PINNED_AGENT, undefined, EVERY_BILLING_MODE_OFFERED, AT).logged.map((record) => record.kind)).toEqual(['pipeline-agent-set', 'job-launch-retried']);
    expect(board.jobById('J1')?.notLaunched).toBeUndefined();
    expect(board.retryNotLaunched(AT).logged).toEqual([]);
  });
});
