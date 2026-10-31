// One recorded session saved as a `.stdout.jsonl` and `.stdin.jsonl` pair beside the verdicts, named after the OS.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runSession } from './support/claude-session.js';
import { probe, resultsFolder } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const FIXTURE_PROMPT = 'Run `git --version` with the Bash tool, once, then reply with the single word done.';

await probe({
  unknown: 'host-stream-fixture',
  needsClaudeProgram: true,
  observe: async () => {
    const { rawLines, spawnError, exitCode, signalCode, stderr } = await runSession({
      cwd: scratchFolder(),
      extraArguments: ['--permission-mode', 'auto'],
      prompts: [FIXTURE_PROMPT],
    });
    if (spawnError !== undefined) return { spawnError };
    const fixtureStem = join(resultsFolder(), `stream-fixture-${process.platform}-${process.arch}`);
    writeFileSync(`${fixtureStem}.stdout.jsonl`, rawLines.map((line) => JSON.stringify(line)).join('\n'));
    writeFileSync(`${fixtureStem}.stdin.jsonl`, JSON.stringify({ type: 'user', message: { role: 'user', content: FIXTURE_PROMPT } }));
    return { fixtureStem, exitCode, signalCode, stderr, lineTypes: rawLines.map((line) => line.type) };
  },
});
