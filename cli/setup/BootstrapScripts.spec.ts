/**
 * The two bootstrap scripts run before Bun exists, so they cannot share code with `setup.ts`; they hold only the Bun check, the offer of
 * Bun's own installer and the hand-off, and every setup step stays in `setup.ts`. The Windows script must run with neither bash nor
 * administrator rights, and `bun run setup` must name no shell. Each refusal is planted in memory so the scan is seen failing.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

const CHECKOUT_ROOT = join(import.meta.dir, '..', '..');

/** Words that only a setup step uses: a bootstrap naming one has taken over logic `setup.ts` holds. */
const SETUP_STEP_WORDS = ['core.hooksPath', 'bun link', 'bun install', '.claude', 'LaunchAgents', 'SetEnvironmentVariable', '.zshrc', 'launcher.ts'];

function codeLinesOf(scriptText: string): string[] {
  return scriptText.split('\n').filter((line) => !line.trimStart().startsWith('#'));
}

function bootstrapFindingsOf(scriptText: string): string[] {
  const code = codeLinesOf(scriptText).join('\n');
  const findings = SETUP_STEP_WORDS.filter((word) => code.includes(word)).map((word) => `names the setup step word ${word}`);
  if (!/setup\.ts/.test(code)) findings.push('hands nothing to setup.ts');
  return findings;
}

function windowsBootstrapFindingsOf(scriptText: string): string[] {
  const findings = bootstrapFindingsOf(scriptText);
  if (/bash/i.test(scriptText)) findings.push('names bash');
  if (/RunAsAdministrator/i.test(scriptText)) findings.push('requires administrator rights');
  if (!scriptText.includes('bun.sh/install.ps1')) findings.push('offers no Bun installer');
  return findings;
}

const WINDOWS_BOOTSTRAP = readFileSync(join(CHECKOUT_ROOT, 'setup.ps1'), 'utf8');
const POSIX_BOOTSTRAP   = readFileSync(join(CHECKOUT_ROOT, 'setup.sh'), 'utf8');

describe('the bootstrap scripts', () => {
  test('setup.ps1 checks for Bun, offers its installer and hands over to setup.ts, naming neither bash nor administrator rights', () => {
    expect(windowsBootstrapFindingsOf(WINDOWS_BOOTSTRAP)).toEqual([]);
  });

  test('setup.sh checks for Bun, offers its installer and hands over to setup.ts, holding no setup step', () => {
    expect(bootstrapFindingsOf(POSIX_BOOTSTRAP)).toEqual([]);
    expect(POSIX_BOOTSTRAP).toContain('https://bun.sh/install');
  });

  test('bun run setup starts setup.ts and names no shell', () => {
    const packageDocument = JSON.parse(readFileSync(join(CHECKOUT_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(packageDocument.scripts['setup']).toBe('bun setup.ts');
  });

  test('each refusal fires on a planted script', () => {
    expect(windowsBootstrapFindingsOf('#Requires -RunAsAdministrator\nbash setup.sh\n')).toEqual([
      'hands nothing to setup.ts', 'names bash', 'requires administrator rights', 'offers no Bun installer',
    ]);
    expect(bootstrapFindingsOf('git config core.hooksPath .githooks\nbun setup.ts\n')).toEqual(['names the setup step word core.hooksPath']);
    expect(bootstrapFindingsOf('# core.hooksPath is set by setup.ts\nbun setup.ts\n')).toEqual([]);
  });
});
