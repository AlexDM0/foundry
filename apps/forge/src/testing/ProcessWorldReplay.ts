/**
 * Replays a fixed process table through the real program and signal calls, stubbed at `Bun.spawnSync` and `process.kill`, so the table
 * in `src/lib/process-identity/FrozenProcessSupervision.json` holds whatever implementation sits behind those two calls.
 */
import type { ProcessIdentity } from '../lib/process-identity/ProcessIdentity.ts';

export interface ProcessWorld {
  /** The `ps -o lstart=` line per process id; an absent id exits non-zero, as ps does for a process that is gone. */
  readonly startStampsByProcessId: Readonly<Record<string, string>>;
  /** What `sysctl -n` prints; `null` exits non-zero. */
  readonly bootSession:            string | null;
  /** What `ps -A` prints; `null` exits non-zero. */
  readonly processListing:         string | null;
  readonly groupHasMembers:        boolean;
  /** The `code` of the error a signal to a group throws; `null` delivers it. */
  readonly signalErrorCode:        string | null;
}

export interface ProcessWorldReplay<Answer> {
  readonly answer:      Answer;
  readonly programs:    readonly { readonly argv: readonly string[]; readonly environment: unknown }[];
  readonly signalsSent: readonly { readonly target: number; readonly signal: number | string }[];
}

const NO_SUCH_PROCESS_CODE = 'ESRCH';
const SUCCESS_EXIT_CODE    = 0;
const FAILURE_EXIT_CODE    = 1;
const PROCESS_ID_ARGUMENT_INDEX = 4;

function codedError(code: string): Error {
  return Object.assign(new Error(`example ${code}`), { code });
}

function outputInWorld(world: ProcessWorld, argv: readonly string[]): string | null {
  if (argv[0] === '/usr/sbin/sysctl') return world.bootSession;
  if (argv[1] === '-A') return world.processListing;
  return world.startStampsByProcessId[argv[PROCESS_ID_ARGUMENT_INDEX] ?? ''] ?? null;
}

function signalInWorld(world: ProcessWorld, signal: number | string): void {
  if (signal === 0) {
    if (!world.groupHasMembers) throw codedError(NO_SUCH_PROCESS_CODE);
    return;
  }
  if (world.signalErrorCode !== null) throw codedError(world.signalErrorCode);
}

/** Restores both calls before it answers, so a failing replay leaves the runner's own process calls alone. */
export function replayProcessWorld<Answer>(world: ProcessWorld, run: () => Answer): ProcessWorldReplay<Answer> {
  const programs: { argv: readonly string[]; environment: unknown }[] = [];
  const signalsSent: { target: number; signal: number | string }[] = [];
  const realSpawnSync = Bun.spawnSync;
  const realKill      = process.kill;
  const stubbedRuntime = Bun as unknown as { spawnSync: (options: { cmd: string[]; env: unknown }) => unknown };
  stubbedRuntime.spawnSync = ({ cmd, env }) => {
    programs.push({ argv: cmd, environment: env });
    const output = outputInWorld(world, cmd);
    return { exitCode: output === null ? FAILURE_EXIT_CODE : SUCCESS_EXIT_CODE, stdout: Buffer.from(output ?? '') };
  };
  process.kill = ((target: number, signal: number | string) => {
    if (signal !== 0) signalsSent.push({ target, signal });
    signalInWorld(world, signal);
    return true;
  }) as typeof process.kill;
  try {
    return { answer: run(), programs, signalsSent };
  } finally {
    (Bun as unknown as { spawnSync: unknown }).spawnSync = realSpawnSync;
    process.kill = realKill;
  }
}

export interface FrozenStopScenario {
  readonly name:   string;
  readonly world:  ProcessWorld;
  readonly leader: ProcessIdentity;
  readonly signal: 'SIGTERM' | 'SIGKILL';
}

const BOOT   = 'EXAMPLE-BOOT-A';
const LEADER = 4242;
const LEADER_STAMP = 'Wed Oct 28 01:51:25 2026';
const LEADER_START = '1793152285';
const EARLIER_START = '1793152284';
const OLDER_MEMBER_STAMP = 'Wed Oct 28 01:51:24 2026';
const NEWER_MEMBER_STAMP = 'Wed Oct 28 01:52:00 2026';

const RECORDED_LEADER: ProcessIdentity = { processId: LEADER, startStamp: LEADER_START, bootIdentity: BOOT };

const LIVE_LEADER_WORLD: ProcessWorld = {
  startStampsByProcessId: { [LEADER]: LEADER_STAMP }, bootSession: BOOT, processListing: '', groupHasMembers: true, signalErrorCode: null,
};
const GONE_LEADER_WORLD: ProcessWorld = { ...LIVE_LEADER_WORLD, startStampsByProcessId: {} };

function listingOfMember(startStamp: string): string {
  return ` 7001  ${LEADER} ${startStamp}\n 7002  9999 ${OLDER_MEMBER_STAMP}\n`;
}

/** Every branch a group stop has; the frozen table is these scenarios' answers. */
export const FROZEN_STOP_SCENARIOS: readonly FrozenStopScenario[] = [
  {
    name: 'a live recorded leader is asked', world: LIVE_LEADER_WORLD, leader: RECORDED_LEADER, signal: 'SIGTERM'
  },
  {
    name: 'a live recorded leader is forced', world: LIVE_LEADER_WORLD, leader: RECORDED_LEADER, signal: 'SIGKILL'
  },
  {
    name: 'a reused pid started later', world: LIVE_LEADER_WORLD, leader: { ...RECORDED_LEADER, startStamp: EARLIER_START }, signal: 'SIGKILL'
  },
  {
    name: 'a recorded leader of another boot', world: LIVE_LEADER_WORLD, leader: { ...RECORDED_LEADER, bootIdentity: 'EXAMPLE-BOOT-B' }, signal: 'SIGKILL'
  },
  {
    name: 'the group goes before the signal', world: { ...LIVE_LEADER_WORLD, signalErrorCode: 'ESRCH' }, leader: RECORDED_LEADER, signal: 'SIGKILL'
  },
  {
    name: 'the signal is not permitted', world: { ...LIVE_LEADER_WORLD, signalErrorCode: 'EPERM' }, leader: RECORDED_LEADER, signal: 'SIGKILL'
  },
  {
    name: 'a gone leader with an empty group', world: { ...GONE_LEADER_WORLD, groupHasMembers: false }, leader: RECORDED_LEADER, signal: 'SIGKILL'
  },
  {
    name: 'a gone leader on another boot', world: { ...GONE_LEADER_WORLD, bootSession: 'EXAMPLE-BOOT-B' }, leader: RECORDED_LEADER, signal: 'SIGKILL'
  },
  {
    name: 'a gone leader whose boot cannot be read', world: { ...GONE_LEADER_WORLD, bootSession: null }, leader: RECORDED_LEADER, signal: 'SIGKILL'
  },
  {
    name: 'a gone leader whose listing cannot be read', world: { ...GONE_LEADER_WORLD, processListing: null }, leader: RECORDED_LEADER, signal: 'SIGKILL'
  },
  {
    name:   'a gone leader with no listed member',
    world:  { ...GONE_LEADER_WORLD, processListing: ' 7002  9999 Wed Oct 28 01:51:24 2026\n' },
    leader: RECORDED_LEADER,
    signal: 'SIGKILL',
  },
  {
    name:   'a gone leader with a member older than it',
    world:  { ...GONE_LEADER_WORLD, processListing: listingOfMember(OLDER_MEMBER_STAMP) },
    leader: RECORDED_LEADER,
    signal: 'SIGKILL',
  },
  {
    name: 'a gone leader with a newer member', world: { ...GONE_LEADER_WORLD, processListing: listingOfMember(NEWER_MEMBER_STAMP) }, leader: RECORDED_LEADER, signal: 'SIGTERM'
  },
  {
    name:   'a gone leader with an unreadable member stamp',
    world:  { ...GONE_LEADER_WORLD, processListing: listingOfMember('woe 28 okt 01:51:25 2026') },
    leader: RECORDED_LEADER,
    signal: 'SIGKILL',
  },
];

export const FROZEN_IDENTITY_SCENARIOS: readonly { readonly name: string; readonly world: ProcessWorld; readonly processId: number }[] = [
  { name: 'a live process', world: LIVE_LEADER_WORLD, processId: LEADER },
  { name: 'a stamp padded as ps pads it', world: { ...LIVE_LEADER_WORLD, startStampsByProcessId: { [LEADER]: 'Wed Oct  8 01:51:25 2026    ' } }, processId: LEADER },
  { name: 'a stamp in another language', world: { ...LIVE_LEADER_WORLD, startStampsByProcessId: { [LEADER]: 'woe 28 okt 01:51:25 2026' } }, processId: LEADER },
  { name: 'a boot that cannot be read', world: { ...LIVE_LEADER_WORLD, bootSession: null }, processId: LEADER },
  { name: 'an empty boot', world: { ...LIVE_LEADER_WORLD, bootSession: '' }, processId: LEADER },
  { name: 'a process that is gone', world: GONE_LEADER_WORLD, processId: LEADER },
  { name: 'process id zero', world: LIVE_LEADER_WORLD, processId: 0 },
  { name: 'a negative process id', world: LIVE_LEADER_WORLD, processId: -1 },
  { name: 'a fractional process id', world: LIVE_LEADER_WORLD, processId: 1.5 },
];
