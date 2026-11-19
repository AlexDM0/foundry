/**
 * Where Claude Code's session-start entry lands decides who it reaches: absent, it goes into the per-user settings file colleagues do not
 * share; a shared settings file that already holds it keeps it current there and gets no second copy; an unreadable file is refused and
 * left byte for byte. A bundle loads from the project's skill folder of its name.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { CLAUDE_CODE_INSTALLER }                          from './ClaudeCodeInstaller.ts';

const EXAMPLE_COMMAND = 'example-tool hook session-start';

const EXAMPLE_COMMAND_NAME = 'example-tool update';

const CURRENT_GROUP = { matcher: '', hooks: [{ type: 'command', command: EXAMPLE_COMMAND, timeout: 10 }] };

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchRepository(): string {
  const repositoryRoot = createScratchDirectory('claude-code-installer');
  scratchDirectories.push(repositoryRoot);
  return repositoryRoot;
}

function settingsPathIn(repositoryRoot: string, fileName: string): string {
  return join(repositoryRoot, '.claude', fileName);
}

function writeSettingsText(repositoryRoot: string, fileName: string, text: string): void {
  mkdirSync(join(repositoryRoot, '.claude'), { recursive: true });
  writeFileSync(settingsPathIn(repositoryRoot, fileName), text);
}

function sessionStartGroupsIn(repositoryRoot: string, fileName: string): unknown {
  const settings = JSON.parse(readFileSync(settingsPathIn(repositoryRoot, fileName), 'utf8')) as { hooks?: Record<string, unknown> };
  return settings.hooks?.['SessionStart'];
}

function refreshIn(repositoryRoot: string): { line: string; errorText: string } {
  let errorText = '';
  const line = CLAUDE_CODE_INSTALLER.refreshSessionStart(repositoryRoot, EXAMPLE_COMMAND, EXAMPLE_COMMAND_NAME, (text) => {
    errorText += text;
  });
  return { line, errorText };
}

describe('the session-start entry', () => {
  test('absent, it is installed in the per-user settings file, the shared one is not created, and a rerun leaves it unchanged', () => {
    const repositoryRoot = scratchRepository();

    expect(refreshIn(repositoryRoot)).toEqual({ line: `${settingsPathIn(repositoryRoot, 'settings.local.json')} (installed)`, errorText: '' });
    expect(sessionStartGroupsIn(repositoryRoot, 'settings.local.json')).toEqual([CURRENT_GROUP]);
    expect(existsSync(settingsPathIn(repositoryRoot, 'settings.json'))).toBe(false);

    expect(refreshIn(repositoryRoot).line).toBe(`${settingsPathIn(repositoryRoot, 'settings.local.json')} (unchanged)`);
  });

  test('held by the shared settings file, it is kept current there and never written into the per-user file', () => {
    const repositoryRoot = scratchRepository();
    const staleGroup = { matcher: '', hooks: [{ type: 'command', command: EXAMPLE_COMMAND, timeout: 3 }] };
    writeSettingsText(repositoryRoot, 'settings.json', `${JSON.stringify({ hooks: { SessionStart: [staleGroup] } }, null, 2)}\n`);

    expect(refreshIn(repositoryRoot).line).toBe(`${settingsPathIn(repositoryRoot, 'settings.json')} (updated)`);
    expect(sessionStartGroupsIn(repositoryRoot, 'settings.json')).toEqual([CURRENT_GROUP]);
    expect(existsSync(settingsPathIn(repositoryRoot, 'settings.local.json'))).toBe(false);
  });

  test('an unreadable settings file is refused and left as it was, and standard error names the file and the command to run again', () => {
    for (const fileName of ['settings.json', 'settings.local.json']) {
      const repositoryRoot = scratchRepository();
      const malformed = '{ "hooks": { "SessionStart": [ ';
      writeSettingsText(repositoryRoot, fileName, malformed);

      const { line, errorText } = refreshIn(repositoryRoot);

      expect(line, fileName).toBe('refused (the settings file could not be read)');
      expect(readFileSync(settingsPathIn(repositoryRoot, fileName), 'utf8'), fileName).toBe(malformed);
      expect(errorText, fileName).toContain(settingsPathIn(repositoryRoot, fileName));
      expect(errorText, fileName).toContain(`run \`${EXAMPLE_COMMAND_NAME}\` again, or add the \`${EXAMPLE_COMMAND}\` hook to it by hand.`);
    }
  });
});

describe('the instruction bundle folder', () => {
  test('a bundle loads from the project skill folder of its name, written with /', () => {
    expect(CLAUDE_CODE_INSTALLER.instructionBundleFolderOf('example-bundle')).toBe('.claude/skills/example-bundle');
  });
});
