/**
 * `setup.ts`, started through the Bun running this suite as the bootstrap scripts start it, so no case needs bash. `--instruct-only`
 * promises to change nothing, and its `bun link` would repoint the machine-wide command at whichever checkout ran it. The entry runs with a
 * scratch `HOME` and a fake `bun` first on a minimal `PATH` that records every call, so neither the real `bun link` nor the real home is
 * ever reached. The cases hold that no install, link or build call happens and each is announced instead, that the home is unchanged, that
 * a Bun below `.bun-version` is refused, and that the login item is written only into the scratch home. The steps' writes are held
 * in-process by `cli/setup/Setup.spec.ts`, since here they would reach this checkout's git config.
 */
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { delimiter, join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { ToolRuntimeUtil }                                         from '../src/shared/ToolRuntimeUtil.ts';
import { PRODUCT_NAMES }                                           from '../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                 from '../src/testing/ChildProcessCaseTimeout.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { pinnedBunVersionOf }                                      from './setup/BunStep.ts';

const CHECKOUT_DIRECTORY = join(import.meta.dir, '..');
const SETUP_ENTRY_PATH   = join(CHECKOUT_DIRECTORY, 'setup.ts');
const SYSTEM_TOOL_PATH   = ['/usr/bin', '/bin'];
const EXAMPLE_RC_CONTENT = '# Alex Example\'s shell configuration\n';
const OLD_BUN_VERSION    = '1.0.0';

let scratchDirectory = '';
let scratchHomeDirectory = '';
let fakeBunDirectory = '';
let bunCallLogPath = '';

interface FinishedSetupRun {
  readonly exitCode: number;
  readonly output:   string;
}

/** A `bun` that is a script for the real Bun, so faking it needs no shell: it logs its arguments and prints the version it was given. */
function plantFakeBun(version: string): void {
  const fakeBunPath = join(fakeBunDirectory, 'bun');
  writeFileSync(fakeBunPath, [
    `#!${process.execPath}`,
    `require('node:fs').appendFileSync(${JSON.stringify(bunCallLogPath)}, process.argv.slice(2).join(' ') + '\\n');`,
    `if (process.argv[2] === '--version') console.log(${JSON.stringify(version)});`,
    '',
  ].join('\n'));
  chmodSync(fakeBunPath, 0o755);
}

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('setup-script');
  scratchHomeDirectory = join(scratchDirectory, 'home');
  fakeBunDirectory = join(scratchDirectory, 'fake-bin');
  bunCallLogPath = join(scratchDirectory, 'bun-calls.log');
  mkdirSync(scratchHomeDirectory);
  mkdirSync(fakeBunDirectory);
  writeFileSync(join(scratchHomeDirectory, '.zshrc'), EXAMPLE_RC_CONTENT);
  writeFileSync(bunCallLogPath, '');
  plantFakeBun(pinnedBunVersionOf(CHECKOUT_DIRECTORY));
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function runSetupEntry(setupArguments: readonly string[]): FinishedSetupRun {
  const finished = Bun.spawnSync([process.execPath, SETUP_ENTRY_PATH, ...setupArguments], {
    cwd: scratchHomeDirectory,
    // The real Bun runs setup.ts here, and its transpiler cache would otherwise land in the scratch home.
    env: {
      HOME: scratchHomeDirectory, PATH: [fakeBunDirectory, ...SYSTEM_TOOL_PATH].join(delimiter), SHELL: '/bin/zsh', BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    },
    stdin:  'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: finished.exitCode, output: `${finished.stdout.toString()}\n${finished.stderr.toString()}` };
}

/** Every entry under the home with its kind and, for a file, what it holds, so any write the run made shows as a difference. */
function snapshotOf(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' }).sort().map((relativePath) => {
    const entryPath = join(directory, relativePath);
    try {
      return `${relativePath}: ${readFileSync(entryPath, 'utf8')}`;
    } catch {
      return `${relativePath}/`;
    }
  });
}

function recordedBunCalls(): readonly string[] {
  return readFileSync(bunCallLogPath, 'utf8').split('\n').filter((line) => line !== '');
}

test('setup.ts --instruct-only runs no bun install, link or build, and announces each, naming the checkout', () => {
  const { exitCode, output } = runSetupEntry(['--instruct-only']);
  expect(exitCode, output).toBe(0);
  expect(recordedBunCalls()).toEqual(['--version']);
  expect(output).toContain(`Would run bun install in ${CHECKOUT_DIRECTORY}`);
  expect(output).toContain(`Would run bun link in ${CHECKOUT_DIRECTORY}`);
  expect(output).toContain(`Would compile ${join(CHECKOUT_DIRECTORY, 'launcher.ts')} as the installed command`);
  expect(output).toContain(`cd <a repository> && ${PRODUCT_NAMES.PROGRAM} init`);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('setup.ts --instruct-only leaves the home unchanged: no skill link, no rc edit', () => {
  const homeBefore = snapshotOf(scratchHomeDirectory);
  const { exitCode, output } = runSetupEntry(['--instruct-only']);
  expect(exitCode, output).toBe(0);
  expect(snapshotOf(scratchHomeDirectory)).toEqual(homeBefore);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('setup.ts refuses a Bun below .bun-version and installs nothing', () => {
  plantFakeBun(OLD_BUN_VERSION);
  const { exitCode, output } = runSetupEntry([]);
  expect(exitCode, output).toBe(1);
  expect(output).toContain(`bun ${OLD_BUN_VERSION} is below ${pinnedBunVersionOf(CHECKOUT_DIRECTORY)}`);
  expect(recordedBunCalls()).toEqual(['--version']);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('setup.ts refuses an unknown option with the usage line', () => {
  const { exitCode, output } = runSetupEntry(['--example']);
  expect(exitCode).toBe(1);
  expect(output).toContain('Unknown option: --example');
  expect(recordedBunCalls()).toEqual([]);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

function launchAgentPathOf(label: string): string {
  return join(scratchHomeDirectory, 'Library', 'LaunchAgents', `${label}.plist`);
}

function runLoginHephaestus(loginArguments: readonly string[]): FinishedSetupRun {
  return runSetupEntry(['--login-item', ...loginArguments]);
}

test('setup.ts --login-item writes a LaunchAgent labelled LOGIN_ITEM_LABEL running start --started-by login-item at load, every path absolute', () => {
  const repositoryDirectory = join(scratchDirectory, 'tracked-repository');
  mkdirSync(repositoryDirectory);
  const { exitCode, output } = runLoginHephaestus([repositoryDirectory]);
  expect(exitCode, output).toBe(0);

  const plist = readFileSync(launchAgentPathOf(PRODUCT_NAMES.LOGIN_ITEM_LABEL), 'utf8');
  expect(plist).toContain(`<key>Label</key>\n  <string>${PRODUCT_NAMES.LOGIN_ITEM_LABEL}</string>`);
  const programArguments = [
    join(fakeBunDirectory, 'bun'),
    ...ToolRuntimeUtil.isolatingArgumentsFor(CHECKOUT_DIRECTORY),
    join(CHECKOUT_DIRECTORY, 'agent-progress.ts'),
    'start',
    '--started-by',
    'login-item',
  ];
  expect(plist).toContain(programArguments.map((argument) => `<string>${argument}</string>`).join('\n    '));
  expect(plist).toContain(`<key>WorkingDirectory</key>\n  <string>${repositoryDirectory}</string>`);
  expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
  expect(output).toContain(`launchctl bootstrap gui/$(id -u) "${launchAgentPathOf(PRODUCT_NAMES.LOGIN_ITEM_LABEL)}"`);
  expect(recordedBunCalls()).toEqual([]);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('setup.ts --login-item refuses a second repository under the same label, takes one under its own, and --instruct-only writes nothing', () => {
  const firstRepository = join(scratchDirectory, 'first-repository');
  const secondRepository = join(scratchDirectory, 'second-repository');
  mkdirSync(firstRepository);
  mkdirSync(secondRepository);
  const homeBefore = snapshotOf(scratchHomeDirectory);
  expect(runLoginHephaestus([firstRepository, '--instruct-only']).exitCode).toBe(0);
  expect(snapshotOf(scratchHomeDirectory)).toEqual(homeBefore);

  expect(runLoginHephaestus([firstRepository]).exitCode).toBe(0);
  const refused = runLoginHephaestus([secondRepository]);
  expect(refused.exitCode).toBe(1);
  expect(refused.output).toContain('pass --label');
  expect(readFileSync(launchAgentPathOf(PRODUCT_NAMES.LOGIN_ITEM_LABEL), 'utf8')).toContain(firstRepository);
  expect(runLoginHephaestus([secondRepository, '--label', 'com.example-agency.hephaestus']).exitCode).toBe(0);
  expect(readFileSync(launchAgentPathOf('com.example-agency.hephaestus'), 'utf8')).toContain(secondRepository);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
