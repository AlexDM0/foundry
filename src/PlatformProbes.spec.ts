/**
 * What `.platform-probes/` holds as files: every unknown the ticket named and every numbered probe has a script, no script reaches the typed
 * programs, and the folder states how it is run. Running the scripts is held by `src/PlatformProbes.integration.spec.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { describe, expect, test } from 'bun:test';

const PROBES_FOLDER = join(import.meta.dir, '..', '.platform-probes');

const OPERATING_SYSTEM_UNKNOWNS = [
  'absolute-git-dir',
  'boot-identity',
  'bun-build-output-paths',
  'busybox-ps-lstart',
  'bwrap-user-namespaces',
  'detached-console-programs',
  'exit-code-extremes',
  'fast-forward-held-file',
  'ffi-process-times',
  'ffi-toolhelp-snapshot',
  'glob-separators',
  'held-file-write-loop',
  'job-object-nesting',
  'mount-point-residue',
  'negative-pid-kill',
  'no-orphans-shim',
  'path-variable-spelling',
  'pipe-busy-error',
  'pipe-half-close-latency',
  'pipe-listen-connect',
  'pipe-release-after-crash',
  'pipe-second-user',
  'realpath-short-path',
  'remove-read-only-git-objects',
  'rename-onto-held-file',
  'sandbox-exec-nested',
  'signal-code-after-kill',
  'sigterm-handler',
  'spawn-without-path',
  'symlink-permission',
  'task-scheduler-logon',
  'watch-later-folders',
  'watch-user-limit',
  'worktree-remove-held-cwd',
];

const HOST_UNKNOWNS = [
  'host-common-git-writable', 'host-deny-rule-form', 'host-fail-if-unavailable', 'host-npm-global-resolution', 'host-path-forms', 'host-stream-fixture',
];

const NUMBERED_PROBES = [
  'p01-live-answer',
  'p02-claude-md-walk',
  'p03-disable-slash-commands',
  'p04-network-guard',
  'p05-anchored-rules',
  'p06-resume',
  'p07-process-groups',
  'p08-mid-turn-line',
  'p09-agents-and-memory',
  'p10-rate-limit-events',
  'p11-product-owner-session',
  'p13-settings-local',
  'p14-signing-and-ref-denies',
  'p15-gates-under-sandbox',
  'p16-setting-sources',
  'p17-block-outside-reads',
  'p18-unreadable-input-line',
  'p19-scenarios-against-a-stand-in',
].map((probeName) => `claude-${probeName}`);

function probeScriptNames(): string[] {
  return readdirSync(PROBES_FOLDER).filter((fileName) => fileName.endsWith('.js') && fileName !== 'run-all.js').map((fileName) => fileName.slice(0, -'.js'.length));
}

function everyProbeSource(): { fileName: string; source: string }[] {
  const supportFolder = join(PROBES_FOLDER, 'support');
  return [
    ...readdirSync(PROBES_FOLDER).filter((fileName) => fileName.endsWith('.js')).map((fileName) => join(PROBES_FOLDER, fileName)),
    ...readdirSync(supportFolder).map((fileName) => join(supportFolder, fileName)),
  ].map((path) => ({ fileName: path, source: readFileSync(path, 'utf8') }));
}

describe('the platform probes folder', () => {
  test('every unknown of the ticket and every numbered probe has a script', () => {
    const scriptNames = probeScriptNames();
    expect(scriptNames.sort()).toEqual([...OPERATING_SYSTEM_UNKNOWNS.map((unknown) => `os-${unknown}`), ...HOST_UNKNOWNS, ...NUMBERED_PROBES].sort());
  });

  test('no script imports from the typed programs', () => {
    const typedProgramImport = /(?:from |import\(|require\()\s*['"`][^'"`]*(?:\/src\/|\/cli\/|\/bridge\/|\.ts['"`])/u;
    const sources = everyProbeSource();
    expect(sources.length).toBeGreaterThan(NUMBERED_PROBES.length);
    for (const { source } of sources) expect(source).not.toMatch(typedProgramImport);
  });

  test('the folder states the command, that a run gates nothing, and where results go', () => {
    const readme = readFileSync(join(PROBES_FOLDER, 'README.md'), 'utf8');
    expect(readme).toContain('bun .platform-probes/run-all.js');
    expect(readme).toContain('gates no ticket');
    expect(readme).toContain('per-OS column of `docs/development/overseer-claude-probe.md`');
  });
});
