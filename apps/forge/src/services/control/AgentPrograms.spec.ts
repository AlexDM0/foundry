/**
 * The program a forge's agent runs, and its one run before a choice is kept, on the answers the real program check recorded for planted
 * programs. What matters: a launch never reads a search path, so no choice, another vendor or a machine naming no program refuses it;
 * a program is kept as its path spells it and refused where it lies; a run that does not start, fails, outlives the bound or answers as
 * another program does not run; and the run searches only the program's own folder and the system's.
 */
import { describe, expect, test } from 'bun:test';

import { POSIX_LAUNCH_ENVIRONMENT }                         from '../../lib/agent-launch/PosixLaunchEnvironment.ts';
import type { ProgramFileKind }                             from '../../lib/executable-resolver/ExecutableLookup.ts';
import { createPosixExecutableResolver }                    from '../../lib/executable-resolver/PosixExecutableResolver.ts';
import { createWindowsExecutableResolver }                  from '../../lib/executable-resolver/WindowsExecutableResolver.ts';
import type { ProgramCheckRequest }                         from '../../lib/program-check/ProgramCheck.ts';
import { fakeAgentAdapter }                                 from '../../testing/FakeAgentAdapter.ts';
import { PROGRAM_CHECK_RECORDING, recordedProgramCheckRun } from '../../testing/RecordedProgramChecks.ts';
import { type AgentProgramCheckContext, AgentPrograms }     from './AgentPrograms.ts';

const PROGRAM = '/opt/example/bin/agent';
const REPOSITORY = '/home/example/repository';

const PROGRAM_KINDS: Readonly<Record<string, ProgramFileKind>> = {
  [PROGRAM]:                    'program',
  [`${REPOSITORY}/bin/agent`]:  'program',
  '/opt/example/bin/notes.txt': 'not-executable',
};

const PRIMITIVES = {
  lookUp:        () => null,
  realPathOf:    (path: string) => path,
  programKindOf: (path: string): ProgramFileKind => (Object.hasOwn(PROGRAM_KINDS, path) ? PROGRAM_KINDS[path] ?? 'missing' : 'missing'),
};

const RESOLVER = createPosixExecutableResolver(PRIMITIVES);
const ADAPTER = fakeAgentAdapter();
const AGENT = { vendor: ADAPTER.vendor, program: { follows: 'machine' } } as const;

function sourceOf(overrides: Partial<Parameters<typeof AgentPrograms.resolutionOf>[0]>): Parameters<typeof AgentPrograms.resolutionOf>[0] {
  return {
    agent: AGENT, adapterVendor: ADAPTER.vendor, machineProgramPath: PROGRAM, resolver: RESOLVER, forbiddenRoots: [REPOSITORY], ...overrides
  };
}

describe('resolutionOf', () => {
  test('finds the machine\'s program of a choice that follows it, and a pinned one, each as its path spells it', () => {
    expect(AgentPrograms.resolutionOf(sourceOf({}))).toEqual({ verdict: 'found', programPath: PROGRAM });
    expect(AgentPrograms.resolutionOf(sourceOf({ agent: { vendor: ADAPTER.vendor, program: { pinned: PROGRAM } }, machineProgramPath: null })))
      .toEqual({ verdict: 'found', programPath: PROGRAM });
  });

  test('refuses no choice, another vendor and a machine that names no program, each naming the program it would start', () => {
    expect(AgentPrograms.resolutionOf(sourceOf({ agent: null }))).toEqual({ verdict: 'not-launched', notLaunched: { cause: 'no-agent-chosen', programPath: null } });
    expect(AgentPrograms.resolutionOf(sourceOf({ adapterVendor: 'other-agent' })))
      .toEqual({ verdict: 'not-launched', notLaunched: { cause: 'other-vendor', programPath: PROGRAM } });
    expect(AgentPrograms.resolutionOf(sourceOf({ machineProgramPath: null })))
      .toEqual({ verdict: 'not-launched', notLaunched: { cause: 'no-machine-program', programPath: null } });
  });

  test('refuses a program that is not there, is no program, lies in the repository or is a batch file on Windows', () => {
    const pinned = (path: string): Parameters<typeof AgentPrograms.resolutionOf>[0] => sourceOf({ agent: { vendor: ADAPTER.vendor, program: { pinned: path } } });
    expect(AgentPrograms.resolutionOf(pinned('/opt/example/bin/gone'))).toMatchObject({ notLaunched: { cause: 'not-there' } });
    expect(AgentPrograms.resolutionOf(pinned('/opt/example/bin/notes.txt'))).toMatchObject({ notLaunched: { cause: 'not-executable' } });
    expect(AgentPrograms.resolutionOf(pinned(`${REPOSITORY}/bin/agent`))).toMatchObject({ notLaunched: { cause: 'inside-forbidden-root' } });
    const shim = 'C:\\Users\\example\\AppData\\Roaming\\npm\\agent.cmd';
    const windowsResolver = createWindowsExecutableResolver({ ...PRIMITIVES, programKindOf: () => 'program' });
    expect(AgentPrograms.resolutionOf({ ...pinned(shim), resolver: windowsResolver, forbiddenRoots: [] }))
      .toEqual({ verdict: 'not-launched', notLaunched: { cause: 'batch-target', programPath: shim } });
  });
});

describe('checkOf', () => {
  const requests: ProgramCheckRequest[] = [];

  function contextOf(situation: keyof typeof PROGRAM_CHECK_RECORDING.EXPECTED_KIND_OF, adapter = ADAPTER): AgentProgramCheckContext {
    const recorded = recordedProgramCheckRun({ [PROGRAM]: situation });
    return {
      adapter,
      resolver:             RESOLVER,
      forbiddenRoots:       [REPOSITORY],
      launchEnvironment:    POSIX_LAUNCH_ENVIRONMENT,
      inheritedEnvironment: { HOME: '/home/example', PATH: '/home/example/inherited/bin', SECRET: 'left behind' },
      run:                  (request) => {
        requests.push(request);
        return recorded(request);
      },
      timeoutMilliseconds: 1000,
    };
  }

  test('a program that answers its version runs, run with only its own folder and the system\'s on the search path', async () => {
    expect(await AgentPrograms.checkOf(PROGRAM, contextOf(PROGRAM_CHECK_RECORDING.ANSWERS))).toEqual({ verdict: 'runs', programPath: PROGRAM, version: '1.2.3 (Example Agent)' });
    const [request] = requests.splice(0);
    expect(request?.arguments).toEqual(ADAPTER.versionArguments);
    expect(request?.environment).toEqual({ HOME: '/home/example', PATH: '/opt/example/bin:/usr/bin:/bin:/usr/sbin:/sbin' });
  });

  test('a failing exit, the bound outlived, a start that failed and an answer of another program do not run', async () => {
    expect(await AgentPrograms.checkOf(PROGRAM, contextOf(PROGRAM_CHECK_RECORDING.FAILS))).toMatchObject({ verdict: 'does-not-run', cause: 'failed' });
    expect(await AgentPrograms.checkOf(PROGRAM, contextOf(PROGRAM_CHECK_RECORDING.HANGS))).toMatchObject({ verdict: 'does-not-run', cause: 'timed-out' });
    expect(await AgentPrograms.checkOf(PROGRAM, contextOf(PROGRAM_CHECK_RECORDING.NOT_A_PROGRAM))).toMatchObject({ verdict: 'does-not-run', cause: 'did-not-start' });
    const otherAgent = { ...ADAPTER, versionOf: () => null };
    expect(await AgentPrograms.checkOf(PROGRAM, contextOf(PROGRAM_CHECK_RECORDING.ANSWERS, otherAgent))).toMatchObject({ verdict: 'does-not-run', cause: 'not-this-agent' });
    requests.splice(0);
  });

  test('a program refused where it lies is never run', async () => {
    expect(await AgentPrograms.checkOf('/opt/example/bin/gone', contextOf(PROGRAM_CHECK_RECORDING.ANSWERS)))
      .toEqual({ verdict: 'does-not-run', programPath: '/opt/example/bin/gone', cause: 'not-there' });
    expect(requests).toEqual([]);
  });

  test('a choice is checked through the program it names now: another vendor, or a machine naming none, never runs', async () => {
    const context = contextOf(PROGRAM_CHECK_RECORDING.ANSWERS);
    expect(await AgentPrograms.choiceCheckOf(AGENT, PROGRAM, context)).toMatchObject({ verdict: 'runs' });
    expect(await AgentPrograms.choiceCheckOf(AGENT, null, context)).toEqual({ verdict: 'does-not-run', programPath: null, cause: 'no-machine-program' });
    expect(await AgentPrograms.choiceCheckOf({ vendor: 'other-agent', program: { pinned: PROGRAM } }, null, context)).toMatchObject({ cause: 'other-vendor' });
    requests.splice(0);
  });
});

describe('placesOf', () => {
  test('reports each place the vendor\'s installers use, found or not, as the path spells it', () => {
    const adapter = { ...ADAPTER, programPlacesOf: () => [PROGRAM, '/opt/example/bin/gone'] };
    expect(AgentPrograms.placesOf(adapter, '/home/example', RESOLVER)).toEqual([{ path: PROGRAM, found: true }, { path: '/opt/example/bin/gone', found: false }]);
  });
});
