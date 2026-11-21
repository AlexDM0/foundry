/**
 * The one way a spec makes a DrivePass on a scratch tracker: a Baton of this process, the board's children through Talos's adapter over the
 * connection the spec hands, and the example wording, every other request field the spec's to set. A default spec hands the connection of
 * `src/testing/RecordedTalosStages.ts` and runs on the recorded git flow stages of `src/testing/RecordedGitFlow.ts`; a real-system spec
 * starts a scratch Talos with `startScratchBoardTalos`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import type { AgentAdapter }                                      from '../lib/agent-launch/AgentAdapter.ts';
import { createDarwinSeatbelt }                                   from '../lib/gate-confinement/DarwinSeatbelt.ts';
import type { GateConfinement }                                   from '../lib/gate-confinement/GateConfinement.ts';
import type { PlatformPorts }                                     from '../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                   from '../lib/process-identity/ProcessIdentity.ts';
import type { ChildLaunch }                                       from '../lib/talos/ChildLaunch.ts';
import { TALOS_PROTOCOL_VERSION }                                 from '../lib/talos/constants/TalosProtocol.ts';
import { Baton }                                                  from '../services/hephaestus/Baton.ts';
import { createDrivePass, type DrivePass, type DrivePassRequest } from '../services/hephaestus/DrivePass.ts';
import { hephaestusFilesIn }                                      from '../services/hephaestus/HephaestusFiles.ts';
import { createTalosChildren }                                    from '../services/hephaestus/TalosChildren.ts';
import { type TalosConnection, connectToTalos }                   from '../services/hephaestus/TalosConnection.ts';
import { createLineRunner }                                       from '../services/hephaestus/TalosLines.ts';
import {
  createTalosStartHold,
  ensureTalos,
  spawnTalos,
  TALOS_START_BOUNDS,
  TALOS_START_WAITS,
  type TalosStartBounds,
  type TalosStartContext,
  talosRecordAt
} from '../services/hephaestus/TalosStart.ts';
import { createLocalFilesBoardStore } from '../services/store/LocalFilesBoardStore.ts';
import type { LockHolder }            from '../services/tracker/GenerationLock.ts';
import { requireProgressFile }        from '../services/tracker/TrackerReader.ts';
import type { Workspace }             from '../services/tracker/Workspace.ts';
import { branchNamesOf }              from '../shared/BranchNames.ts';
import { lockTakerJudgingHoldersBy }  from './LockTakers.ts';
import { firstValueOf }               from './WaitUntil.ts';

interface ScratchDrivePassRequired {
  platformPorts:    PlatformPorts;
  workspace:        Workspace;
  agentAdapter:     AgentAdapter;
  monitorFolder:    string;
  mainLine:         string;
  /** The connection to the board's Talos, read at each act: the recorded stages' in a default spec, a scratch Talos's in a real-system one. */
  talosConnection:  () => TalosConnection | null;
  log:              (line: string) => void;
  /** The start stamp the Baton names, one no process had: `1` when absent. Starts a spec crashes at one generation differ by it. */
  batonStartStamp?: string;
}

export type ScratchDrivePassRequest = ScratchDrivePassRequired & Partial<DrivePassRequest>;

/** Each call is a Hephaestus start: a newer generation than the last one's. */
export function createScratchDrivePass(request: ScratchDrivePassRequest): DrivePass {
  const { hephaestusDirectory } = hephaestusFilesIn(request.workspace.trackerDirectory);
  mkdirSync(hephaestusDirectory, { recursive: true });
  // Only the start stamp differs from this process's identity, so the Baton reads as dead to a successor, a recorded answer of the process table.
  const ownBootIdentity = request.platformPorts.processSupervision.identityOf(process.pid)?.bootIdentity ?? 'example-boot';
  const acquisition = Baton.acquire(request.platformPorts, hephaestusDirectory, {
    processId:            process.pid,
    processStartStamp:    request.batonStartStamp ?? '1',
    bootIdentity:         ownBootIdentity,
    port:                 1,
    url:                  'http://127.0.0.1:1/',
    tokenFile:            join(hephaestusDirectory, 'token'),
    codeVersion:          'code-example',
    installVersion:       1,
    talosProtocolVersion: TALOS_PROTOCOL_VERSION,
  });
  if (acquisition.verdict !== 'acquired') throw new Error('the scratch Baton was not acquired');
  const codeVersion = request.codeVersion ?? 'code-example';
  const boardChildren = createTalosChildren({ boardFolder: request.workspace.trackerDirectory, platformPorts: request.platformPorts, connection: request.talosConnection });
  const now = request.now ?? (() => new Date('2026-09-18T20:11:03Z'));
  const holderIsGoneByProcessId = (holder: LockHolder): boolean => request.platformPorts.processSupervision.processIsGone(holder.processId);
  const defaults: Omit<DrivePassRequest, keyof ScratchDrivePassRequired> = {
    boardStore:            createLocalFilesBoardStore({ workspace: request.workspace, now, lockTaker: lockTakerJudgingHoldersBy(holderIsGoneByProcessId) }),
    now,
    formatStamp:           () => '2026-09-18T22:11:03+02:00',
    hephaestusDirectory,
    generation:            acquisition.generation,
    boardChildren,
    lineRunner:            createLineRunner(boardChildren, request.talosConnection),
    codeVersion,
    programCommand:        [process.execPath, join(import.meta.dir, '..', '..', 'agent-progress.ts')],
    inheritedEnvironment:  {},
    installVersionChanged: () => false,
    apiBillingKeyIsSet:    () => false,
    decisionWordingOf:     () => ({ questions: [], context: '' }),
    packageNeedWordingOf:  () => ({ title: 'Example need', body: '' }),
    dependentFixWordingOf: () => ({ title: 'Example fix', body: '' }),
    launchTextOf:          () => ({ firstMessage: 'Example first message', roleBrief: 'Example role' }),
    assistantChatTextOf:   (facts) => `Example chat ${facts.sequence}`,
    windDownMessage:       'Example wind-down message',
    resumeMessage:         'Example resume message',
    redHandoffMessageOf:   () => 'Example red handoff message',
    answerMessageOf:       (answer) => `Example answers ${JSON.stringify(answer)}`,
    setupMessageWordingOf: (message) => JSON.stringify(message),
    homeDirectory:         request.monitorFolder,
    branchNames:           branchNamesOf(null),
    onBatonTakenOver:      () => request.log('taken over'),
    onPassCrashed:         () => {
      request.log('crashed');
      return Promise.resolve();
    },
  };
  // Property by property, since a spread would read once an accessor a spec hooks a pass with.
  return createDrivePass(Object.defineProperties(defaults, Object.getOwnPropertyDescriptors(request)) as DrivePassRequest);
}

/** A board's real Talos for a real-system spec, started as Hephaestus starts it; `quit` ends it cleanly, pausing what still runs. */
export interface ScratchBoardTalos {
  readonly connection:   () => TalosConnection | null;
  /** The launch sent for the child of `childFolder`, an absolute folder, at `instance`, which a spec reads as Talos never stores it. */
  readonly launchOf:     (childFolder: string, instance: number) => ChildLaunch | null;
  /** The Talos's own process, as its record names it; `null` before it claimed. */
  readonly talos:        () => ProcessIdentity | null;
  /** Once the connection closed, starts the next Talos as Hephaestus's `ensureTalos` does, sweeping the lost one's orphans. */
  readonly ensureIfLost: () => Promise<void>;
  readonly quit:         () => Promise<void>;
}

export interface ScratchBoardTalosRequest {
  workspace:     Workspace;
  platformPorts: PlatformPorts;
  monitorFolder: string;
  log:           (line: string) => void;
  /** The lease and tick bounds the Talos is started with; absent, Hephaestus's own. A row that waits out a lease shortens it. */
  bounds?:       TalosStartBounds;
}

export async function startScratchBoardTalos(request: ScratchBoardTalosRequest): Promise<ScratchBoardTalos> {
  const boardFolder = request.workspace.trackerDirectory;
  const context: TalosStartContext = {
    boardFolder,
    monitorFolder:  request.monitorFolder,
    trackerId:      requireProgressFile(request.workspace).trackerId,
    codeVersion:    'code-example',
    repositoryRoot: request.workspace.rootDirectory,
    ports:          request.platformPorts,
    bounds:         request.bounds ?? TALOS_START_BOUNDS,
    waits:          TALOS_START_WAITS,
    connect:        connectToTalos,
    startTalos:     spawnTalos,
    hold:           createTalosStartHold(),
    log:            request.log,
  };
  const launches: ChildLaunch[] = [];
  let current: { connection: TalosConnection; startNumber: number } | null = null;
  let lost = false;
  const follow = async (): Promise<void> => {
    const availability = await ensureTalos(context);
    if (availability.verdict !== 'started' && availability.verdict !== 'attached') throw new Error(`the scratch Talos did not serve: ${JSON.stringify(availability)}`);
    const { connection, startNumber } = availability;
    current = { connection, startNumber };
    lost = false;
    connection.onClose(() => {
      if (current?.connection !== connection) return;
      current = null;
      lost = true;
    });
  };
  await follow();
  const launchKeepingConnection = (connection: TalosConnection): TalosConnection => ({
    ...connection,
    send: async (frame) => {
      if (frame.kind === 'launch') launches.push(frame.launch);
      return await connection.send(frame);
    },
  });
  return {
    connection:   () => (current === null ? null : launchKeepingConnection(current.connection)),
    launchOf:     (childFolder, instance) => launches.find((launch) => join(boardFolder, ...launch.childFolder.split('/')) === childFolder && launch.instance === instance) ?? null,
    talos:        () => (current === null ? null : talosRecordAt(boardFolder, current.startNumber)?.talos ?? null),
    ensureIfLost: async () => {
      if (lost) await follow();
    },
    quit: async () => {
      const connection = current?.connection;
      if (connection === undefined) return;
      await connection.send({ kind: 'quit', reason: 'restart' });
      await firstValueOf(() => (current === null ? true : undefined), 'the scratch Talos quitting');
    },
  };
}

/** `createDarwinSeatbelt` answering that a sandbox applies, so the real profile is written with no probe of `sandbox-exec`, on any platform. */
export function seatbeltThatApplies(): GateConfinement {
  return createDarwinSeatbelt({
    fileExists:      () => true,
    programSucceeds: () => true,
    writeFile:       (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
  });
}
