/**
 * The board's notice about its agent. What matters: while the board has no readable pipeline, a job not launched only because no agent is
 * chosen makes no notice, since the setup on screen chooses the agent, while any other refusal still does, worded with its own reason; once
 * the pipeline is readable every not-launched job makes the notice again.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardJobNotLaunchedDocument } from '../../@types/board/BoardAgentDocuments.ts';
import type { BoardDocument }               from '../../@types/board/BoardDocument.ts';
import { exampleAgentJob }                  from '../testing/BoardStateFixture.ts';
import { pipelineBoardStateOf }             from '../testing/PipelineFixture.ts';
import { AgentNoticeModel }                 from './AgentNoticeModel.ts';

const NO_AGENT_CHOSEN: BoardJobNotLaunchedDocument = { cause: 'no-agent-chosen', programPath: null, text: 'no agent is chosen for this board' };

const NOT_THERE: BoardJobNotLaunchedDocument = { cause: 'not-there', programPath: '/opt/example/bin/agent', text: 'the example agent is not there' };

function boardWithNotLaunched(board: BoardDocument, notLaunchedOfJob: Readonly<Record<string, BoardJobNotLaunchedDocument>>): BoardDocument {
  return { ...board, jobs: Object.entries(notLaunchedOfJob).map(([id, notLaunched]) => exampleAgentJob({ id, notLaunched })) };
}

describe('the agent notice while the board is in setup', () => {
  test('a job not launched only because no agent is chosen makes no notice', () => {
    expect(AgentNoticeModel.agentNoticeOf(boardWithNotLaunched(pipelineBoardStateOf('A0'), { J1: NO_AGENT_CHOSEN }))).toBeNull();
  });

  test('another refusal still makes the notice, worded with its own reason and naming only its own job', () => {
    const notice = AgentNoticeModel.agentNoticeOf(boardWithNotLaunched(pipelineBoardStateOf('A0'), { J1: NO_AGENT_CHOSEN, J2: NOT_THERE }));
    expect([notice?.tone, notice?.text]).toEqual(['error', 'Job J2 is not launched: the example agent is not there.']);
  });
});

describe('the agent notice once the pipeline is readable', () => {
  test('a job not launched because no agent is chosen makes the notice', () => {
    const notice = AgentNoticeModel.agentNoticeOf(boardWithNotLaunched(pipelineBoardStateOf('A5'), { J1: NO_AGENT_CHOSEN }));
    expect(notice?.text).toBe('Job J1 is not launched: no agent is chosen for this board.');
  });
});
