/**
 * forge-control over recorded and authored Overseer answers and forge program runs: one spec per kind and the carrier PLAN 8.2 gives it.
 * What matters: the command each kind sends and to whom, a refusal's code and sentence passed on unchanged from the API and the program,
 * the contract check that sends nothing to a forge whose control contract Gaia does not know, a stop that falls back to the program when
 * no Overseer answers, and the in-flight rule, which holds one forge and leaves another free.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createForgeProgram }                                                                           from '../../adapters/forge-program/ForgeProgram.ts';
import { EXAMPLE_FORGE_PROGRAM_PATH, RECORDING_NAME_OF_FORGE_PROGRAM_STAGE, recordedForgeProgramRunOf } from '../../adapters/forge-program/testing/RecordedForgeProgram.ts';
import type { RegisteredForge }                                                                         from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import type { RegistryReading }                                                                         from '../../adapters/forge-registry/RegistryFile.ts';
import { forgeClientOf }                                                                                from '../../lib/forge-client/ForgeClient.ts';
import type { OverseerAnswer, OverseerFetch }                                                           from '../../lib/forge-client/OverseerFetch.ts';
import type { ProcessRun }                                                                              from '../../lib/process-run/ProcessRun.ts';
import { WatchReadingUtil }                                                                             from '../../services/utils/WatchReadingUtil.ts';
import type { ForgeReading }                                                                            from '../../shared/@types/ForgeReading.ts';
import type { GaiaCommand }                                                                             from '../../shared/@types/GaiaCommand.ts';
import {
  recordedOverseerAnswersOf,
  recordedOverseerFetch,
  type OverseerSituation,
  type RecordedOverseerFetch,
} from '../../testing/RecordedAnswers.ts';
import { recordedProcessRun, recordedRunsOf, runCallShapeOf } from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }          from '../../testing/ScratchRoot.ts';

import type { CommandVerdict }                   from './@types/CommandVerdict.ts';
import { createForgeControl, type ForgeControl } from './ForgeControl.ts';

const STOREFRONT_TRACKER_ID = 'example-storefront-7c41';
const WIKI_TRACKER_ID = 'research-wiki-2b90';
const STOREFRONT_URL = 'http://127.0.0.1:4951/';
const WIKI_URL = 'http://127.0.0.1:4952/';
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';
const COMMANDS_CALL_SHAPE = 'POST /api/commands with bearer';

type ForgeState = 'full' | 'counts-only' | 'newer-contract' | 'unreachable' | 'dormant';

interface ReadFacts {
  readonly condition: ForgeReading['condition'];
  readonly monitor:   number | null;
  readonly control:   number | null;
}

/** What the forge watch reads of an Overseer in each state; an unreachable forge keeps the contracts of its last whole reading. */
const READ_FACTS_BY_STATE: Readonly<Record<Exclude<ForgeState, 'dormant'>, ReadFacts>> = {
  'full':           { condition: 'live', monitor: 1, control: 1 },
  'counts-only':    { condition: 'live', monitor: null, control: null },
  'newer-contract': { condition: 'unreadable', monitor: 2, control: 2 },
  'unreachable':    { condition: 'unreachable', monitor: 1, control: 1 },
};

let scratchFolder = '';
let tokenPath = '';
let storefrontRoot = '';
let wikiRoot = '';

beforeEach(() => {
  scratchFolder  = createScratchDirectory('forge-control');
  tokenPath      = join(scratchFolder, 'token');
  storefrontRoot = join(scratchFolder, 'example-storefront');
  wikiRoot       = join(scratchFolder, 'research-wiki');
  mkdirSync(storefrontRoot);
  mkdirSync(wikiRoot);
  writeFileSync(tokenPath, `${EXAMPLE_TOKEN}\n`);
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

interface ForgeOptions {
  readonly trackerId?: string;
  readonly state?:     ForgeState;
  readonly program?:   string | null;
  readonly tokenPath?: string;
}

interface ExampleForge {
  readonly entry:   RegisteredForge;
  readonly reading: ForgeReading;
}

/** A registered forge and the reading the forge watch would hold of it in that state. */
function exampleForgeOf(forgeOptions: ForgeOptions = {}): ExampleForge {
  const trackerId  = forgeOptions.trackerId ?? STOREFRONT_TRACKER_ID;
  const isWiki     = trackerId === WIKI_TRACKER_ID;
  const state      = forgeOptions.state ?? 'full';
  const hasOverseer = state !== 'dormant';
  const entry: RegisteredForge = {
    trackerId,
    project:  isWiki ? 'Research Wiki' : 'Example Storefront',
    root:     isWiki ? wikiRoot : storefrontRoot,
    program:  forgeOptions.program === undefined ? EXAMPLE_FORGE_PROGRAM_PATH : forgeOptions.program,
    overseer: hasOverseer ? {
      url:       isWiki ? WIKI_URL : STOREFRONT_URL,
      processId: 48_107,
      startedAt: '2026-11-12T09:12:00.000Z',
      tokenPath: forgeOptions.tokenPath ?? tokenPath,
    } : null,
  };
  const dormantReading = WatchReadingUtil.dormantReadingOf(entry, null);
  if (state === 'dormant') return { entry, reading: dormantReading };
  const { condition, monitor, control } = READ_FACTS_BY_STATE[state];
  const reading: ForgeReading = {
    ...dormantReading,
    fidelity:  state,
    condition,
    url:       entry.overseer?.url ?? null,
    contracts: {
      summary: 1, monitor, control, embed: null,
    },
  };
  return { entry, reading };
}

interface ControlOptions {
  readonly forges?:        readonly ExampleForge[];
  readonly registry?:      RegistryReading;
  readonly overseerFetch?: OverseerFetch;
  readonly processRun?:    ProcessRun;
  readonly lookAgain?:     () => Promise<void>;
}

function controlOver(controlOptions: ControlOptions): ForgeControl {
  const forges = controlOptions.forges ?? [exampleForgeOf()];
  const registry: RegistryReading = controlOptions.registry ?? { verdict: 'readable', forges: forges.map((forge) => forge.entry), leftOutEntries: [] };
  return createForgeControl({
    readRegistry: async () => registry,
    readings:     () => forges.map((forge) => forge.reading),
    forgeClient:  forgeClientOf({ overseerFetch: controlOptions.overseerFetch ?? recordedOverseerFetch([]) }),
    forgeProgram: createForgeProgram({ processRun: controlOptions.processRun ?? recordedProcessRun([]), settingsProgramPath: () => null }),
    lookAgain:    controlOptions.lookAgain ?? (async () => undefined),
  });
}

function overseerAnswering(situation: OverseerSituation): RecordedOverseerFetch {
  return recordedOverseerFetch(recordedOverseerAnswersOf(situation).filter((answer) => answer.callShape === COMMANDS_CALL_SHAPE));
}

function sentBodiesOf(overseerFetch: RecordedOverseerFetch): readonly unknown[] {
  return overseerFetch.callsAnswered().map((call) => (call.jsonBody === null ? null : JSON.parse(call.jsonBody) as unknown));
}

/** The forge's refusal the authored Overseer answer holds, read from the recording itself. */
function recordedApiRefusal(): { readonly refusal: string; readonly text: string } {
  const [recorded] = recordedOverseerAnswersOf('command-refused').filter((answer) => answer.callShape === COMMANDS_CALL_SHAPE);
  if (recorded?.answer.verdict !== 'answered') throw new Error('The command-refused situation holds no answered command.');
  return JSON.parse(recorded.answer.bodyText) as { refusal: string; text: string };
}

/** The forge program's refusal the authored run holds for a verb, read from the recording itself. */
function recordedProgramRefusal(programArguments: readonly string[]): { readonly refusal: string; readonly text: string } {
  const callShape = runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, programArguments);
  const recorded  = recordedRunsOf(RECORDING_NAME_OF_FORGE_PROGRAM_STAGE['every-verb-refused']).find((run) => run.callShape === callShape);
  if (recorded?.answer.verdict !== 'finished') throw new Error(`The refused recording holds no finished run for ${callShape}`);
  const { refusal, text } = JSON.parse(recorded.answer.standardOutput) as { refusal: string; text: string };
  return { refusal, text };
}

const START: GaiaCommand = { kind: 'forge-start', trackerId: STOREFRONT_TRACKER_ID };
const PAUSE: GaiaCommand = { kind: 'forge-pause', trackerId: STOREFRONT_TRACKER_ID };
const UPDATE: GaiaCommand = { kind: 'forge-update', trackerId: STOREFRONT_TRACKER_ID };
const STOP_KEEPING_AGENTS: GaiaCommand = { kind: 'forge-stop', trackerId: STOREFRONT_TRACKER_ID, agents: 'keep' };
const STOP_AGENTS_FIRST: GaiaCommand = { kind: 'forge-stop', trackerId: STOREFRONT_TRACKER_ID, agents: 'stop-first' };

describe('forge-start, carried by the forge program', () => {
  test('runs `forge start --json` in the forge root and answers done when an Overseer was started', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'dormant' })], processRun }).carry(START);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['start', '--json'])]);
  });

  test('passes the program\'s refusal code and sentence on unchanged', async () => {
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'dormant' })], processRun: recordedForgeProgramRunOf('every-verb-refused') }).carry(START);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedProgramRefusal(['start', '--json']) });
  });

  test('refuses with program-not-found when neither the registry nor the settings name a program', async () => {
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'dormant', program: null })] }).carry(START);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'program-not-found' });
  });
});

describe('forge-stop, carried by the API while the Overseer answers, else by the forge program', () => {
  test('keeping the agents, sends only `overseer-stop` to the Overseer', async () => {
    const overseerFetch = overseerAnswering('serving-every-contract');
    const verdict = await controlOver({ overseerFetch }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(overseerFetch)).toEqual([{ kind: 'overseer-stop', now: false }]);
  });

  test('stopping the agents first, sends `job-stop-all`, then `overseer-stop`, with the token as the bearer', async () => {
    const overseerFetch = overseerAnswering('serving-every-contract');
    const verdict = await controlOver({ overseerFetch }).carry(STOP_AGENTS_FIRST);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(overseerFetch)).toEqual([{ kind: 'job-stop-all', mode: 'stop' }, { kind: 'overseer-stop', now: false }]);
    expect(overseerFetch.callsAnswered().map((call) => call.bearerToken)).toEqual([EXAMPLE_TOKEN, EXAMPLE_TOKEN]);
  });

  test('stops at a refused `job-stop-all` and leaves the Overseer running', async () => {
    const overseerFetch = overseerAnswering('command-refused');
    const verdict = await controlOver({ overseerFetch }).carry(STOP_AGENTS_FIRST);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
    expect(sentBodiesOf(overseerFetch)).toEqual([{ kind: 'job-stop-all', mode: 'stop' }]);
  });

  test('runs `forge stop --json` when the Overseer gives no answer to the stop', async () => {
    const overseerFetch = overseerAnswering('stopped');
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ overseerFetch, processRun }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(overseerFetch.callsAnswered()).toHaveLength(1);
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['stop', '--json'])]);
  });

  test('runs `forge stop --json` at once for a forge read as unreachable, and sends the API nothing', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'unreachable' })], processRun }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['stop', '--json'])]);
  });

  test('passes the program\'s refusal of a stop on unchanged', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-refused');
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'unreachable' })], processRun }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedProgramRefusal(['stop', '--json']) });
  });

  test('sends nothing and runs nothing for a live forge whose control contract Gaia does not know', async () => {
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'counts-only' })] }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'not-supported' });
  });
});

describe('forge-pause, forge-resume and forge-restart, carried by the API', () => {
  test('pause sends `overseer-pause`', async () => {
    const overseerFetch = overseerAnswering('serving-every-contract');
    expect(await controlOver({ overseerFetch }).carry(PAUSE)).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(overseerFetch)).toEqual([{ kind: 'overseer-pause' }]);
  });

  test('resume sends `overseer-resume`', async () => {
    const overseerFetch = overseerAnswering('serving-every-contract');
    expect(await controlOver({ overseerFetch }).carry({ kind: 'forge-resume', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(overseerFetch)).toEqual([{ kind: 'overseer-resume' }]);
  });

  test('restart sends `overseer-restart` without `now`', async () => {
    const overseerFetch = overseerAnswering('serving-every-contract');
    expect(await controlOver({ overseerFetch }).carry({ kind: 'forge-restart', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(overseerFetch)).toEqual([{ kind: 'overseer-restart', now: false }]);
  });

  test('passes the Overseer\'s refusal code and sentence on unchanged', async () => {
    const verdict = await controlOver({ overseerFetch: overseerAnswering('command-refused') }).carry(PAUSE);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
  });

  test('answers nothing-to-do when the Overseer changed nothing', async () => {
    expect(await controlOver({ overseerFetch: overseerAnswering('nothing-to-change') }).carry(PAUSE)).toEqual({ verdict: 'nothing-to-do' });
  });

  test('answers unreachable when the Overseer gives no answer', async () => {
    expect(await controlOver({ overseerFetch: overseerAnswering('stopped') }).carry(PAUSE)).toEqual({ verdict: 'unreachable' });
  });

  test('refuses with token-rejected when the Overseer refuses the token', async () => {
    const verdict = await controlOver({ overseerFetch: overseerAnswering('token-rejected') }).carry(PAUSE);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'token-rejected' });
  });

  test('answers not-supported for an answer that is no command answer', async () => {
    expect(await controlOver({ overseerFetch: overseerAnswering('port-held-by-another-program') }).carry(PAUSE)).toEqual({ verdict: 'not-supported' });
  });

  test('refuses with token-unreadable and sends nothing when the token file cannot be read', async () => {
    const forges = [exampleForgeOf({ tokenPath: join(scratchFolder, 'absent-token') })];
    expect(await controlOver({ forges }).carry(PAUSE)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'token-unreadable' });
  });

  test('sends nothing to a forge read through its counts, which names no control contract', async () => {
    expect(await controlOver({ forges: [exampleForgeOf({ state: 'counts-only' })] }).carry(PAUSE)).toEqual({ verdict: 'not-supported' });
  });

  test('sends nothing to a forge whose control contract is newer than Gaia knows', async () => {
    expect(await controlOver({ forges: [exampleForgeOf({ state: 'newer-contract' })] }).carry(PAUSE)).toEqual({ verdict: 'not-supported' });
  });

  test('answers unreachable and sends nothing to a dormant forge', async () => {
    expect(await controlOver({ forges: [exampleForgeOf({ state: 'dormant' })] }).carry(PAUSE)).toEqual({ verdict: 'unreachable' });
  });
});

describe('forge-update, carried by the forge program', () => {
  test('runs `forge update --json` and answers its outcome', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    expect(await controlOver({ processRun }).carry(UPDATE)).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['update', '--json'])]);
  });

  test('passes the program\'s refusal code and sentence on unchanged', async () => {
    const verdict = await controlOver({ processRun: recordedForgeProgramRunOf('every-verb-refused') }).carry(UPDATE);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedProgramRefusal(['update', '--json']) });
  });

  test('is carried for a forge read through its counts, which no control contract limits', async () => {
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'counts-only' })], processRun: recordedForgeProgramRunOf('every-verb-done') }).carry(UPDATE);
    expect(verdict).toEqual({ verdict: 'done' });
  });

  test('answers not-supported for a forge program that does not answer in versioned JSON yet', async () => {
    expect(await controlOver({ processRun: recordedForgeProgramRunOf('forge-before-versioned-answers') }).carry(UPDATE)).toEqual({ verdict: 'not-supported' });
  });
});

describe('forge-open-in-browser, carried by the forge program', () => {
  test('starts `forge open` detached in the forge root and answers done', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    expect(await controlOver({ processRun }).carry({ kind: 'forge-open-in-browser', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([`start detached ${JSON.stringify([EXAMPLE_FORGE_PROGRAM_PATH, 'open'])}`]);
  });
});

describe('fleet-look-again, carried by the forge watch', () => {
  test('asks the watch to look again and answers done when it has', async () => {
    let looksAgain = 0;
    const control = controlOver({
      lookAgain: async () => {
        looksAgain += 1;
      },
    });
    expect(await control.carry({ kind: 'fleet-look-again' })).toEqual({ verdict: 'done' });
    expect(looksAgain).toBe(1);
  });
});

describe('a forge the registry does not name', () => {
  test('refuses a command to a tracker id the registry does not hold', async () => {
    const verdict = await controlOver({}).carry({ kind: 'forge-pause', trackerId: 'example-unknown-0000' });
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'forge-not-registered' });
  });

  test('refuses every forge command while the registry cannot be read', async () => {
    const verdict = await controlOver({ registry: { verdict: 'unreadable', reason: 'not-json', failure: null } }).carry(START);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'forge-not-registered' });
  });
});

describe('one command per forge on its way', () => {
  /** Holds every request to the storefront's Overseer until the spec lets it through; the wiki's pass at once. */
  function overseerHoldingStorefront(): { readonly overseerFetch: OverseerFetch; readonly letThrough: () => void } {
    const recorded = overseerAnswering('serving-every-contract');
    let letThrough: () => void = () => undefined;
    const heldUntilLetThrough = new Promise<void>((resolve) => {
      letThrough = resolve;
    });
    const overseerFetch: OverseerFetch = {
      request: async (overseerRequest): Promise<OverseerAnswer> => {
        if (overseerRequest.overseerUrl === STOREFRONT_URL) await heldUntilLetThrough;
        return recorded.request(overseerRequest);
      },
      openStream: (streamRequest) => recorded.openStream(streamRequest),
    };
    return { overseerFetch, letThrough };
  }

  test('refuses a second command to the same forge while the first runs, carries one to another forge, and frees the forge after', async () => {
    const { overseerFetch, letThrough } = overseerHoldingStorefront();
    const forges = [exampleForgeOf(), exampleForgeOf({ trackerId: WIKI_TRACKER_ID })];
    const control = controlOver({ forges, overseerFetch });

    const firstPause: Promise<CommandVerdict> = control.carry(PAUSE);
    expect(await control.carry(STOP_KEEPING_AGENTS)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' });
    expect(await control.carry({ kind: 'forge-pause', trackerId: WIKI_TRACKER_ID })).toEqual({ verdict: 'done' });

    letThrough();
    expect(await firstPause).toEqual({ verdict: 'done' });
    expect(await control.carry({ kind: 'forge-resume', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
  });

  test('frees the forge after a command that was refused', async () => {
    const control = controlOver({ overseerFetch: overseerAnswering('command-refused') });
    expect((await control.carry(PAUSE)).verdict).toBe('refused');
    expect(await control.carry(PAUSE)).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
  });
});
