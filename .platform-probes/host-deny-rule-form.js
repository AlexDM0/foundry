// What form a deny rule must take to refuse: one session per spelling of the same absolute folder, each trying one Write.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { observedSession, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

function ruleFormsOf(folder) {
  const forwardSlashes = folder.replaceAll('\\', '/');
  const forms = {
    rootAnchored: `Write(/${forwardSlashes}/**)`,
    singleSlash: `Write(${forwardSlashes}/**)`,
    nativeSeparators: `Write(${folder}\\**)`,
  };
  if (process.platform === 'win32') forms.lowerDriveWithoutColon = `Write(//${forwardSlashes[0].toLowerCase()}${forwardSlashes.slice(2)}/**)`;
  return forms;
}

async function writeAttemptUnder(rule, deniedFolder) {
  const workingFolder = scratchFolder();
  const targetPath = join(deniedFolder, `target-${crypto.randomUUID()}.txt`);
  const settingsPath = writeJsonFile(join(workingFolder, 'settings.json'), { permissions: { deny: [rule] } });
  const session = await observedSession({
    cwd: workingFolder,
    extraArguments: ['--settings', settingsPath, '--permission-mode', 'auto'],
    prompts: [`Use the Write tool, once, to create ${targetPath} holding the word probe. Report what the tool said.`],
  });
  return { rule, fileWritten: existsSync(targetPath), toolResults: session.toolResults, results: session.results, exitCode: session.exitCode };
}

await probe({
  unknown: 'host-deny-rule-form',
  needsClaudeProgram: true,
  observe: async () => {
    const deniedFolder = join(scratchFolder(), 'denied');
    mkdirSync(deniedFolder);
    const attempts = {};
    for (const [formName, rule] of Object.entries(ruleFormsOf(deniedFolder))) attempts[formName] = await writeAttemptUnder(rule, deniedFolder);
    return { deniedFolder, attempts };
  },
});
