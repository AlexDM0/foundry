/**
 * Gaia whole, in one process, from the registry to the page: the forge watch, the fleet, forge-control and the page server, wired as
 * `gaia serve` wires them, over recorded answers of every forge and of the forge program, under a scratch home. The page's
 * side is what the page reads and sends: the session it buys, the `fleet` events it follows, the commands it posts.
 *
 * The flow: five forges appear, each in its own condition; the dormant Example Storefront is started and reads starting, then live; the
 * unreachable Invoice Service refuses a stop, in the forge's own words; the machine limit is lowered through the live forge, which then
 * reports it. Each forge answers from one answer set per stage of the flow, the forge program from one per stage, and every timer is fired
 * by hand, so nothing waits a real interval. W5.6 (notifications) is not built and not in it.
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

import packageManifest from '../package.json' with { type: 'json' };

import type { FleetDocument }                                                                        from '../page/@types/FleetDocument.ts';
import { createForgeProgram }                                                                        from './adapters/forge-program/ForgeProgram.ts';
import { EXAMPLE_FORGE_PROGRAM_PATH, RECORDING_NAME_OF_FORGE_PROGRAM_STAGE, type ForgeProgramStage } from './adapters/forge-program/testing/RecordedForgeProgram.ts';
import { RegistryFile, registryFilePathIn }                                                          from './adapters/forge-registry/RegistryFile.ts';
import { serverTokenPathIn }                                                                         from './adapters/gaia-files/ServerTokenFile.ts';
import { SettingsFile }                                                                              from './adapters/gaia-files/SettingsFile.ts';
import { createSettingsWriter }                                                                      from './adapters/gaia-files/SettingsWriter.ts';
import { createPathChooser }                                                                         from './adapters/path-chooser/PathChooser.ts';
import { fleetSnapshotOf }                                                                           from './features/fleet/FleetAssembly.ts';
import { createForgeControl }                                                                        from './features/forge-control/ForgeControl.ts';
import { startPageServer, type PageServer }                                                          from './features/page-server/PageServer.ts';
import { eventStreamParserOf, type ServerSentEvent }                                                 from './lib/event-stream/EventStreamParser.ts';
import { forgeClientOf }                                                                             from './lib/forge-client/ForgeClient.ts';
import type { OverseerFetch }                                                                        from './lib/forge-client/OverseerFetch.ts';
import { SUPPORTED_FORGE_VERSION }                                                                   from './lib/forge-client/constants/SupportedForgeVersions.ts';
import type { ProcessRun }                                                                           from './lib/process-run/ProcessRun.ts';
import { createFleetStore }                                                                          from './services/FleetStore.ts';
import { createForgeWatch, type ForgeWatch, type ForgeWatchIntervals }                               from './services/ForgeWatch.ts';
import { createSettingsStore }                                                                       from './services/SettingsStore.ts';
import { CONTRACT_VERSIONS }                                                                         from './shared/constants/ContractVersions.ts';
import { GAIA_SYSTEM_VERSION }                                                                       from './shared/constants/GaiaSystemVersions.ts';
import { manualTimers, type ManualTimers }                                                           from './testing/ManualTimers.ts';
import {
  recordedOverseerAnswersOf,
  recordedOverseerFetch,
  type OverseerSituation,
  type RecordedOverseerAnswer,
  type RecordedOverseerFetch,
} from './testing/RecordedAnswers.ts';
import { recordedProcessRun, recordedRunsOf, type RecordedProcessRun } from './testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }                   from './testing/ScratchRoot.ts';

/** Distinct delays, so the flow fires exactly the timers it means; none is ever waited out. */
const INTERVALS: ForgeWatchIntervals = {
  registryCheckIntervalMilliseconds:   1_000,
  streamReconnectIntervalMilliseconds: 2_000,
  summaryPollIntervalMilliseconds:     3_000,
  unreachableAfterFailedTries:         3,
};
const HEARTBEAT_MILLISECONDS = 4_000;
const SHORT_BOUND_MILLISECONDS = 200;

/** The CPU count of the machine the forge was recorded on, which its machine limit reads as until one is set, and the limit it was lowered to. */
const CPU_COUNT = 10;
const LOWERED_MACHINE_LIMIT = 4;
const READ_AT = '2026-11-12T13:19:30.000Z';
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';

/**
 * The forges of the flow. Example Storefront is the one a forge serving every contract was recorded as, Example Project the one a forge
 * before F1 was recorded as; the other three answer nothing or are never asked.
 */
const FORGES = {
  exampleStorefront: { trackerId: 'example-storefront-7c41', project: 'Example Storefront', overseerOrigin: 'http://127.0.0.1:4951' },
  exampleProject:    { trackerId: '712f8bdb-e7cf-48bc-86a5-2616d2cf935f', project: 'Example Project', overseerOrigin: 'http://127.0.0.1:54795' },
  invoiceService:    { trackerId: 'invoice-service-2b9e', project: 'Invoice Service', overseerOrigin: 'http://127.0.0.1:4957' },
  designSystem:      { trackerId: 'design-system-91c2', project: 'Design System', overseerOrigin: null },
  legacyImporter:    { trackerId: 'legacy-importer-0e7d', project: 'Legacy Importer', overseerOrigin: null },
} as const;

type FlowForge = keyof typeof FORGES;

function answersOf(situation: OverseerSituation, callShape: string | null = null): readonly RecordedOverseerAnswer[] {
  return recordedOverseerAnswersOf(situation).filter((answer) => callShape === null || answer.callShape === callShape);
}

/** What a watch asks a forge before anything else: its versions, then its identity. */
function identityAnswersOf(situation: OverseerSituation): readonly RecordedOverseerAnswer[] {
  return [...answersOf(situation, 'GET /api/versions'), ...answersOf(situation, 'GET /api/v1/identity')];
}

const STOREFRONT_STAGES = {
  starting: answersOf('starting'),
  /** Its stream gives one whole snapshot and breaks, so the watch opens it again on its interval; its control API takes a command. */
  live:     [
    ...identityAnswersOf('serving-every-contract'),
    ...answersOf('connection-broken'),
    ...answersOf('serving-every-contract', 'POST /api/v1/commands with bearer'),
  ],
  limitLowered: [
    ...identityAnswersOf('serving-every-contract'),
    ...answersOf('machine-limit-lowered'),
  ],
} as const;

/** One recorded answer set per stage of a forge; a stage's streams stay counted after the next stage begins. */
interface StagedOverseerFetch extends OverseerFetch {
  readonly enter:           (answers: readonly RecordedOverseerAnswer[]) => void;
  readonly jsonBodiesSent:  () => readonly (string | null)[];
  readonly streamsLeftOpen: () => number;
}

function stagedOverseerFetch(firstAnswers: readonly RecordedOverseerAnswer[]): StagedOverseerFetch {
  const stages: RecordedOverseerFetch[] = [recordedOverseerFetch(firstAnswers)];
  const currentStage = (): RecordedOverseerFetch => stages[stages.length - 1] ?? recordedOverseerFetch([]);
  return {
    request:         (overseerRequest) => currentStage().request(overseerRequest),
    openStream:      (streamRequest) => currentStage().openStream(streamRequest),
    enter:           (answers) => stages.push(recordedOverseerFetch(answers)),
    jsonBodiesSent:  () => stages.flatMap((stage) => stage.callsAnswered().map((call) => call.jsonBody)),
    streamsLeftOpen: () => stages.reduce((total, stage) => total + stage.streamsLeftOpen(), 0),
  };
}

/** Each forge's Overseer answers at its own address; a call to an address no forge of the flow holds fails the spec. */
function overseerFetchByAddress(forgeFetches: ReadonlyMap<string, StagedOverseerFetch>): OverseerFetch {
  function forgeFetchAt(overseerUrl: string): StagedOverseerFetch {
    const forgeFetch = forgeFetches.get(new URL(overseerUrl).origin);
    if (forgeFetch === undefined) throw new Error(`No forge of the flow answers at ${overseerUrl}.`);
    return forgeFetch;
  }
  return {
    request:    (overseerRequest) => forgeFetchAt(overseerRequest.overseerUrl).request(overseerRequest),
    openStream: (streamRequest) => forgeFetchAt(streamRequest.overseerUrl).openStream(streamRequest),
  };
}

/** The forge program's answers of one stage of the flow, then the next stage's. */
interface StagedProcessRun extends ProcessRun {
  readonly enter:              (stage: ForgeProgramStage) => void;
  readonly callShapesAnswered: () => readonly string[];
}

function stagedForgeProgramRun(firstStage: ForgeProgramStage): StagedProcessRun {
  const runOf = (stage: ForgeProgramStage): RecordedProcessRun => recordedProcessRun(recordedRunsOf(RECORDING_NAME_OF_FORGE_PROGRAM_STAGE[stage]));
  const stages: RecordedProcessRun[] = [runOf(firstStage)];
  const currentStage = (): RecordedProcessRun => stages[stages.length - 1] ?? runOf(firstStage);
  return {
    run:                (request) => currentStage().run(request),
    startOwned:         (request) => currentStage().startOwned(request),
    startDetached:      (request) => currentStage().startDetached(request),
    enter:              (stage) => stages.push(runOf(stage)),
    callShapesAnswered: () => stages.flatMap((stage) => stage.callShapesAnswered()),
  };
}

let home: string;
let timers: ManualTimers;
let forgeWatch: ForgeWatch | null;
let pageServer: PageServer | null;
let eventStreamAbort: AbortController | null;
let stopFollowingSettings: () => void;

beforeEach(() => {
  home                  = createScratchDirectory('whole-flow-home');
  timers                = manualTimers();
  forgeWatch            = null;
  pageServer            = null;
  eventStreamAbort      = null;
  stopFollowingSettings = () => undefined;
});

afterEach(async () => {
  eventStreamAbort?.abort();
  forgeWatch?.stop();
  stopFollowingSettings();
  await pageServer?.stop();
  removeScratchPath(home);
});

function repositoryRootOf(forge: FlowForge): string {
  return join(home, 'development', FORGES[forge].trackerId);
}

function tokenPathOf(forge: FlowForge): string {
  return join(home, '.forge-monitor', 'private', FORGES[forge].trackerId, 'token');
}

/**
 * What `forge init` and `forge start` write for a forge; an Overseer the registry names is one that runs or ran. Example Project's entry
 * names no token file, so Gaia reads it through its open summary.
 */
function registryEntryOf(forge: FlowForge, overseerIsNamed: boolean): Record<string, unknown> {
  const { project, overseerOrigin } = FORGES[forge];
  const overseer = overseerIsNamed && overseerOrigin !== null
    ? {
      url: `${overseerOrigin}/`, processId: 48_107, startedAt: '2026-11-12T09:12:00.000Z', tokenPath: forge === 'exampleProject' ? null : tokenPathOf(forge)
    }
    : null;
  return {
    project, root: repositoryRootOf(forge), program: EXAMPLE_FORGE_PROGRAM_PATH, overseer
  };
}

function writeRegistry(storefrontIsStarted: boolean): void {
  const projects = {
    [FORGES.exampleStorefront.trackerId]: registryEntryOf('exampleStorefront', storefrontIsStarted),
    [FORGES.exampleProject.trackerId]:    registryEntryOf('exampleProject', true),
    [FORGES.invoiceService.trackerId]:    registryEntryOf('invoiceService', true),
    [FORGES.designSystem.trackerId]:      registryEntryOf('designSystem', false),
    [FORGES.legacyImporter.trackerId]:    registryEntryOf('legacyImporter', false),
  };
  writeFileSync(registryFilePathIn(home), JSON.stringify({ version: 1, projects }));
}

/** Every repository is there but Legacy Importer's, and each forge that runs an Overseer has its token file. */
function writeTheMachine(): void {
  for (const forge of ['exampleStorefront', 'exampleProject', 'invoiceService', 'designSystem'] as const) mkdirSync(repositoryRootOf(forge), { recursive: true });
  for (const forge of ['exampleStorefront', 'invoiceService'] as const) {
    mkdirSync(join(tokenPathOf(forge), '..'), { recursive: true });
    writeFileSync(tokenPathOf(forge), `${EXAMPLE_TOKEN}\n`);
  }
  writeRegistry(false);
}

interface RunningGaia {
  readonly pageServer:      PageServer;
  readonly storefrontFetch: StagedOverseerFetch;
  readonly forgeFetches:    readonly StagedOverseerFetch[];
  readonly forgeProgramRun: StagedProcessRun;
}

/** Gaia wired as `gaia serve` wires it, over the flow's recorded forges, the forge program and the timers fired by hand. */
async function startGaia(): Promise<RunningGaia> {
  const registryPath = registryFilePathIn(home);
  const settingsStore = createSettingsStore({ settingsFile: new SettingsFile(home), settingsWriter: createSettingsWriter(home) });
  await settingsStore.load();
  const storefrontFetch = stagedOverseerFetch([]);
  const forgeFetches = new Map<string, StagedOverseerFetch>([
    [FORGES.exampleStorefront.overseerOrigin, storefrontFetch],
    [FORGES.exampleProject.overseerOrigin, stagedOverseerFetch(answersOf('serving'))],
    [FORGES.invoiceService.overseerOrigin, stagedOverseerFetch(answersOf('not-answering'))],
  ]);
  const forgeClient = forgeClientOf({
    overseerFetch:                 overseerFetchByAddress(forgeFetches),
    requestTimeoutMilliseconds:    SHORT_BOUND_MILLISECONDS,
    streamOpenTimeoutMilliseconds: SHORT_BOUND_MILLISECONDS,
  });
  const readRegistry = () => new RegistryFile(registryPath).read();
  let address = '';
  const watch = createForgeWatch({
    readRegistry,
    forgeClient,
    hiddenTrackerIds:  () => settingsStore.settings().hiddenTrackerIds,
    timers,
    now:               () => READ_AT,
    intervals:         INTERVALS,
    onReadingsChanged: () => publishSnapshot(),
  });
  forgeWatch = watch;
  const snapshotNow = () => fleetSnapshotOf({
    readings: watch.readings(),
    machine:  { cpuCount: CPU_COUNT },
    settings: settingsStore.settings(),
    gaia:     {
      gaiaVersion:       packageManifest.version,
      address,
      homeFolder:        home,
      registryPath,
      forgeProgramInUse: settingsStore.settings().forgeProgramPath,
      settingsFile:      settingsStore.fileState(),
      knownContracts:    {
        summary: CONTRACT_VERSIONS.forgeBoardSummary,
        monitor: CONTRACT_VERSIONS.forgeMonitor,
        control: CONTRACT_VERSIONS.forgeControl,
        embed:   CONTRACT_VERSIONS.forgeEmbedChannel,
      },
      versions: {
        systemVersion:         GAIA_SYSTEM_VERSION,
        supportedForgeVersion: SUPPORTED_FORGE_VERSION,
      },
    },
  });
  const fleetStore = createFleetStore(snapshotNow());

  function publishSnapshot(): void {
    fleetStore.publish(snapshotNow());
  }

  const forgeProgramRun = stagedForgeProgramRun('every-verb-done');
  const forgeControl = createForgeControl({
    readRegistry,
    readings:        watch.readings,
    forgeClient,
    forgeProgram:    createForgeProgram({ processRun: forgeProgramRun, settingsProgramPath: () => settingsStore.settings().forgeProgramPath }),
    settingsStore,
    pathChooser:     createPathChooser({ processRun: forgeProgramRun, workingDirectory: () => home, cancellation: new AbortController().signal }),
    lookAgain:       watch.lookAgain,
    outageEndingsOf: () => 0,
  });
  const startVerdict = await startPageServer({
    port:               0,
    homeDirectory:      home,
    fleetStore,
    forgeCounts:        () => ({ forgesRegistered: watch.watchedForgeCount(), forgesAnswered: watch.readings().length }),
    pageFiles:          () => Promise.resolve({ verdict: 'unbuildable', failure: 'the flow reads no page file' }),
    carryCommand:       forgeControl.carry,
    forgeAccessSources: {
      readRegistry, readings: watch.readings, presenceReadingAfterNow: watch.presenceReadingAfterNow, forgeClient
    },
    logBoardRelay:                 () => undefined,
    timers,
    now:                           () => READ_AT,
    processId:                     process.pid,
    heartbeatIntervalMilliseconds: HEARTBEAT_MILLISECONDS,
  });
  if (startVerdict.verdict !== 'serving') throw new Error(`Gaia's server did not start: ${JSON.stringify(startVerdict)}`);
  ({ pageServer } = startVerdict);
  address = pageServer.url.origin;
  stopFollowingSettings = settingsStore.subscribe(publishSnapshot);
  publishSnapshot();
  watch.start();
  return {
    pageServer, storefrontFetch, forgeFetches: [...forgeFetches.values()], forgeProgramRun
  };
}

/** The page's road in: the launcher's code bought with Gaia's token, spent for the session cookie the page sends from then on. */
async function sessionCookieOf(server: PageServer): Promise<string> {
  const token = await Bun.file(serverTokenPathIn(home)).text();
  const codeAnswer = await fetch(new URL('/api/session-codes', server.url), { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  const { code } = await codeAnswer.json() as { readonly code: string };
  const session = await fetch(new URL('/api/session', server.url), { method: 'POST', body: JSON.stringify({ code }) });
  return (session.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

interface FleetFollow {
  /** Settles with the fleet document last heard when it meets the claim, else the next one that does; the spec's own bound ends a wait that never does. */
  readonly untilFleet: (claim: (fleetDocument: FleetDocument) => boolean) => Promise<FleetDocument>;
}

/** The page's `GET /api/events`: every `fleet` event the page would hear, in order. */
async function followFleet(server: PageServer, cookie: string): Promise<FleetFollow> {
  eventStreamAbort = new AbortController();
  const response = await fetch(new URL('/api/events', server.url), { headers: { cookie }, signal: eventStreamAbort.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('The event stream has no body.');
  const decoder = new TextDecoder();
  const parser = eventStreamParserOf();
  const waiting: ServerSentEvent[] = [];
  let lastFleet: FleetDocument | null = null;

  async function nextFleet(): Promise<FleetDocument> {
    for (;;) {
      const event = waiting.shift();
      if (event?.eventName === 'fleet') return JSON.parse(event.data) as FleetDocument;
      if (event !== undefined) continue;
      const chunk = await reader?.read();
      if (chunk === undefined || chunk.done) throw new Error('The event stream ended before the fleet the flow waits for.');
      waiting.push(...parser.eventsOf(decoder.decode(chunk.value, { stream: true })));
    }
  }

  return {
    untilFleet: async (claim) => {
      if (lastFleet !== null && claim(lastFleet)) return lastFleet;
      for (;;) {
        lastFleet = await nextFleet();
        if (claim(lastFleet)) return lastFleet;
      }
    },
  };
}

async function sendCommand(server: PageServer, cookie: string, command: Record<string, unknown>): Promise<unknown> {
  const answer = await fetch(new URL('/api/commands', server.url), { method: 'POST', headers: { cookie }, body: JSON.stringify({ commandVersion: 3, ...command }) });
  return answer.json();
}

function conditionsOf(fleetDocument: FleetDocument): (readonly [string, string, string])[] {
  return fleetDocument.forges.map((forge) => [forge.project, forge.condition, forge.fidelity] as const);
}

function conditionOf(fleetDocument: FleetDocument, forge: FlowForge): string | undefined {
  return fleetDocument.forges.find((candidate) => candidate.trackerId === FORGES[forge].trackerId)?.condition;
}

describe('Gaia from the registry to the page', () => {
  test('five forges appear, one is started, one refuses a stop, and the machine limit is lowered', async () => {
    writeTheMachine();
    const gaia = await startGaia();
    const cookie = await sessionCookieOf(gaia.pageServer);
    const fleet = await followFleet(gaia.pageServer, cookie);

    const fiveForges = await fleet.untilFleet((fleetDocument) => fleetDocument.forges.length === 5);
    // Example Project, whose entry names no token file, is read through its summary only, and its Overseer reports itself paused.
    expect(conditionsOf(fiveForges)).toEqual([
      ['Example Storefront', 'dormant', 'dormant'],
      ['Example Project', 'paused', 'counts-only'],
      ['Invoice Service', 'unreachable', 'unreachable'],
      ['Design System', 'dormant', 'dormant'],
      ['Legacy Importer', 'missing', 'repository-missing'],
    ]);
    expect(fiveForges.figures.incompleteFor).toEqual([FORGES.exampleProject.trackerId, FORGES.invoiceService.trackerId]);

    const startAnswer = await sendCommand(gaia.pageServer, cookie, { kind: 'forge-start', trackerId: FORGES.exampleStorefront.trackerId });
    expect(startAnswer).toEqual({
      answerVersion: 3, outcome: 'done', refusal: null, text: null, forges: []
    });
    expect(gaia.forgeProgramRun.callShapesAnswered()).toEqual([`run ${JSON.stringify([EXAMPLE_FORGE_PROGRAM_PATH, 'start', '--json'])}`]);
    // The started forge names its Overseer in the registry, and answers that it is starting until its API is up.
    writeRegistry(true);
    gaia.storefrontFetch.enter(STOREFRONT_STAGES.starting);
    await timers.untilPending(INTERVALS.registryCheckIntervalMilliseconds);
    timers.fire(INTERVALS.registryCheckIntervalMilliseconds);
    await fleet.untilFleet((fleetDocument) => conditionOf(fleetDocument, 'exampleStorefront') === 'starting');
    gaia.storefrontFetch.enter(STOREFRONT_STAGES.live);
    await timers.untilPending(INTERVALS.streamReconnectIntervalMilliseconds);
    timers.fire(INTERVALS.streamReconnectIntervalMilliseconds);
    const started = await fleet.untilFleet((fleetDocument) => conditionOf(fleetDocument, 'exampleStorefront') === 'live');
    expect(started.forges[0]).toMatchObject({ fidelity: 'full', url: `${FORGES.exampleStorefront.overseerOrigin}/` });
    expect(started.figures.machineLimit).toBe(CPU_COUNT);

    gaia.forgeProgramRun.enter('every-verb-refused');
    const stopAnswer = await sendCommand(gaia.pageServer, cookie, { kind: 'forge-stop', trackerId: FORGES.invoiceService.trackerId, agents: 'keep' });
    expect(stopAnswer).toEqual({
      answerVersion: 3,
      outcome:       'refused',
      refusal:       'overseer-still-live',
      text:          'The Overseer at http://127.0.0.1:47213/ (process 48107) is still live after being asked to stop; its Baton was left as it is.',
      forges:        [],
    });

    const limitAnswer = await sendCommand(gaia.pageServer, cookie, { kind: 'machine-agent-limit-set', limit: LOWERED_MACHINE_LIMIT });
    expect(limitAnswer).toEqual({
      answerVersion: 3, outcome: 'done', refusal: null, text: null, forges: []
    });
    const commandsToTheStorefront = gaia.storefrontFetch.jsonBodiesSent().flatMap((jsonBody) => (jsonBody === null ? [] : [JSON.parse(jsonBody) as unknown]));
    expect(commandsToTheStorefront).toEqual([expect.objectContaining({ kind: 'machine-agent-limit-set', limit: LOWERED_MACHINE_LIMIT })]);
    // The forge reports its lowered limit in its next snapshot, on the stream the watch opens again.
    gaia.storefrontFetch.enter(STOREFRONT_STAGES.limitLowered);
    await timers.untilPending(INTERVALS.streamReconnectIntervalMilliseconds);
    timers.fire(INTERVALS.streamReconnectIntervalMilliseconds);
    const lowered = await fleet.untilFleet((fleetDocument) => fleetDocument.figures.machineLimit === LOWERED_MACHINE_LIMIT);
    expect(conditionsOf(lowered).map(([project, condition]) => [project, condition])).toEqual([
      ['Example Storefront', 'live'],
      ['Example Project', 'paused'],
      ['Invoice Service', 'unreachable'],
      ['Design System', 'dormant'],
      ['Legacy Importer', 'missing'],
    ]);

    expect(gaia.forgeProgramRun.callShapesAnswered()).toEqual([
      `run ${JSON.stringify([EXAMPLE_FORGE_PROGRAM_PATH, 'start', '--json'])}`,
      `run ${JSON.stringify([EXAMPLE_FORGE_PROGRAM_PATH, 'stop', '--json'])}`,
    ]);
    forgeWatch?.stop();
    eventStreamAbort?.abort();
    await gaia.pageServer.stop();
    pageServer = null;
    expect(gaia.forgeFetches.map((forgeFetch) => forgeFetch.streamsLeftOpen())).toEqual([0, 0, 0]);
    expect(timers.pendingDelays()).toEqual([]);
  });
});
