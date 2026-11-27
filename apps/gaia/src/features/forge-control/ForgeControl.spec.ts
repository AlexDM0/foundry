/**
 * forge-control over recorded Hephaestus answers, program and chooser runs, and the real settings store under a scratch home, one spec per command
 * kind: what each sends and to whom, refusals passed on unchanged, nothing sent to a forge whose control contract Gaia does not know, the fallback
 * to the program when no Hephaestus answers, and the in-flight rule.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
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
import { SettingsFile, settingsFilePathIn }                                                             from '../../adapters/gaia-files/SettingsFile.ts';
import { createSettingsWriter }                                                                         from '../../adapters/gaia-files/SettingsWriter.ts';
import { createPathChooser }                                                                            from '../../adapters/path-chooser/PathChooser.ts';
import { RECORDED_CHOSEN_FOLDER, recordedPathChooserRun }                                               from '../../adapters/path-chooser/testing/RecordedPathChooser.ts';
import { forgeClientOf }                                                                                from '../../lib/forge-client/ForgeClient.ts';
import type { HephaestusAnswer, HephaestusFetch }                                                       from '../../lib/forge-client/HephaestusFetch.ts';
import type { ProcessRun, ProgramRunRequest }                                                           from '../../lib/process-run/ProcessRun.ts';
import { createSettingsStore, type SettingsStore }                                                      from '../../services/SettingsStore.ts';
import { WatchReadingUtil }                                                                             from '../../services/utils/WatchReadingUtil.ts';
import type { CommandVerdict }                                                                          from '../../shared/@types/CommandVerdict.ts';
import type { ForgeReading }                                                                            from '../../shared/@types/ForgeReading.ts';
import type { GaiaCommand }                                                                             from '../../shared/@types/GaiaCommand.ts';
import { CONTRACT_VERSIONS }                                                                            from '../../shared/constants/ContractVersions.ts';
import { GAIA_SETTINGS_DEFAULTS }                                                                       from '../../shared/constants/GaiaSettingsDefaults.ts';
import {
  recordedHephaestusAnswersOf,
  recordedHephaestusFetch,
  recordedVersionsAnswersOf,
  type HephaestusSituation,
  type RecordedHephaestusFetch,
} from '../../testing/RecordedAnswers.ts';
import {
  recordedProcessRun,
  recordedRunsOf,
  runCallShapeOf,
  type RecordedProcessRun,
  type RecordedRun,
} from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';

import { createForgeControl, type ForgeControl } from './ForgeControl.ts';

const STOREFRONT_TRACKER_ID = 'example-storefront-7c41';
const WIKI_TRACKER_ID = 'research-wiki-2b90';
const STOREFRONT_URL = 'http://127.0.0.1:4951/';
const WIKI_URL = 'http://127.0.0.1:4952/';
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';
const COMMANDS_CALL_SHAPE = 'POST /api/v3/commands with bearer';

type ForgeState = 'full' | 'counts-only' | 'newer-contract' | 'unreachable' | 'dormant' | 'repository-missing';

interface ReadFacts {
  readonly condition: ForgeReading['condition'];
  readonly monitor:   number | null;
  readonly control:   number | null;
}

/** What the forge watch reads of a Hephaestus in each state; an unreachable forge keeps the contracts of its last whole reading. */
const READ_FACTS_BY_STATE: Readonly<Record<Exclude<ForgeState, 'dormant' | 'repository-missing'>, ReadFacts>> = {
  'full':           { condition: 'live', monitor: 6, control: 3 },
  'counts-only':    { condition: 'live', monitor: null, control: null },
  'newer-contract': { condition: 'unreadable', monitor: 7, control: 4 },
  'unreachable':    { condition: 'unreachable', monitor: 6, control: 3 },
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
  readonly root?:      string;
  readonly state?:     ForgeState;
  readonly program?:   string | null;
  readonly tokenPath?: string | null;
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
  const hasHephaestus = state !== 'dormant' && state !== 'repository-missing';
  const entry: RegisteredForge = {
    trackerId,
    project:    isWiki ? 'Research Wiki' : 'Example Storefront',
    root:       forgeOptions.root ?? (isWiki ? wikiRoot : storefrontRoot),
    program:    forgeOptions.program === undefined ? EXAMPLE_FORGE_PROGRAM_PATH : forgeOptions.program,
    hephaestus: hasHephaestus ? {
      url:       isWiki ? WIKI_URL : STOREFRONT_URL,
      processId: 48_107,
      startedAt: '2026-11-12T09:12:00.000Z',
      tokenPath: forgeOptions.tokenPath === undefined ? tokenPath : forgeOptions.tokenPath,
    } : null,
    lastCommand:   null,
    lastChangedAt: null,
    presence:      null,
  };
  const dormantReading = WatchReadingUtil.dormantReadingOf(entry, null);
  if (state === 'dormant') return { entry, reading: dormantReading };
  if (state === 'repository-missing') return { entry, reading: { ...dormantReading, fidelity: 'repository-missing', condition: 'missing' } };
  const { condition, monitor, control } = READ_FACTS_BY_STATE[state];
  const reading: ForgeReading = {
    ...dormantReading,
    fidelity:  state,
    condition,
    url:       entry.hephaestus?.url ?? null,
    contracts: { summary: 3, monitor, control, },
  };
  return { entry, reading };
}

interface ControlOptions {
  readonly forges?:          readonly ExampleForge[];
  readonly registry?:        RegistryReading;
  readonly hephaestusFetch?: HephaestusFetch;
  readonly processRun?:      ProcessRun;
  readonly pathChooserRun?:  ProcessRun;
  readonly settingsStore?:   SettingsStore;
  readonly lookAgain?:       () => Promise<void>;
  readonly outageEndingsOf?: (trackerId: string) => number;
}

/** The settings store over the real settings file in the spec's scratch folder, which stands in for the home folder. */
function settingsStoreInScratch(): SettingsStore {
  return createSettingsStore({ settingsFile: new SettingsFile(scratchFolder), settingsWriter: createSettingsWriter(scratchFolder) });
}

async function settingsStoreNamingTheProgram(): Promise<SettingsStore> {
  const settingsStore = settingsStoreInScratch();
  await settingsStore.change({ ...GAIA_SETTINGS_DEFAULTS, forgeProgramPath: EXAMPLE_FORGE_PROGRAM_PATH });
  return settingsStore;
}

function controlOver(controlOptions: ControlOptions): ForgeControl {
  const forges = controlOptions.forges ?? [exampleForgeOf()];
  const registry: RegistryReading = controlOptions.registry ?? { verdict: 'readable', forges: forges.map((forge) => forge.entry) };
  const settingsStore = controlOptions.settingsStore ?? settingsStoreInScratch();
  return createForgeControl({
    readRegistry: async () => registry,
    readings:     () => forges.map((forge) => forge.reading),
    forgeClient:  forgeClientOf({ hephaestusFetch: controlOptions.hephaestusFetch ?? recordedHephaestusFetch([]) }),
    forgeProgram: createForgeProgram({
      processRun:          controlOptions.processRun ?? recordedProcessRun([]),
      settingsProgramPath: () => settingsStore.settings().forgeProgramPath,
    }),
    settingsStore,
    pathChooser: createPathChooser({
      processRun:       controlOptions.pathChooserRun ?? recordedProcessRun([]),
      workingDirectory: () => scratchFolder,
      cancellation:     new AbortController().signal,
    }),
    lookAgain:       controlOptions.lookAgain ?? (async () => undefined),
    outageEndingsOf: controlOptions.outageEndingsOf ?? (() => 0),
  });
}

const INIT_ARGUMENTS = ['init', '--project', 'Example Project', '--json'];
const START_ARGUMENTS = ['start', '--json'];

type AddStage = 'every-verb-done' | 'every-verb-refused';

/** One answer set per stage of an add: the stage that initializes the repository and the one that starts its forge. */
function forgeProgramRunOfAddStages(initStage: AddStage, startStage: AddStage): RecordedProcessRun {
  const runOf = (stage: AddStage, programArguments: readonly string[]): readonly RecordedRun[] => {
    const callShape = runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, programArguments);
    return recordedRunsOf(RECORDING_NAME_OF_FORGE_PROGRAM_STAGE[stage]).filter((run) => run.callShape === callShape);
  };
  return recordedProcessRun([...runOf(initStage, INIT_ARGUMENTS), ...runOf(startStage, START_ARGUMENTS)]);
}

/** Answers from the recording, but holds the first run until the spec lets it through; every later run passes at once. */
function holdingFirstRun(recorded: RecordedProcessRun): { readonly processRun: ProcessRun; readonly letThrough: () => void } {
  let letThrough: () => void = () => undefined;
  const heldUntilLetThrough = new Promise<void>((resolve) => {
    letThrough = resolve;
  });
  let firstRunIsHeld = true;
  const processRun: ProcessRun = {
    run: async (request: ProgramRunRequest) => {
      if (firstRunIsHeld) {
        firstRunIsHeld = false;
        await heldUntilLetThrough;
      }
      return recorded.run(request);
    },
    startOwned:    (request) => recorded.startOwned(request),
    startDetached: (request) => recorded.startDetached(request),
  };
  return { processRun, letThrough };
}

function hephaestusAnswering(situation: HephaestusSituation): RecordedHephaestusFetch {
  return recordedHephaestusFetch(recordedHephaestusAnswersOf(situation).filter((answer) => answer.callShape === COMMANDS_CALL_SHAPE));
}

/** A live forge whose identity names this control contract. */
function liveForgeAtControl(controlVersion: number): ExampleForge {
  const forge = exampleForgeOf();
  return { ...forge, reading: { ...forge.reading, contracts: { ...forge.reading.contracts, monitor: 6, control: controlVersion } } };
}

/** The forge as the watch last read it, while the registry already names its Hephaestus at another address. */
function forgeMovedSinceTheWatchRead(): ExampleForge {
  const forge = exampleForgeOf();
  const hephaestus = forge.entry.hephaestus === null ? null : { ...forge.entry.hephaestus, url: 'http://127.0.0.1:4961/' };
  return { ...forge, entry: { ...forge.entry, hephaestus } };
}

function sentBodiesOf(hephaestusFetch: RecordedHephaestusFetch): readonly unknown[] {
  return hephaestusFetch.callsAnswered().map((call) => (call.jsonBody === null ? null : JSON.parse(call.jsonBody) as unknown));
}

/** The forge's refusal the recorded Hephaestus answer holds, read from the recording itself. */
function recordedApiRefusal(): { readonly refusal: string; readonly text: string } {
  const [recorded] = recordedHephaestusAnswersOf('command-refused').filter((answer) => answer.callShape === COMMANDS_CALL_SHAPE);
  if (recorded?.answer.verdict !== 'answered') throw new Error('The command-refused situation holds no answered command.');
  const { refusal, text } = JSON.parse(recorded.answer.bodyText) as { refusal: string; text: string };
  return { refusal, text };
}

/** The forge program's refusal the recorded run holds for a verb, read from the recording itself. */
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
  test('runs `forge start --json` in the forge root and answers done when a Hephaestus was started', async () => {
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

describe('forge-stop, carried by the API while Hephaestus answers, else by the forge program', () => {
  test('keeping the agents, sends only `hephaestus-stop` to Hephaestus', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const verdict = await controlOver({ hephaestusFetch }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'hephaestus-stop', now: false }]);
  });

  test('stopping the agents first, sends `job-stop-all`, then `hephaestus-stop`, with the token as the bearer', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const verdict = await controlOver({ hephaestusFetch }).carry(STOP_AGENTS_FIRST);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'job-stop-all', mode: 'stop' }, { kind: 'hephaestus-stop', now: false }]);
    expect(hephaestusFetch.callsAnswered().map((call) => call.bearerToken)).toEqual([EXAMPLE_TOKEN, EXAMPLE_TOKEN]);
  });

  test('stops at a refused `job-stop-all` and leaves Hephaestus running', async () => {
    const hephaestusFetch = hephaestusAnswering('command-refused');
    const verdict = await controlOver({ hephaestusFetch }).carry(STOP_AGENTS_FIRST);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'job-stop-all', mode: 'stop' }]);
  });

  test('runs `forge stop --json` when Hephaestus gives no answer to the stop', async () => {
    const hephaestusFetch = hephaestusAnswering('stopped');
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ hephaestusFetch, processRun }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(hephaestusFetch.callsAnswered()).toHaveLength(1);
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

  test('runs `forge stop --json` for a live forge whose token file cannot be read, or whose registry entry names none', async () => {
    for (const forgeTokenPath of [join(scratchFolder, 'absent-token'), null]) {
      const hephaestusFetch = hephaestusAnswering('serving-every-contract');
      const processRun = recordedForgeProgramRunOf('every-verb-done');
      const verdict = await controlOver({ forges: [exampleForgeOf({ tokenPath: forgeTokenPath })], hephaestusFetch, processRun }).carry(STOP_KEEPING_AGENTS);
      expect(verdict).toEqual({ verdict: 'done' });
      expect(hephaestusFetch.callsAnswered()).toEqual([]);
      expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['stop', '--json'])]);
    }
  });

  test('runs `forge stop --json`, and sends the API nothing, when the registry names Hephaestus at another address than the watch read', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ forges: [forgeMovedSinceTheWatchRead()], hephaestusFetch, processRun }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(hephaestusFetch.callsAnswered()).toEqual([]);
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['stop', '--json'])]);
  });

  test('sends nothing and runs nothing for a live forge whose control contract Gaia does not know', async () => {
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'counts-only' })] }).carry(STOP_KEEPING_AGENTS);
    expect(verdict).toEqual({ verdict: 'not-supported' });
  });
});

describe('forge-interrupted-work-resume, carried by the API', () => {
  test('sends `interrupted-work-resume` with the job, the ticket or every job it names', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const control = controlOver({ hephaestusFetch });
    for (const target of [{ jobId: 'J4' }, { ticketReference: '004' }, 'all'] as const) {
      expect(await control.carry({ kind: 'forge-interrupted-work-resume', trackerId: STOREFRONT_TRACKER_ID, target })).toEqual({ verdict: 'done' });
    }
    expect(sentBodiesOf(hephaestusFetch)).toEqual([
      { kind: 'interrupted-work-resume', target: { jobId: 'J4' } },
      { kind: 'interrupted-work-resume', target: { ticketReference: '004' } },
      { kind: 'interrupted-work-resume', target: 'all' },
    ]);
  });

  test('reaches no forge whose Hephaestus is not answering, and runs nothing in its place', async () => {
    const command = { kind: 'forge-interrupted-work-resume', trackerId: STOREFRONT_TRACKER_ID, target: 'all' } as const;
    for (const state of ['unreachable', 'dormant'] as const) {
      expect(await controlOver({ forges: [exampleForgeOf({ state })] }).carry(command)).toEqual({ verdict: 'unreachable' });
    }
  });
});

describe('fleet-outage-resume, carried by each forge\'s API', () => {
  const OUTAGE_RESUME = { kind: 'fleet-outage-resume' } as const;

  test('sends each answering forge the resume with the outage target, and answers per forge with the count Gaia last read', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const forges = [exampleForgeOf(), exampleForgeOf({ trackerId: WIKI_TRACKER_ID, state: 'unreachable' })];
    const outageEndings: Readonly<Record<string, number>> = { [STOREFRONT_TRACKER_ID]: 2, [WIKI_TRACKER_ID]: 1 };
    const control = controlOver({ forges, hephaestusFetch, outageEndingsOf: (trackerId) => outageEndings[trackerId] ?? 0 });
    expect(await control.carry(OUTAGE_RESUME)).toEqual({
      verdict: 'outage-resume-answered',
      forges:  [
        {
          trackerId: STOREFRONT_TRACKER_ID, outcome: 'resumed', resumedCount: 2, refusalText: null
        },
        {
          trackerId: WIKI_TRACKER_ID, outcome: 'not-reached', resumedCount: 0, refusalText: null
        },
      ],
    });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'interrupted-work-resume', target: 'network-outage' }]);
  });

  test('keeps a forge\'s refusal sentence in that forge\'s answer', async () => {
    const { text } = recordedApiRefusal();
    const answer = await controlOver({ hephaestusFetch: hephaestusAnswering('command-refused') }).carry(OUTAGE_RESUME);
    expect(answer).toEqual({
      verdict: 'outage-resume-answered',
      forges:  [{
        trackerId: STOREFRONT_TRACKER_ID, outcome: 'refused', resumedCount: 0, refusalText: text
      }],
    });
  });

  test('reaches no forge whose Hephaestus is not answering, runs no forge verb in its place, and is carried again when sent again', async () => {
    const control = controlOver({ forges: [exampleForgeOf({ state: 'dormant' })] });
    const notReached = {
      verdict: 'outage-resume-answered',
      forges:  [{
        trackerId: STOREFRONT_TRACKER_ID, outcome: 'not-reached', resumedCount: 0, refusalText: null
      }],
    } as const;
    expect(await control.carry(OUTAGE_RESUME)).toEqual(notReached);
    expect(await control.carry(OUTAGE_RESUME)).toEqual(notReached);
  });

  test('passes over a forge with a command already on its way, so no forge is sent two at once', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const control = controlOver({ hephaestusFetch });
    const [pause, resume] = await Promise.all([control.carry(PAUSE), control.carry(OUTAGE_RESUME)]);
    expect(pause).toEqual({ verdict: 'done' });
    expect(resume).toEqual({
      verdict: 'outage-resume-answered',
      forges:  [{
        trackerId: STOREFRONT_TRACKER_ID, outcome: 'not-reached', resumedCount: 0, refusalText: null
      }],
    });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'hephaestus-pause' }]);
  });
});

describe('forge-pause, forge-unpause, forge-restart and forge-talos-restart, carried by the API', () => {
  test('pause sends `hephaestus-pause`', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    expect(await controlOver({ hephaestusFetch }).carry(PAUSE)).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'hephaestus-pause' }]);
  });

  test('unpause sends the forge\'s undo of a pause, `hephaestus-unpause`', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    expect(await controlOver({ hephaestusFetch }).carry({ kind: 'forge-unpause', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'hephaestus-unpause' }]);
  });

  test('a resume to a forge ahead of the one Gaia supports goes to the versioned path of the commands Gaia knows', async () => {
    const hephaestusFetch = recordedHephaestusFetch(recordedVersionsAnswersOf('versions-ahead').filter((answer) => answer.callShape === COMMANDS_CALL_SHAPE));
    const forge = liveForgeAtControl(CONTRACT_VERSIONS.forgeControl);
    const versions = { verdict: 'ahead', current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 0 } } as const;
    const forges = [{ ...forge, reading: { ...forge.reading, versions } }];
    expect(await controlOver({ forges, hephaestusFetch }).carry({ kind: 'forge-unpause', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
    expect([hephaestusFetch.callsAnswered().map((call) => call.callShape), sentBodiesOf(hephaestusFetch)]).toEqual([[COMMANDS_CALL_SHAPE], [{ kind: 'hephaestus-unpause' }]]);
  });

  test('restart sends `hephaestus-restart` without `now`', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    expect(await controlOver({ hephaestusFetch }).carry({ kind: 'forge-restart', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'hephaestus-restart', now: false }]);
  });

  test('a restart of Talos sends the forge\'s `talos-restart`, which carries no field', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    expect(await controlOver({ hephaestusFetch }).carry({ kind: 'forge-talos-restart', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'talos-restart' }]);
  });

  test('passes Hephaestus\'s refusal code and sentence on unchanged', async () => {
    const verdict = await controlOver({ hephaestusFetch: hephaestusAnswering('command-refused') }).carry(PAUSE);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
  });

  test('answers nothing-to-do when Hephaestus changed nothing', async () => {
    expect(await controlOver({ hephaestusFetch: hephaestusAnswering('nothing-to-change') }).carry(PAUSE)).toEqual({ verdict: 'nothing-to-do' });
  });

  test('answers unreachable when Hephaestus gives no answer', async () => {
    expect(await controlOver({ hephaestusFetch: hephaestusAnswering('stopped') }).carry(PAUSE)).toEqual({ verdict: 'unreachable' });
  });

  test('refuses with token-rejected when Hephaestus refuses the token', async () => {
    const verdict = await controlOver({ hephaestusFetch: hephaestusAnswering('token-rejected') }).carry(PAUSE);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'token-rejected' });
  });

  test('answers not-supported for an answer that is no command answer', async () => {
    expect(await controlOver({ hephaestusFetch: hephaestusAnswering('port-held-by-another-program') }).carry(PAUSE)).toEqual({ verdict: 'not-supported' });
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

  test('answers unreachable and sends nothing when the registry names Hephaestus at another address than the watch read', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    expect(await controlOver({ forges: [forgeMovedSinceTheWatchRead()], hephaestusFetch }).carry(PAUSE)).toEqual({ verdict: 'unreachable' });
    expect(hephaestusFetch.callsAnswered()).toEqual([]);
  });
});

describe('a live forge whose control contract Gaia does not know', () => {
  test('is sent nothing, and its command answers not-supported', async () => {
    const hephaestusFetch = recordedHephaestusFetch([]);
    for (const controlVersion of [CONTRACT_VERSIONS.forgeControl - 1, CONTRACT_VERSIONS.forgeControl + 1]) {
      expect(await controlOver({ forges: [liveForgeAtControl(controlVersion)], hephaestusFetch }).carry(PAUSE)).toEqual({ verdict: 'not-supported' });
    }
    expect(hephaestusFetch.callsAnswered()).toEqual([]);
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

describe('fleet-look-again, carried by the forge watch', () => {
  test('asks the watch to look again and answers done when it has', async () => {
    let lookAgainRequestCount = 0;
    const control = controlOver({
      lookAgain: async () => {
        lookAgainRequestCount += 1;
      },
    });
    expect(await control.carry({ kind: 'fleet-look-again' })).toEqual({ verdict: 'done' });
    expect(lookAgainRequestCount).toBe(1);
  });
});

describe('a forge the registry does not name', () => {
  test('refuses a command to a tracker id the registry does not hold', async () => {
    const verdict = await controlOver({}).carry({ kind: 'forge-pause', trackerId: 'example-unknown-0000' });
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'forge-not-registered' });
  });

  test('refuses a forge command with forge-not-registered while there is no registry yet', async () => {
    expect(await controlOver({ registry: { verdict: 'absent' } }).carry(START)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'forge-not-registered' });
  });
});

describe('a registry Gaia cannot read', () => {
  const UNREADABLE_REGISTRY: RegistryReading = { verdict: 'unreadable', reason: 'not-json', failure: null };
  const NEWER_REGISTRY: RegistryReading = { verdict: 'newer-version', version: 2 };

  test('refuses every forge command with registry-unreadable, or registry-newer-version, though the watch still shows the forge', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    expect(await controlOver({ registry: UNREADABLE_REGISTRY, processRun }).carry(START)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'registry-unreadable' });
    expect(await controlOver({ registry: NEWER_REGISTRY, processRun }).carry(PAUSE)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'registry-newer-version' });
    expect(processRun.callShapesAnswered()).toEqual([]);
  });

  test('refuses the machine limit with the registry\'s reason, and runs no program', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ registry: NEWER_REGISTRY, processRun }).carry({ kind: 'machine-agent-limit-set', limit: 4 });
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'registry-newer-version' });
    expect(processRun.callShapesAnswered()).toEqual([]);
  });
});

describe('one command per forge on its way', () => {
  /** Holds every request to the storefront's Hephaestus until the spec lets it through; the wiki's pass at once. */
  function hephaestusHoldingStorefront(): { readonly hephaestusFetch: HephaestusFetch; readonly letThrough: () => void } {
    const recorded = hephaestusAnswering('serving-every-contract');
    let letThrough: () => void = () => undefined;
    const heldUntilLetThrough = new Promise<void>((resolve) => {
      letThrough = resolve;
    });
    const hephaestusFetch: HephaestusFetch = {
      request: async (hephaestusRequest): Promise<HephaestusAnswer> => {
        if (hephaestusRequest.hephaestusUrl === STOREFRONT_URL) await heldUntilLetThrough;
        return recorded.request(hephaestusRequest);
      },
      openStream: (streamRequest) => recorded.openStream(streamRequest),
    };
    return { hephaestusFetch, letThrough };
  }

  test('refuses a second command to the same forge while the first runs, carries one to another forge, and frees the forge after', async () => {
    const { hephaestusFetch, letThrough } = hephaestusHoldingStorefront();
    const forges = [exampleForgeOf(), exampleForgeOf({ trackerId: WIKI_TRACKER_ID })];
    const control = controlOver({ forges, hephaestusFetch });

    const firstPause: Promise<CommandVerdict> = control.carry(PAUSE);
    expect(await control.carry(STOP_KEEPING_AGENTS)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' });
    expect(await control.carry({ kind: 'forge-pause', trackerId: WIKI_TRACKER_ID })).toEqual({ verdict: 'done' });

    letThrough();
    expect(await firstPause).toEqual({ verdict: 'done' });
    expect(await control.carry({ kind: 'forge-unpause', trackerId: STOREFRONT_TRACKER_ID })).toEqual({ verdict: 'done' });
  });

  test('frees the forge after a command that was refused', async () => {
    const control = controlOver({ hephaestusFetch: hephaestusAnswering('command-refused') });
    expect((await control.carry(PAUSE)).verdict).toBe('refused');
    expect(await control.carry(PAUSE)).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
  });
});

describe('forge-concurrency-set, carried by the API', () => {
  const SET_CONCURRENCY: GaiaCommand = { kind: 'forge-concurrency-set', trackerId: STOREFRONT_TRACKER_ID, limit: 3 };

  test('sends `concurrency-set` with the limit to the forge\'s Hephaestus', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    expect(await controlOver({ hephaestusFetch }).carry(SET_CONCURRENCY)).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'concurrency-set', limit: 3 }]);
  });

  test('passes Hephaestus\'s refusal code and sentence on unchanged', async () => {
    const verdict = await controlOver({ hephaestusFetch: hephaestusAnswering('command-refused') }).carry(SET_CONCURRENCY);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
  });

  test('sends nothing to a forge whose control contract Gaia does not know', async () => {
    expect(await controlOver({ forges: [exampleForgeOf({ state: 'counts-only' })] }).carry(SET_CONCURRENCY)).toEqual({ verdict: 'not-supported' });
  });

  test('answers unreachable and runs nothing for a dormant forge', async () => {
    expect(await controlOver({ forges: [exampleForgeOf({ state: 'dormant' })] }).carry(SET_CONCURRENCY)).toEqual({ verdict: 'unreachable' });
  });
});

describe('machine-agent-limit-set, carried by a live forge\'s API, else by the forge program', () => {
  const SET_MACHINE_LIMIT: GaiaCommand = { kind: 'machine-agent-limit-set', limit: 4 };

  test('sends `machine-agent-limit-set` to the live forge and runs no program', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const forges = [exampleForgeOf({ state: 'dormant' }), exampleForgeOf({ trackerId: WIKI_TRACKER_ID })];
    expect(await controlOver({ forges, hephaestusFetch }).carry(SET_MACHINE_LIMIT)).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'machine-agent-limit-set', limit: 4 }]);
    expect(hephaestusFetch.callsAnswered().map((call) => call.bearerToken)).toEqual([EXAMPLE_TOKEN]);
  });

  test('passes Hephaestus\'s refusal code and sentence on unchanged', async () => {
    const verdict = await controlOver({ hephaestusFetch: hephaestusAnswering('command-refused') }).carry(SET_MACHINE_LIMIT);
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedApiRefusal() });
  });

  test('runs `forge machine limit <n> --json` when no forge is live', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'dormant' })], processRun }).carry(SET_MACHINE_LIMIT);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['machine', 'limit', '4', '--json'])]);
  });

  test('runs the program when the live forge gives no answer', async () => {
    const hephaestusFetch = hephaestusAnswering('stopped');
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    expect(await controlOver({ hephaestusFetch, processRun }).carry(SET_MACHINE_LIMIT)).toEqual({ verdict: 'done' });
    expect(hephaestusFetch.callsAnswered()).toHaveLength(1);
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['machine', 'limit', '4', '--json'])]);
  });

  test('asks the next live forge when the first one\'s token file cannot be read', async () => {
    const hephaestusFetch = hephaestusAnswering('serving-every-contract');
    const forges = [exampleForgeOf({ tokenPath: join(scratchFolder, 'absent-token') }), exampleForgeOf({ trackerId: WIKI_TRACKER_ID })];
    expect(await controlOver({ forges, hephaestusFetch }).carry(SET_MACHINE_LIMIT)).toEqual({ verdict: 'done' });
    expect(sentBodiesOf(hephaestusFetch)).toEqual([{ kind: 'machine-agent-limit-set', limit: 4 }]);
  });

  test('runs the program when the one live forge\'s registry entry names no token file', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    expect(await controlOver({ forges: [exampleForgeOf({ tokenPath: null })], processRun }).carry(SET_MACHINE_LIMIT)).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['machine', 'limit', '4', '--json'])]);
  });

  test('sends nothing to a live forge whose control contract Gaia does not know, and sets the limit through the program', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'counts-only' })], processRun }).carry(SET_MACHINE_LIMIT);
    expect(verdict).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['machine', 'limit', '4', '--json'])]);
  });

  test('passes the program\'s refusal of a limit above the CPU count on unchanged', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-refused');
    const verdict = await controlOver({ forges: [exampleForgeOf({ state: 'dormant' })], processRun }).carry({ kind: 'machine-agent-limit-set', limit: 64 });
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedProgramRefusal(['machine', 'limit', '64', '--json']) });
  });

  test('runs the program of a forge whose repository is there, past one whose repository is gone', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const forges = [
      exampleForgeOf({ state: 'repository-missing', root: join(scratchFolder, 'gone') }),
      exampleForgeOf({ trackerId: WIKI_TRACKER_ID, state: 'dormant' }),
    ];
    expect(await controlOver({ forges, processRun }).carry(SET_MACHINE_LIMIT)).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toHaveLength(1);
  });

  test('refuses with no-forge-registered when no registered forge can carry it', async () => {
    expect(await controlOver({ forges: [] }).carry(SET_MACHINE_LIMIT)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'no-forge-registered' });
  });
});

describe('forge-add, carried by the forge program: init, then start', () => {
  function addingStorefront(): GaiaCommand {
    return { kind: 'forge-add', root: storefrontRoot, project: 'Example Project' };
  }

  test('runs `forge init` with the project name, then `forge start`, both in the repository root, and answers done', async () => {
    const recorded = recordedForgeProgramRunOf('every-verb-done');
    const workingDirectories: string[] = [];
    const processRun: ProcessRun = {
      run: async (request) => {
        workingDirectories.push(request.workingDirectory);
        return recorded.run(request);
      },
      startOwned:    (request) => recorded.startOwned(request),
      startDetached: (request) => recorded.startDetached(request),
    };
    const verdict = await controlOver({ forges: [], processRun, settingsStore: await settingsStoreNamingTheProgram() }).carry(addingStorefront());
    expect(verdict).toEqual({ verdict: 'done' });
    expect(recorded.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, INIT_ARGUMENTS), runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, START_ARGUMENTS)]);
    expect(workingDirectories).toEqual([storefrontRoot, storefrontRoot]);
  });

  test('stops at a refused init, runs no start, and passes the refusal on unchanged', async () => {
    const processRun = forgeProgramRunOfAddStages('every-verb-refused', 'every-verb-done');
    const verdict = await controlOver({ forges: [], processRun, settingsStore: await settingsStoreNamingTheProgram() }).carry(addingStorefront());
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedProgramRefusal(INIT_ARGUMENTS) });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, INIT_ARGUMENTS)]);
  });

  test('passes a refused start on unchanged after the repository was initialized', async () => {
    const processRun = forgeProgramRunOfAddStages('every-verb-done', 'every-verb-refused');
    const verdict = await controlOver({ forges: [], processRun, settingsStore: await settingsStoreNamingTheProgram() }).carry(addingStorefront());
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'forge', ...recordedProgramRefusal(START_ARGUMENTS) });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, INIT_ARGUMENTS), runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, START_ARGUMENTS)]);
  });

  test('refuses with program-not-found and runs nothing when the settings name no forge program', async () => {
    const verdict = await controlOver({ forges: [] }).carry(addingStorefront());
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'program-not-found' });
  });
});

describe('forge-hide and forge-unhide, carried by Gaia\'s settings', () => {
  const HIDE: GaiaCommand = { kind: 'forge-hide', trackerId: STOREFRONT_TRACKER_ID };
  const UNHIDE: GaiaCommand = { kind: 'forge-unhide', trackerId: STOREFRONT_TRACKER_ID };

  test('hides a registered forge, keeps it hidden in the settings file, and answers nothing-to-do when it is hidden already', async () => {
    const settingsStore = settingsStoreInScratch();
    const control = controlOver({ settingsStore });
    expect(await control.carry(HIDE)).toEqual({ verdict: 'done' });
    expect(settingsStore.settings().hiddenTrackerIds).toEqual([STOREFRONT_TRACKER_ID]);
    expect((await new SettingsFile(scratchFolder).read()).settings.hiddenTrackerIds).toEqual([STOREFRONT_TRACKER_ID]);
    expect(await control.carry(HIDE)).toEqual({ verdict: 'nothing-to-do' });
  });

  test('refuses to hide a tracker id the registry does not hold', async () => {
    const verdict = await controlOver({}).carry({ kind: 'forge-hide', trackerId: 'example-unknown-0000' });
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'forge-not-registered' });
  });

  test('shows a hidden forge again, also one the registry no longer holds, and answers nothing-to-do for one not hidden', async () => {
    const settingsStore = settingsStoreInScratch();
    await settingsStore.change({ ...GAIA_SETTINGS_DEFAULTS, hiddenTrackerIds: [STOREFRONT_TRACKER_ID, WIKI_TRACKER_ID] });
    const control = controlOver({ forges: [], settingsStore });
    expect(await control.carry(UNHIDE)).toEqual({ verdict: 'done' });
    expect(settingsStore.settings().hiddenTrackerIds).toEqual([WIKI_TRACKER_ID]);
    expect(await control.carry(UNHIDE)).toEqual({ verdict: 'nothing-to-do' });
  });

  test('refuses with settings-newer-version and keeps a settings file newer than this Gaia', async () => {
    const settingsPath = settingsFilePathIn(scratchFolder);
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ version: 2 }));
    const settingsStore = settingsStoreInScratch();
    await settingsStore.load();
    expect(await controlOver({ settingsStore }).carry(HIDE)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'settings-newer-version' });
    expect(settingsStore.settings().hiddenTrackerIds).toEqual([]);
  });
});

describe('settings-set, carried by Gaia\'s settings', () => {
  test('writes the one key it names and leaves every other key as it was', async () => {
    const settingsStore = settingsStoreInScratch();
    const verdict = await controlOver({ settingsStore }).carry({ kind: 'settings-set', change: { key: 'theme', value: 'dark' } });
    expect(verdict).toEqual({ verdict: 'done' });
    expect((await new SettingsFile(scratchFolder).read()).settings).toEqual({ ...GAIA_SETTINGS_DEFAULTS, theme: 'dark' });
  });

  test('answers nothing-to-do and writes nothing when the key already holds the value', async () => {
    const settingsStore = settingsStoreInScratch();
    const verdict = await controlOver({ settingsStore }).carry({
      kind:   'settings-set',
      change: { key: 'notifications', value: { ...GAIA_SETTINGS_DEFAULTS.notifications, kinds: { ...GAIA_SETTINGS_DEFAULTS.notifications.kinds } } },
    });
    expect(verdict).toEqual({ verdict: 'nothing-to-do' });
    expect((await new SettingsFile(scratchFolder).read()).verdict).toBe('absent');
  });

  test('refuses with settings-unwritable when the settings cannot be written', async () => {
    writeFileSync(join(scratchFolder, '.gaia'), 'a file where the folder belongs');
    const verdict = await controlOver({ forges: [] }).carry({ kind: 'settings-set', change: { key: 'theme', value: 'dark' } });
    expect(verdict).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'settings-unwritable' });
  });

  test('a forge program set in the settings starts the next forge whose registry entry names none', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    const control = controlOver({ forges: [exampleForgeOf({ state: 'dormant', program: null })], processRun });
    expect(await control.carry({ kind: 'settings-set', change: { key: 'forgeProgramPath', value: EXAMPLE_FORGE_PROGRAM_PATH } })).toEqual({ verdict: 'done' });
    expect(await control.carry(START)).toEqual({ verdict: 'done' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['start', '--json'])]);
  });
});

describe('path-choose, carried by the system\'s chooser', () => {
  test('answers the chosen folder', async () => {
    const verdict = await controlOver({ pathChooserRun: recordedPathChooserRun() }).carry({ kind: 'path-choose', what: 'folder' });
    expect(verdict).toEqual({ verdict: 'path-chosen', path: RECORDED_CHOSEN_FOLDER });
  });

  test('answers nothing-to-do when the chooser was cancelled', async () => {
    expect(await controlOver({ pathChooserRun: recordedPathChooserRun() }).carry({ kind: 'path-choose', what: 'file' })).toEqual({ verdict: 'nothing-to-do' });
  });
});

describe('one command per repository being added, per machine limit and per chooser on its way', () => {
  test('refuses a second add of the same repository while the first runs, and carries an add of another', async () => {
    const { processRun, letThrough } = holdingFirstRun(recordedForgeProgramRunOf('every-verb-done'));
    const control = controlOver({ forges: [], processRun, settingsStore: await settingsStoreNamingTheProgram() });
    const addStorefront: GaiaCommand = { kind: 'forge-add', root: storefrontRoot, project: 'Example Project' };

    const firstAdd = control.carry(addStorefront);
    expect(await control.carry(addStorefront)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' });
    expect(await control.carry({ kind: 'forge-add', root: wikiRoot, project: 'Example Project' })).toEqual({ verdict: 'done' });

    letThrough();
    expect(await firstAdd).toEqual({ verdict: 'done' });
  });

  test('refuses a second machine limit while the first runs, and frees it after', async () => {
    const { processRun, letThrough } = holdingFirstRun(recordedForgeProgramRunOf('every-verb-done'));
    const control = controlOver({ forges: [exampleForgeOf({ state: 'dormant' })], processRun });
    const setMachineLimit: GaiaCommand = { kind: 'machine-agent-limit-set', limit: 4 };

    const firstLimit = control.carry(setMachineLimit);
    expect(await control.carry(setMachineLimit)).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' });

    letThrough();
    expect(await firstLimit).toEqual({ verdict: 'done' });
    expect(await control.carry(setMachineLimit)).toEqual({ verdict: 'done' });
  });

  test('refuses a second chooser while one is open, and leaves a forge command free', async () => {
    const { processRun, letThrough } = holdingFirstRun(recordedPathChooserRun());
    const control = controlOver({ pathChooserRun: processRun, hephaestusFetch: hephaestusAnswering('serving-every-contract') });

    const firstChoice = control.carry({ kind: 'path-choose', what: 'folder' });
    expect(await control.carry({ kind: 'path-choose', what: 'file' })).toEqual({ verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' });
    expect(await control.carry(PAUSE)).toEqual({ verdict: 'done' });

    letThrough();
    expect(await firstChoice).toEqual({ verdict: 'path-chosen', path: RECORDED_CHOSEN_FOLDER });
  });
});
