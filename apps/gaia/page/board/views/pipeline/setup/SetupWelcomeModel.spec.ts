/**
 * The setup welcome's model. What matters: the title names the project, or the pipeline when the forge has no project name; the steps are
 * the ones a setup with no record walks, in their order, so no `entities` step shows before a record holds it, and the agent step leads,
 * current; the agent line says where forge found this machine's program, or that it found none, by the vendor's own name; and the tickets
 * line shows only while tickets wait.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_AGENT_PROGRAM_PATH, exampleBoardAgent, nothingFoundBoardAgent } from '../../../testing/AgentFixture.ts';
import { PipelineViewModel }                                                     from '../PipelineViewModel.ts';
import { SetupWelcomeModel }                                                     from './SetupWelcomeModel.ts';

describe('the title', () => {
  test('names the project, and the pipeline when the forge has no project name', () => {
    expect(SetupWelcomeModel.titleOf('Example Agency')).toBe('Set up Example Agency\'s pipeline');
    expect(SetupWelcomeModel.titleOf('')).toBe('Set up the pipeline');
  });
});

describe('the steps', () => {
  test('are the steps a setup with no record walks, numbered in order, the agent first and current', () => {
    const rows = SetupWelcomeModel.stepRowsOf();
    expect(rows.map((row) => row.step)).toEqual([...PipelineViewModel.setupStepsOf(null)]);
    expect(rows.map((row) => row.position)).toEqual(rows.map((_row, index) => index + 1));
    expect(rows.filter((row) => row.isCurrent).map((row) => row.step)).toEqual(['agent']);
    expect(rows.map((row) => row.step)).not.toContain('entities');
  });

  test('each says what it decides in one line', () => {
    expect(SetupWelcomeModel.stepRowsOf()[0]).toEqual({
      step: 'agent', position: 1, label: 'Agent', summary: 'The coding agent every job runs.', isCurrent: true
    });
  });
});

describe('the agent line', () => {
  test('says where forge found this machine\'s program, by the vendor\'s name', () => {
    expect(SetupWelcomeModel.agentLineOf(exampleBoardAgent())).toEqual({ programIsFound: true, text: 'Example Agent found at', path: EXAMPLE_AGENT_PROGRAM_PATH });
  });

  test('says forge found none, and where it is chosen, while no program is there', () => {
    const text = 'Forge found no Example Agent program yet. You choose it in the first step.';
    expect(SetupWelcomeModel.agentLineOf(nothingFoundBoardAgent())).toEqual({ programIsFound: false, text });
  });
});

describe('the waiting tickets', () => {
  test('count the committed tickets, and say nothing while none waits', () => {
    expect(SetupWelcomeModel.waitingTicketsTextOf([{ status: 'committed' }, { status: 'committed' }, { status: 'in-progress' }]))
      .toBe('2 tickets wait for a pipeline; none of them builds yet.');
    expect(SetupWelcomeModel.waitingTicketsTextOf([{ status: 'in-progress' }])).toBeNull();
  });
});
