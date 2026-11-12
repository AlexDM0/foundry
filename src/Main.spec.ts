/**
 * The entry point's contract: the version answer other programs parse, the usage text, and a refusal for an unknown verb. One case runs
 * the program itself, since other programs read the version answer from its standard output and exit code.
 */
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import packageManifest from '../package.json' with { type: 'json' };

import { runGaia, type ProgramOutput } from './Main.ts';
import { environmentCopy }             from './services/Environment.ts';

interface CapturedOutput extends ProgramOutput {
  readonly standardOutput: () => string;
  readonly standardError:  () => string;
}

function capturedOutput(): CapturedOutput {
  let standardOutputText = '';
  let standardErrorText  = '';
  return {
    writeStandardOutput: (text) => { standardOutputText += text; },
    writeStandardError:  (text) => { standardErrorText += text; },
    standardOutput:      () => standardOutputText,
    standardError:       () => standardErrorText,
  };
}

describe('gaia version', () => {
  test('answers the versioned JSON with --json', async () => {
    const output = capturedOutput();
    expect(await runGaia(['version', '--json'], output)).toBe(0);
    expect(JSON.parse(output.standardOutput())).toEqual({ answerVersion: 1, gaiaVersion: packageManifest.version, installVersion: 1 });
  });

  test('prints the versioned JSON and exits 0 when run as the gaia program', () => {
    const finished = Bun.spawnSync([process.execPath, join(import.meta.dir, 'Main.ts'), 'version', '--json'], { env: environmentCopy(), stdout: 'pipe', stderr: 'pipe' });
    expect(finished.exitCode).toBe(0);
    expect(JSON.parse(finished.stdout.toString())).toEqual({ answerVersion: 1, gaiaVersion: packageManifest.version, installVersion: 1 });
  });

  test('answers one readable line without --json', async () => {
    const output = capturedOutput();
    expect(await runGaia(['version'], output)).toBe(0);
    expect(output.standardOutput()).toBe(`gaia ${packageManifest.version} (install version 1)\n`);
  });
});

describe('gaia help', () => {
  test('lists every verb, also when no verb is given', async () => {
    const output = capturedOutput();
    expect(await runGaia([], output)).toBe(0);
    expect(output.standardOutput()).toContain('version');
    expect(output.standardOutput()).toContain('help');
  });
});

describe('an unknown verb', () => {
  test('is refused with exit code 1 and the usage on standard error', async () => {
    const output = capturedOutput();
    expect(await runGaia(['constructor'], output)).toBe(1);
    expect(output.standardError()).toContain('does not know the verb "constructor"');
    expect(output.standardOutput()).toBe('');
  });
});
