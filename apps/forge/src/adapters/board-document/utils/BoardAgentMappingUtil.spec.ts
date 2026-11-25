/**
 * The board document's agent, mapped field by field. What matters: every fact a view reads arrives, each vendor's ways to bill among them, a
 * program that does not run arrives with forge's own sentence naming the agent and the path, and a tool keeps where each step runs it.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_AGENT_FACTS }   from '../../../testing/ExampleAgentFacts.ts';
import { BoardAgentMappingUtil } from './BoardAgentMappingUtil.ts';

describe('BoardAgentMappingUtil.agentOf', () => {
  test('maps the vendors with the ways each bills, the choice, both programs, the run, the places and the tools', () => {
    expect(BoardAgentMappingUtil.agentOf(EXAMPLE_AGENT_FACTS)).toEqual({
      vendors: [{
        vendor:         'example-agent',
        displayName:    'Example Agent',
        supported:      true,
        billingOptions: [
          { mode: 'subscription', keyVariableName: null, capsEachLaunch: false },
          { mode: 'api', keyVariableName: 'EXAMPLE_AGENT_KEY', capsEachLaunch: true },
        ],
      }],
      choice:             { vendor: 'example-agent', program: { follows: 'machine' } },
      machineProgramPath: '/opt/example/bin/agent',
      programPath:        '/opt/example/bin/agent',
      check:              { verdict: 'runs', version: '1.2.3' },
      places:             [{ path: '/opt/example/bin/agent', found: true }],
      toolsListed:        false,
      tools:              [{
        name: 'git', path: '/usr/bin/git', approved: true, usedBy: [{ kind: 'every-job' }]
      }],
    });
  });

  test('words a program that does not run with the agent and the path, and keeps a tool\'s gate and entity', () => {
    const agent = BoardAgentMappingUtil.agentOf({
      ...EXAMPLE_AGENT_FACTS,
      check: { verdict: 'does-not-run', programPath: '/opt/example/bin/agent', cause: 'timed-out' },
      tools: [{
        name: 'bun', path: null, approved: false, usedBy: [{ kind: 'gate', name: 'types', entity: 'web' }]
      }],
    });
    expect(agent.check).toEqual({ verdict: 'does-not-run', cause: 'timed-out', sentence: 'the Example Agent at /opt/example/bin/agent did not answer in time' });
    expect(agent.tools).toEqual([{
      name: 'bun', path: null, approved: false, usedBy: [{ kind: 'gate', name: 'types', entity: 'web' }]
    }]);
  });
});
