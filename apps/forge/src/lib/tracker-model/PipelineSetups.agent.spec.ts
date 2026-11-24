/**
 * The forge's agent on the Board. What matters: a first setup with no agent opens at the agent step, which no Continue leaves until the
 * record holds one, and with one it opens past it; an update takes the stored pipeline's agent; Apply stores the record's agent; the
 * forge's agent goes into the stored pipeline and the open record alike, or into the record alone while no pipeline is stored; the tools
 * need a stored pipeline; and a launch refused for the agent's program stands on its job, logged once, until it is tried again.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, refusalDetailOf } from '../../testing/BoardFixtures.ts';
import { EXAMPLE_PIPELINE_AGENT }        from '../../testing/ExamplePipelineAgent.ts';
import type { Pipeline, PipelineAgent }  from './@types/Pipeline.ts';
import type { PipelineSetupOpening }     from './@types/PipelineSetup.ts';
import { jobFixture }                    from './testing/LifecycleFixtures.ts';
import { PipelineUtil }                  from './utils/PipelineUtil.ts';

const AT = '2026-11-24T10:00:00+01:00';

const WITHOUT_AGENT: PipelineSetupOpening = {
  mode: 'setup', billing: { mode: 'subscription' }, agent: null, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
};

const PINNED_AGENT: PipelineAgent = { vendor: 'example-agent', program: { pinned: '/opt/example/bin/agent' } };

const STORED_PIPELINE: Pipeline = { ...PipelineUtil.minimalPipelineOf(), agent: EXAMPLE_PIPELINE_AGENT };

describe('the agent step', () => {
  test('a first setup with no agent opens at the agent step, with research not started', () => {
    const { board } = boardFixture();
    const { setup } = board.openSetup(WITHOUT_AGENT, AT);
    expect([setup.currentStep, setup.agent, setup.stepStates.agent, setup.stepStates.research]).toEqual(['agent', null, 'in-progress', 'not-started']);
  });

  test('its Continue is refused while the record holds no agent, and once it holds one research opens', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup(WITHOUT_AGENT, AT).setup;
    expect(refusalDetailOf(() => board.continueSetupStep(setupId, 'agent', AT))).toEqual({ reason: 'setup-agent-not-chosen', setupId });

    const chosen = board.setSetupAgent(setupId, PINNED_AGENT, AT);
    expect(chosen.logged).toEqual([{
      at: AT, kind: 'pipeline-setup-agent-set', setupId, fields: { vendor: 'example-agent', program: '/opt/example/bin/agent' }
    }]);
    const { setup } = board.continueSetupStep(setupId, 'agent', AT);
    expect([setup.currentStep, setup.stepStates.agent, setup.stepStates.research]).toEqual(['research', 'done', 'in-progress']);
  });

  test('a first setup with an agent opens past the step, and an update takes the stored pipeline\'s agent', () => {
    const first = boardFixture().board.openSetup({ ...WITHOUT_AGENT, agent: EXAMPLE_PIPELINE_AGENT }, AT).setup;
    expect([first.currentStep, first.stepStates.agent, first.agent]).toEqual(['research', 'done', EXAMPLE_PIPELINE_AGENT]);
    const update = boardFixture({ pipeline: STORED_PIPELINE }).board.openSetup({ ...WITHOUT_AGENT, mode: 'update', agent: STORED_PIPELINE.agent ?? null }, AT).setup;
    expect([update.stepStates.agent, update.agent]).toEqual(['done', EXAMPLE_PIPELINE_AGENT]);
  });

  test('Apply stores the record\'s agent in the pipeline', () => {
    const { board } = boardFixture();
    const { setupId } = board.openSetup({ ...WITHOUT_AGENT, agent: PINNED_AGENT }, AT).setup;
    board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT);
    expect(board.pipeline()?.agent).toEqual(PINNED_AGENT);
  });
});

describe('the forge\'s agent and tools', () => {
  test('the agent goes into the stored pipeline and the open record alike, and nothing else of the pipeline changes', () => {
    const { board } = boardFixture({ pipeline: STORED_PIPELINE });
    board.openSetup({ ...WITHOUT_AGENT, mode: 'update', agent: EXAMPLE_PIPELINE_AGENT }, AT);
    const { logged } = board.setAgent(PINNED_AGENT, AT);
    expect(logged).toEqual([{ at: AT, kind: 'pipeline-agent-set', fields: { vendor: 'example-agent', program: '/opt/example/bin/agent' } }]);
    expect([board.pipeline()?.agent, board.pipelineSetup()?.agent, board.agentOfForge()]).toEqual([PINNED_AGENT, PINNED_AGENT, PINNED_AGENT]);
    expect(PipelineUtil.contentHashOf(board.pipeline() ?? STORED_PIPELINE)).toBe(PipelineUtil.contentHashOf(STORED_PIPELINE));
  });

  test('with no stored pipeline the open record alone takes the agent, and with neither it is refused', () => {
    const { board } = boardFixture();
    expect(refusalDetailOf(() => board.setAgent(PINNED_AGENT, AT))).toEqual({ reason: 'agent-without-pipeline' });
    board.openSetup(WITHOUT_AGENT, AT);
    board.setAgent(PINNED_AGENT, AT);
    expect([board.pipeline(), board.pipelineSetup()?.agent, board.agentOfForge()]).toEqual([null, PINNED_AGENT, PINNED_AGENT]);
  });

  test('the tools need a stored pipeline, and null removes the list', () => {
    expect(refusalDetailOf(() => boardFixture().board.setTools([], AT))).toEqual({ reason: 'tools-without-pipeline' });
    const { board } = boardFixture({ pipeline: STORED_PIPELINE });
    board.setTools([{ name: 'bun', path: '/opt/example/bin/bun' }], AT);
    expect(board.pipeline()?.tools).toEqual([{ name: 'bun', path: '/opt/example/bin/bun' }]);
    const { logged } = board.setTools(null, AT);
    expect([board.pipeline()?.tools, logged.map((record) => record.fields)]).toEqual([undefined, [{ paths: [] }]]);
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

    expect(board.setAgent(PINNED_AGENT, AT).logged.map((record) => record.kind)).toEqual(['pipeline-agent-set', 'job-launch-retried']);
    expect(board.jobById('J1')?.notLaunched).toBeUndefined();
    expect(board.retryNotLaunched(AT).logged).toEqual([]);
  });
});
