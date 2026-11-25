/** The agent facts a spec's board state carries: the example agent, following this machine's program, which runs, with git as its one tool. */
import type { AgentFacts } from '../shared/@types/AgentFacts.ts';

export const EXAMPLE_AGENT_FACTS: Readonly<AgentFacts> = Object.freeze<AgentFacts>({
  vendors:            [{ vendor: 'example-agent', displayName: 'Example Agent', supported: true }],
  agentName:          'Example Agent',
  choice:             { vendor: 'example-agent', program: { follows: 'machine' } },
  machineProgramPath: '/opt/example/bin/agent',
  programPath:        '/opt/example/bin/agent',
  check:              { verdict: 'runs', programPath: '/opt/example/bin/agent', version: '1.2.3' },
  places:             [{ path: '/opt/example/bin/agent', found: true }],
  toolsListed:        false,
  tools:              [{
    name: 'git', path: '/usr/bin/git', approved: true, usedBy: [{ kind: 'every-job' }]
  }],
  setupTools: [],
});
