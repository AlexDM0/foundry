// P5: Edit, Write and Read under `//`-anchored deny rules in auto mode, then the sandbox's denyRead glob on its own
// under dontAsk.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { observedSession, rootAnchored, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, scratchFolder } from './support/scratch.js';

function writeJobFiles(data) {
  for (const job of ['J1', 'J2']) mkdirSync(join(data, 'jobs', job), { recursive: true });
  writeFileSync(join(data, 'jobs', 'J1', 'launch-7.json'), '{}\n');
  writeFileSync(join(data, 'jobs', 'J2', 'launch-1.json'), '{}\n');
  writeFileSync(join(data, 'jobs', 'J2', 'status.json'), '{"status":"readable"}\n');
}

await probe({
  unknown: 'claude-p05-anchored-rules',
  needsClaudeProgram: true,
  observe: async () => {
    const { repository, data, worktrees, worktree } = await createLinkedRepository();
    const hatch = join(worktrees, 'hatch', 'J2');
    const outside = scratchFolder();
    const settingsFolder = scratchFolder();
    mkdirSync(hatch, { recursive: true });
    writeJobFiles(data);
    const deniedFolders = [data, join(worktrees, 'hatch'), join(worktree, '.claude')];
    const deny = [
      ...deniedFolders.flatMap((folder) => [`Edit(${rootAnchored(folder)}/**)`, `Write(${rootAnchored(folder)}/**)`]),
      `Edit(${rootAnchored(join(repository, 'file.txt'))})`,
      `Read(${rootAnchored(join(data, 'jobs'))}/*/launch-*.json)`,
    ];
    const denyReadGlob = join(data, 'jobs', '*', 'launch-*.json');
    const filesystem = { denyWrite: [data], denyRead: [denyReadGlob] };
    const toolPrompt = [
      'Attempt each step with the named tool, whatever the outcome, then report each outcome:',
      `1. Edit: in ${join(data, 'gates', 'gate.txt')} replace gate with changed.`,
      `2. Write: create ${join(hatch, 'note.txt')} holding probe.`,
      `3. Edit: in ${join(repository, 'file.txt')} replace first with changed.`,
      `4. Write: create ${join(worktree, '.claude', 'note.txt')} holding probe.`,
      `5. Read: read ${join(data, 'jobs', 'J2', 'launch-1.json')}.`,
      `6. Edit: in ${join(worktree, 'file.txt')} replace first with changed.`,
      `7. Write: create ${join(outside, 'written.txt')} holding probe.`,
    ].join('\n');
    const sandboxPrompt = [
      'Run each with the Bash tool, whatever the outcome, then print each output:',
      `cat '${join(data, 'jobs', 'J2', 'status.json')}'`,
      `cat '${join(data, 'jobs', 'J2', 'launch-1.json')}'`,
      `cat '${join(data, 'jobs', 'J1', 'launch-7.json')}'`,
      `echo probe > '${join(data, 'gates', 'written.txt')}'`,
    ].join('\n');
    const autoSettings = writeJsonFile(join(settingsFolder, 'auto.json'), {
      sandbox: sandboxSettingsOf({ filesystem }),
      permissions: { allow: [`Edit(${rootAnchored(worktree)}/**)`, `Write(${rootAnchored(worktree)}/**)`], deny },
    });
    const sandboxOnlySettings = writeJsonFile(join(settingsFolder, 'sandbox-only.json'), {
      sandbox: sandboxSettingsOf({ filesystem }),
      permissions: { allow: ['Bash(cat *)', 'Bash(echo *)'] },
    });
    return {
      autoMode: await observedSession({ cwd: worktree, extraArguments: ['--settings', autoSettings, '--permission-mode', 'auto'], prompts: [toolPrompt] }),
      filesAfterAutoMode: {
        gate: readFileSync(join(data, 'gates', 'gate.txt'), 'utf8'),
        hatchNote: existsSync(join(hatch, 'note.txt')),
        mainCheckoutFile: readFileSync(join(repository, 'file.txt'), 'utf8'),
        worktreeClaudeNote: existsSync(join(worktree, '.claude', 'note.txt')),
        worktreeFile: readFileSync(join(worktree, 'file.txt'), 'utf8'),
        outsideWritten: existsSync(join(outside, 'written.txt')),
      },
      sandboxOnly: await observedSession({ cwd: worktree, extraArguments: ['--settings', sandboxOnlySettings, '--permission-mode', 'dontAsk'], prompts: [sandboxPrompt] }),
      gateWrittenBySandboxOnlySession: existsSync(join(data, 'gates', 'written.txt')),
    };
  },
});
