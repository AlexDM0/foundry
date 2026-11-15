/**
 * The entry point's contract: the version answer other programs parse, the usage text, a refusal for an unknown verb, the bundle a launch
 * from Gaia.app names, and the error and exit code of a launch that does not close normally and of an install that does not finish. One
 * case runs the program itself, since other programs read the version answer from its standard output and exit code.
 */
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import packageManifest from '../package.json' with { type: 'json' };

import {
  appBundlePathAmong,
  appInstallErrorOf,
  exitCodeOf,
  launchErrorOf,
  runGaia,
  type ProgramOutput,
} from './Main.ts';
import { environmentCopy }                           from './services/Environment.ts';
import { createScratchDirectory, removeScratchPath } from './testing/ScratchRoot.ts';

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
    // A home of its own, removed after, since Bun keeps its transpiler cache in the home folder of the program it runs.
    const programHome = createScratchDirectory('version-home');
    try {
      const finished = Bun.spawnSync([process.execPath, join(import.meta.dir, 'Main.ts'), 'version', '--json'], {
        env:    { ...environmentCopy(), HOME: programHome },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(finished.exitCode).toBe(0);
      expect(JSON.parse(finished.stdout.toString())).toEqual({ answerVersion: 1, gaiaVersion: packageManifest.version, installVersion: 1 });
    } finally {
      removeScratchPath(programHome);
    }
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
    expect(output.standardOutput()).toContain('launch');
    expect(output.standardOutput()).toContain('install-app');
    expect(output.standardOutput()).toContain('serve');
    expect(output.standardOutput()).toContain('version');
    expect(output.standardOutput()).toContain('help');
  });
});

describe('a launch that does not close normally', () => {
  test('is a refusal, which exits 1, for no browser and for another program on the port, with the dialog\'s sentence', () => {
    const noBrowser = launchErrorOf({ verdict: 'refused', refusal: 'no-browser' }, 4790);
    const portHeld  = launchErrorOf({ verdict: 'refused', refusal: 'port-held-by-another-program' }, 4790);
    expect([noBrowser.kind, noBrowser.reason, portHeld.kind, portHeld.reason]).toEqual(['refused', 'no-browser', 'refused', 'port-held-by-another-program']);
    expect([exitCodeOf(noBrowser), exitCodeOf(portHeld)]).toEqual([1, 1]);
    expect(noBrowser.message).toBe('Gaia opens in a Google Chrome or Microsoft Edge window, and neither is in an Applications folder.');
    expect(portHeld.message).toBe('Another application answers on port 4790, where Gaia serves. Gaia did not start.');
  });

  test('is unrepaired, which exits 2, for a failure', () => {
    const serverEnded = launchErrorOf({ verdict: 'unrepaired', failure: 'server-ended' }, 4790);
    expect([serverEnded.kind, serverEnded.reason]).toEqual(['unrepaired', 'server-ended']);
    expect(exitCodeOf(serverEnded)).toBe(2);
  });
});

describe('a launch from Gaia.app', () => {
  test('takes the bundle its launch script names, and none from a terminal', () => {
    expect(appBundlePathAmong(['--app-bundle', '/Users/example/Applications/Gaia.app'])).toBe('/Users/example/Applications/Gaia.app');
    expect(appBundlePathAmong([])).toBeNull();
  });

  test('is refused when the flag names no bundle', () => {
    expect(() => appBundlePathAmong(['--app-bundle'])).toThrow('--app-bundle names no app bundle.');
  });

  test('from a bundle installed for another install version is a refusal, which exits 1, naming the way to install it again', () => {
    const refusal = launchErrorOf({ verdict: 'refused', refusal: 'app-bundle-from-another-version' }, 4790);
    expect([refusal.kind, refusal.reason, exitCodeOf(refusal)]).toEqual(['refused', 'app-bundle-from-another-version', 1]);
    expect(refusal.message).toBe('Gaia.app was installed for another version of Gaia. Run "gaia install-app" again to install it for this one.');
  });
});

describe('an install that does not finish', () => {
  test('is a refusal, which exits 1, beside another application of the same name', () => {
    const refusal = appInstallErrorOf({ verdict: 'refused', refusal: 'another-application-in-place', appBundlePath: '/Users/example/Applications/Gaia.app' });
    expect([refusal.kind, refusal.reason, exitCodeOf(refusal)]).toEqual(['refused', 'another-application-in-place', 1]);
  });

  test('is unrepaired, which exits 2, when a step fails, and says what failed', () => {
    const failure = appInstallErrorOf({
      verdict:       'unrepaired',
      failure:       'compile-failed',
      appBundlePath: '/Users/example/Applications/Gaia.app',
      detail:        '/usr/bin/clang exited 1: launch.c:1:25: error: use of undeclared identifier',
    });
    expect([failure.kind, failure.reason, exitCodeOf(failure)]).toEqual(['unrepaired', 'compile-failed', 2]);
    expect(failure.message).toBe('The launcher of Gaia.app did not compile, so nothing is installed. /usr/bin/clang exited 1: launch.c:1:25: error: use of undeclared identifier');
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
