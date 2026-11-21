/**
 * What `AGENT_PROGRESS_ROOT`, `SHELL`, an agent variable by its name and the test settings mean at each value they come with, and where a
 * prepended `PATH` folder lands.
 * The value cases run in a child process so that the one assignment below stays the only in-process write to the environment a spec
 * makes, and that assignment is what shows the getter reads afresh rather than capturing at import.
 */
import { join }         from 'node:path';
import { expect, test } from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../testing/ChildProcessCaseTimeout.ts';
import { jsonPrintedByAChildProcess }              from '../testing/JsonPrintedByAChildProcess.ts';
import {
  agentProgressRootOverride,
  EVERY_TOOL_REQUIRED_VARIABLE,
  HEPHAESTUS_POLL_INTERVAL_VARIABLE,
  VERSIONS_ANSWER_VARIABLE,
} from './Environment.ts';
import { PRODUCT_NAMES }          from './constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE } from './constants/RootOverrideVariable.ts';

const ENVIRONMENT_MODULE_PATH = join(import.meta.dir, 'Environment.ts');

test('both variables the product reads are named from its environment prefix', () => {
  expect(ROOT_OVERRIDE_VARIABLE).toBe(`${PRODUCT_NAMES.ENVIRONMENT_PREFIX}ROOT`);
  expect(EVERY_TOOL_REQUIRED_VARIABLE).toBe(`${PRODUCT_NAMES.ENVIRONMENT_PREFIX}REQUIRE_EVERY_TOOL`);
});

/** The child inherits nothing: its environment is exactly `childEnvironment`, so "unset" means unset. */
function overrideSeenByAChildProcess(childEnvironment: Record<string, string>): string | null {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    'console.log(JSON.stringify(loaded.agentProgressRootOverride() ?? null));',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source) as string | null;
}

function shellSeenByAChildProcess(childEnvironment: Record<string, string>): string | null {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    'console.log(JSON.stringify(loaded.userShell() ?? null));',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source) as string | null;
}

test('the user\'s shell is SHELL verbatim, and an unset, empty or whitespace-only one is none', () => {
  expect(shellSeenByAChildProcess({ SHELL: '/bin/example shell' })).toBe('/bin/example shell');
  expect(shellSeenByAChildProcess({})).toBeNull();
  for (const clearedValue of ['', '  ']) expect(shellSeenByAChildProcess({ SHELL: clearedValue }), JSON.stringify(clearedValue)).toBeNull();
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

const PLANTED_AGENT_VARIABLE = 'EXAMPLE_AGENT_VARIABLE';

function agentVariableSeenByAChildProcess(childEnvironment: Record<string, string>): { value: string | null; isSet: boolean } {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    `const name = ${JSON.stringify(PLANTED_AGENT_VARIABLE)};`,
    'console.log(JSON.stringify({ value: loaded.agentVariableOf(name) ?? null, isSet: loaded.agentVariableIsSet(name) }));',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source) as { value: string | null; isSet: boolean };
}

test('an agent variable is read verbatim by the name it is given, and is unset when absent, empty or whitespace-only', () => {
  expect(agentVariableSeenByAChildProcess({ [PLANTED_AGENT_VARIABLE]: '/srv/example agent' })).toEqual({ value: '/srv/example agent', isSet: true });
  expect(agentVariableSeenByAChildProcess({})).toEqual({ value: null, isSet: false });
  expect(agentVariableSeenByAChildProcess({ EXAMPLE_OTHER_VARIABLE: 'example-planted-value' })).toEqual({ value: null, isSet: false });
  for (const clearedValue of ['', '  ']) {
    expect(agentVariableSeenByAChildProcess({ [PLANTED_AGENT_VARIABLE]: clearedValue }), JSON.stringify(clearedValue)).toEqual({ value: null, isSet: false });
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

function hephaestusPollIntervalSeenByAChildProcess(childEnvironment: Record<string, string>): number | string | null {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    'try { console.log(JSON.stringify(loaded.hephaestusPollIntervalOverride() ?? null)); }',
    'catch (error) { console.log(JSON.stringify(error.name)); }',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source) as number | string | null;
}

test('the Hephaestus poll interval is a positive whole number of milliseconds, unset or blank is none, and any other value is refused', () => {
  expect(HEPHAESTUS_POLL_INTERVAL_VARIABLE).toBe(`${PRODUCT_NAMES.ENVIRONMENT_PREFIX}HEPHAESTUS_POLL_INTERVAL_MILLISECONDS`);
  expect(hephaestusPollIntervalSeenByAChildProcess({ [HEPHAESTUS_POLL_INTERVAL_VARIABLE]: '25' })).toBe(25);
  expect(hephaestusPollIntervalSeenByAChildProcess({ [HEPHAESTUS_POLL_INTERVAL_VARIABLE]: ' 1 ' })).toBe(1);
  expect(hephaestusPollIntervalSeenByAChildProcess({})).toBeNull();
  for (const clearedValue of ['', '  ']) {
    expect(hephaestusPollIntervalSeenByAChildProcess({ [HEPHAESTUS_POLL_INTERVAL_VARIABLE]: clearedValue }), JSON.stringify(clearedValue)).toBeNull();
  }
  for (const refusedValue of ['0', '-5', '2.5', '1e3', '25ms', '025', 'fast']) {
    expect(hephaestusPollIntervalSeenByAChildProcess({ [HEPHAESTUS_POLL_INTERVAL_VARIABLE]: refusedValue }), refusedValue).toBe('OperationRefusal');
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

function versionsAnswerSeenByAChildProcess(childEnvironment: Record<string, string>): unknown {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    'try { console.log(JSON.stringify(loaded.versionsAnswerOverride() ?? null)); }',
    'catch (error) { console.log(JSON.stringify(error.name)); }',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source);
}

test('the versions answer is the current and the minimum supported version, unset or blank is none, and any other value is refused', () => {
  expect(VERSIONS_ANSWER_VARIABLE).toBe(`${PRODUCT_NAMES.ENVIRONMENT_PREFIX}VERSIONS_ANSWER`);
  expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: '1.3/1.0' })).toEqual({ current: { major: 1, minor: 3 }, minimumSupported: { major: 1, minor: 0 } });
  expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: ' 2.1/2.1 ' })).toEqual({ current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 1 } });
  expect(versionsAnswerSeenByAChildProcess({})).toBeNull();
  for (const clearedValue of ['', '  ']) {
    expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: clearedValue }), JSON.stringify(clearedValue)).toBeNull();
  }
  for (const refusedValue of ['1.3', '1.3/', '1.0/1.3', '1.3/1.0/0.0', '1.03/1.0', 'v1.3/1.0', '1.3 / 1.0', 'newest']) {
    expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: refusedValue }), refusedValue).toBe('OperationRefusal');
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('the child-process harness can tell the two answers apart, so a case that finds nothing means something', () => {
  expect(overrideSeenByAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: '/example/repository' })).toBe('/example/repository');
  expect(overrideSeenByAChildProcess({})).toBeNull();
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a set variable is the override, verbatim', () => {
  expect(overrideSeenByAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: '/example/repository' })).toBe('/example/repository');
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('an unset variable is no override', () => {
  expect(overrideSeenByAChildProcess({})).toBeNull();
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('an empty or whitespace-only value reads as unset rather than as the empty root', () => {
  for (const clearedValue of ['', '   ', '\t']) {
    expect(overrideSeenByAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: clearedValue }), JSON.stringify(clearedValue)).toBeNull();
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a real path is handed back untouched, spaces and all', () => {
  const pathWithSpaces = '/Users/alex.example/development/example agency';
  expect(overrideSeenByAChildProcess({ [ROOT_OVERRIDE_VARIABLE]: pathWithSpaces })).toBe(pathWithSpaces);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a value set after this module was imported is still seen, and so is clearing it again', () => {
  const previousValue = process.env[ROOT_OVERRIDE_VARIABLE];
  try {
    process.env[ROOT_OVERRIDE_VARIABLE] = '/example/repository/redirected-in-process';
    expect(agentProgressRootOverride()).toBe('/example/repository/redirected-in-process');
    delete process.env[ROOT_OVERRIDE_VARIABLE];
    expect(agentProgressRootOverride()).toBeUndefined();
  } finally {
    // Restored, not cleared: Bun runs every spec file in one process, and the machine may legitimately have set it.
    if (previousValue === undefined) delete process.env[ROOT_OVERRIDE_VARIABLE];
    else process.env[ROOT_OVERRIDE_VARIABLE] = previousValue;
  }
});

function everyToolRequirementSeenByAChildProcess(childEnvironment: Record<string, string>): boolean {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    'console.log(JSON.stringify(loaded.everyToolIsRequired()));',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source) as boolean;
}

test('an unset, empty, whitespace or 0 EVERY_TOOL_REQUIRED_VARIABLE lets a missing tool skip', () => {
  expect(everyToolRequirementSeenByAChildProcess({})).toBe(false);
  for (const relaxedValue of ['', '  ', '0', ' 0 ']) {
    expect(everyToolRequirementSeenByAChildProcess({ [EVERY_TOOL_REQUIRED_VARIABLE]: relaxedValue }), JSON.stringify(relaxedValue)).toBe(false);
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('any other EVERY_TOOL_REQUIRED_VARIABLE value requires every tool, so a true or yes is never a silent skip', () => {
  for (const requiringValue of ['1', 'true', 'yes']) {
    expect(everyToolRequirementSeenByAChildProcess({ [EVERY_TOOL_REQUIRED_VARIABLE]: requiringValue }), requiringValue).toBe(true);
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

function searchPathAfterPrependingIn(childEnvironment: Record<string, string>, folder: string): string[] {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    `loaded.prependToExecutableSearchPath(${JSON.stringify(folder)});`,
    'console.log(JSON.stringify(loaded.executableSearchPath()));',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source) as string[];
}

test('a folder prepended to the executable search path is searched first, before every folder already on it', () => {
  expect(searchPathAfterPrependingIn({ PATH: '/example/bin:/example/usr/bin' }, '/example/trap')).toEqual(['/example/trap', '/example/bin', '/example/usr/bin']);
  expect(searchPathAfterPrependingIn({}, '/example/trap')).toEqual(['/example/trap']);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('the environment copy holds every variable verbatim, and nothing else', () => {
  const source = [
    `const loaded = await import(${JSON.stringify(ENVIRONMENT_MODULE_PATH)});`,
    'console.log(JSON.stringify(loaded.environmentCopy()));',
  ].join('\n');
  const copy = jsonPrintedByAChildProcess({ EXAMPLE_VARIABLE: 'Example Agency', EMPTY_VARIABLE: '' }, source) as Record<string, string>;
  expect(copy['EXAMPLE_VARIABLE']).toBe('Example Agency');
  expect(copy['EMPTY_VARIABLE']).toBe('');
  expect(Object.keys(copy).filter((variable) => variable.startsWith('EXAMPLE_') || variable.startsWith('EMPTY_')).sort()).toEqual(['EMPTY_VARIABLE', 'EXAMPLE_VARIABLE']);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('the override is exposed as a function, which is what lets it be redirected at all', () => {
  expect(typeof agentProgressRootOverride).toBe('function');
});
