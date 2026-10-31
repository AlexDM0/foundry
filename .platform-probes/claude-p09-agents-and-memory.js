// P9: the auto-memory switch, subagent model precedence, modelUsage and the Agent deny rule, under dontAsk with the
// agents given through --agents.
import { join } from 'node:path';

import { observedSession, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createRepository, scratchFolder } from './support/scratch.js';

const SEARCH_TOOLS = ['Read', 'Bash(rg *)', 'Bash(grep *)', 'Bash(find *)'];
const AGENTS = {
  explorer: { description: 'Searches files.', prompt: 'Search as asked and report in one line.', model: 'sonnet', tools: SEARCH_TOOLS },
  coder: { description: 'Answers briefly.', prompt: 'Answer in one word.', model: 'sonnet', tools: ['Read'] },
};

function sessionUnder({ permissions, autoMemoryEnabled, prompt, environment }) {
  return async (repository) => {
    const settingsPath = writeJsonFile(join(scratchFolder(), 'settings.json'), {
      permissions: { allow: ['Read', 'Agent', ...SEARCH_TOOLS.slice(1)], ...permissions },
      ...(autoMemoryEnabled === undefined ? {} : { autoMemoryEnabled }),
    });
    return observedSession({
      cwd: repository,
      environment,
      extraArguments: ['--settings', settingsPath, '--agents', JSON.stringify(AGENTS), '--permission-mode', 'dontAsk'],
      prompts: [prompt],
    });
  };
}

const RUNS = {
  memoryOffAndModelParameter: sessionUnder({
    autoMemoryEnabled: false,
    prompt: 'Start the coder agent with the Agent tool, its model parameter set to haiku, asking it to reply ok. Then say done.',
  }),
  memoryOnAndCoderDenied: sessionUnder({
    permissions: { deny: ['Agent(coder)'] },
    prompt: 'Start the coder agent, then the explorer agent, each with the Agent tool asking for the word ok. Report each outcome.',
  }),
  explorerModel: sessionUnder({
    prompt: 'Start the explorer agent, no model parameter, asking it to run rg -l first and report. Then say done.',
  }),
  explorerModelUnderEnvironmentVariable: sessionUnder({
    environment: { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: 'opus' },
    prompt: 'Start the explorer agent, no model parameter, asking it to run rg -l first and report. Then say done.',
  }),
};

await probe({
  unknown: 'claude-p09-agents-and-memory',
  needsClaudeProgram: true,
  observe: async () => {
    const repository = await createRepository(join(scratchFolder(), 'repo'));
    const observed = {};
    for (const [runName, run] of Object.entries(RUNS)) observed[runName] = await run(repository);
    return observed;
  },
});
