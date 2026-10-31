// P15: an install line and a gate in a linked worktree under a sandbox writing only to the worktree. The macOS record
// ran `sandbox-exec` directly; this one goes through Claude's sandbox, which is what exists on every platform.
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { observedSession, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, scratchFolder } from './support/scratch.js';

const GATE_PACKAGE = { name: 'probe-gate', private: true, scripts: { verify: 'git status --short' } };

await probe({
  unknown: 'claude-p15-gates-under-sandbox',
  needsClaudeProgram: true,
  observe: async () => {
    const { data, worktree, common } = await createLinkedRepository();
    const gateMarker = join(data, 'gates', 'gate-written.txt');
    writeFileSync(join(worktree, 'package.json'), JSON.stringify(GATE_PACKAGE));
    const settingsPath = writeJsonFile(join(scratchFolder(), 'settings.json'), {
      sandbox: sandboxSettingsOf({
        filesystem: { allowWrite: [worktree, tmpdir()], denyWrite: [data, join(common, 'refs'), join(common, 'packed-refs')] },
      }),
    });
    const session = await observedSession({
      cwd: worktree,
      extraArguments: ['--settings', settingsPath, '--permission-mode', 'auto'],
      prompts: [[
        'Run each with the Bash tool, whatever the outcome, and print each output and exit code:',
        'bun install',
        'bun run verify',
        `echo probe > '${gateMarker}'`,
      ].join('\n')],
    });
    return { gateMarkerWritten: existsSync(gateMarker), toolCalls: session.toolCalls, toolResults: session.toolResults, results: session.results, exitCode: session.exitCode };
  },
});
