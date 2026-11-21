/**
 * A scratch board folder and monitor folder for specs that spawn the Talos binary as Hephaestus does: the start file and its secret, the
 * spawn, a client attached with the secret, and readings of Talos's and each child's files. The monitor folder has a short scratch name of
 * its own, so an endpoint under a long temporary folder stays inside the bytes macOS allows. Test-only.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { DoneFrame, TalosFrame }            from '../lib/talos/@types/TalosFrame.ts';
import type { ChildLaunch }                      from '../lib/talos/ChildLaunch.ts';
import { type ChildRecord, childRecordOf }       from '../lib/talos/ChildRecord.ts';
import { type EventLogEntry, eventLogEntriesOf } from '../lib/talos/EventLog.ts';
import {
  childFilesOf,
  startFilePathOf,
  talosLogPathOf,
  talosRecordPathOf
} from '../lib/talos/TalosFiles.ts';
import { type TalosRecord, talosRecordOf }                         from '../lib/talos/TalosRecord.ts';
import { type TalosStartFile, talosStartFileTextOf }               from '../lib/talos/TalosStartFile.ts';
import { TALOS_PROTOCOL_VERSION, TALOS_START_FILE_FORMAT_VERSION } from '../lib/talos/constants/TalosProtocol.ts';
import { inheritedEnvironment }                                    from './InheritedEnvironment.ts';
import { nativePlatformPorts }                                     from './NativePlatformPorts.ts';
import { stopProcessesReachingInto }                               from './ProcessesInFolder.ts';
import { createScratchDirectory, removeScratchDirectory }          from './ScratchWorkspace.ts';
import { type TalosProtocolClient, connectProtocolClientToTalos }  from './TalosProtocolClient.ts';
import { firstValueOf }                                            from './WaitUntil.ts';

const TALOS_BINARY_PATH = new URL('../../talos.ts', import.meta.url).pathname;
const NEXT_PROTOCOL_PRELOAD_PATH = new URL('./TalosOfTheNextProtocolPreload.ts', import.meta.url).pathname;

export const SCRATCH_TALOS_SECRET = 'example-secret';
export const SCRATCH_TALOS_CODE_VERSION = 'code-example';

/** Short bounds, so no spec waits out a production one; a spec passes its own where it measures one. */
const SCRATCH_TALOS_BOUNDS = {
  leaseMilliseconds:           60_000,
  renewalIntervalMilliseconds: 15_000,
  cleanQuitWaitMilliseconds:   10_000,
  tickMilliseconds:            50,
  tickGapMilliseconds:         200,
} as const;

export type SpawnedTalos = Bun.Subprocess<'ignore', 'pipe', 'pipe'>;

/** A spawned Talos with one attached client, which numbers the frames it sends. */
export interface ServingTalos {
  readonly talos:       SpawnedTalos;
  readonly client:      TalosProtocolClient;
  /** Sends the frame with the next frame id and answers its `done`. */
  readonly send:        (frame: object) => Promise<DoneFrame>;
  /** Sends the frame with the next frame id and answers that id, waiting for nothing. */
  readonly sendAndGoOn: (frame: object) => number;
  /** Quits Talos cleanly and answers its exit code. */
  readonly quit:        () => Promise<number>;
}

export interface ScratchTalos {
  readonly boardFolder:                 string;
  /** The monitor folder its endpoints are drawn under, short enough for every platform's limit. */
  readonly monitorFolder:               string;
  readonly endpointOf:                  (startNumber: number) => string;
  readonly writeStartFile:              (startNumber: number, bounds?: Partial<TalosStartFile>) => void;
  readonly spawnTalos:                  (startNumber: number) => SpawnedTalos;
  /** A Talos serving the protocol version after this checkout's, as one started from another program on disk. */
  readonly spawnTalosOfTheNextProtocol: (startNumber: number) => SpawnedTalos;
  /** Connected, with nothing sent. */
  readonly connect:                     (startNumber: number) => Promise<TalosProtocolClient>;
  /** Connected, with a `hello` of the given protocol and the secret sent and its `welcome` received. */
  readonly attach:                      (startNumber: number) => Promise<TalosProtocolClient>;
  /** Its start file written with the bounds given, Talos spawned and a client attached. */
  readonly serve:                       (startNumber: number, bounds?: Partial<TalosStartFile>) => Promise<ServingTalos>;
  /** A line launch of `bun -e <childScript>`, run in the board folder with the spec run's environment. */
  readonly lineLaunch:                  (childFolder: string, instance: number, childScript: string, changes?: Partial<ChildLaunch>) => ChildLaunch;
  readonly talosRecordOf:               (startNumber: number) => TalosRecord | null;
  readonly childRecordOf:               (childFolder: string, instance: number) => ChildRecord | null;
  /** The child's record once it reads `ended`, within the wait budget. */
  readonly endedRecordOf:               (childFolder: string, instance: number) => Promise<ChildRecord>;
  readonly eventsOf:                    (childFolder: string, instance: number) => readonly EventLogEntry[];
  readonly talosLogOf:                  (startNumber: number) => string;
  /** Talos's exit code within the wait budget; a Talos that does not exit fails the case with its log and record. */
  readonly exitCodeOf:                  (talos: SpawnedTalos, startNumber: number) => Promise<number>;
  /** Stops Talos and every child left in the board folder, then removes both folders. */
  readonly remove:                      () => Promise<void>;
}

function textOrAbsence(filePath: string): string {
  return existsSync(filePath) ? JSON.stringify(readFileSync(filePath, 'utf8')) : 'absent';
}

export function createScratchTalos(): ScratchTalos {
  const boardFolder = createScratchDirectory('talos');
  const monitorFolder = createScratchDirectory('h');
  const endpoints = new Map<number, string>();
  // An adapter may draw a new endpoint each call, so one start number keeps the first it was answered, as a start file does.
  const endpointOf = (startNumber: number): string => {
    const endpoint = endpoints.get(startNumber) ?? nativePlatformPorts().localEndpoint.endpointOf({
      monitorFolder, trackerId: 'tracker-example', name: 'talos', instance: startNumber
    });
    endpoints.set(startNumber, endpoint);
    return endpoint;
  };
  const connect = (startNumber: number): Promise<TalosProtocolClient> => connectProtocolClientToTalos(endpointOf(startNumber));
  const childRecordAt = (childFolder: string, instance: number): ChildRecord | null => {
    const { recordPath } = childFilesOf(boardFolder, childFolder, instance);
    if (!existsSync(recordPath)) return null;
    const reading = childRecordOf(readFileSync(recordPath, 'utf8'));
    return reading.verdict === 'read' ? reading.record : null;
  };
  const talosLogOf = (startNumber: number): string => textOrAbsence(talosLogPathOf(boardFolder, startNumber));
  const writeStartFile = (startNumber: number, bounds: Partial<TalosStartFile> = {}): void => {
    const secretFilePath = join(monitorFolder, `talos-${startNumber}.secret`);
    writeFileSync(secretFilePath, SCRATCH_TALOS_SECRET);
    const startFile: TalosStartFile = {
      formatVersion: TALOS_START_FILE_FORMAT_VERSION,
      startNumber,
      boardFolder,
      endpoint:      endpointOf(startNumber),
      secretFilePath,
      codeVersion:   SCRATCH_TALOS_CODE_VERSION,
      ...SCRATCH_TALOS_BOUNDS,
      ...bounds,
    };
    const startFilePath = startFilePathOf(boardFolder, startNumber);
    mkdirSync(dirname(startFilePath), { recursive: true });
    writeFileSync(startFilePath, talosStartFileTextOf(startFile));
  };
  const spawnTalosWith = (preloadArguments: readonly string[], startNumber: number): SpawnedTalos => Bun.spawn(
    [process.execPath, ...preloadArguments, TALOS_BINARY_PATH, boardFolder, String(startNumber)],
    {
      stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: inheritedEnvironment()
    },
  );
  const spawnTalos = (startNumber: number): SpawnedTalos => spawnTalosWith([], startNumber);
  const attach = async (startNumber: number): Promise<TalosProtocolClient> => {
    const client = await connect(startNumber);
    client.send({ kind: 'hello', requiredProtocolVersion: TALOS_PROTOCOL_VERSION, secret: SCRATCH_TALOS_SECRET });
    await client.nextFrame((frame) => frame.kind === 'welcome');
    return client;
  };
  const exitCodeOf = (talos: SpawnedTalos, startNumber: number): Promise<number> => {
    // `exitCode` stays null for a Talos a signal ended; `exited` answers for both.
    let exitCode: number | undefined;
    void talos.exited.then((code) => {
      exitCode = code;
    });
    return firstValueOf(() => exitCode, () => `Talos exiting; its log: ${talosLogOf(startNumber)}; its record: ${textOrAbsence(talosRecordPathOf(boardFolder, startNumber))}`);
  };
  return {
    boardFolder,
    monitorFolder,
    endpointOf,
    writeStartFile,
    spawnTalos,
    spawnTalosOfTheNextProtocol: (startNumber) => spawnTalosWith([`--preload=${NEXT_PROTOCOL_PRELOAD_PATH}`], startNumber),
    connect,
    attach,
    serve:                       async (startNumber, bounds = {}) => {
      writeStartFile(startNumber, bounds);
      const talos = spawnTalos(startNumber);
      const client = await attach(startNumber);
      let lastFrameId = 0;
      const sendAndGoOn = (frame: object): number => {
        lastFrameId += 1;
        client.send({ ...frame, frameId: lastFrameId });
        return lastFrameId;
      };
      const send = async (frame: object): Promise<DoneFrame> => {
        const frameId = sendAndGoOn(frame);
        return await client.nextFrame((received: TalosFrame) => received.kind === 'done' && received.frameId === frameId) as DoneFrame;
      };
      return {
        talos,
        client,
        send,
        sendAndGoOn,
        quit: async () => {
          await send({ kind: 'quit', reason: 'restart' });
          return exitCodeOf(talos, startNumber);
        },
      };
    },
    lineLaunch: (childFolder, instance, childScript, changes = {}) => ({
      childFolder,
      instance,
      kind:                           'line',
      label:                          `example line ${childFolder}`,
      argv:                           [process.execPath, '-e', childScript],
      environment:                    inheritedEnvironment(),
      environmentFromTalos:           {},
      workingDirectory:               boardFolder,
      verbatimArguments:              false,
      standingReplies:                [],
      closingLine:                    null,
      endingPatterns:                 [],
      quitAtTurnEnd:                  null,
      treeStopAtEndGraceMilliseconds: null,
      timeBoundMilliseconds:          null,
      ...changes,
    }),
    talosRecordOf: (startNumber) => {
      const recordPath = talosRecordPathOf(boardFolder, startNumber);
      if (!existsSync(recordPath)) return null;
      const reading = talosRecordOf(readFileSync(recordPath, 'utf8'));
      return reading.verdict === 'read' ? reading.record : null;
    },
    childRecordOf: childRecordAt,
    endedRecordOf: (childFolder, instance) => firstValueOf(() => {
      const record = childRecordAt(childFolder, instance);
      return record?.state === 'ended' ? record : undefined;
    }, () => `the child ${childFolder}#${instance} ending; its record: ${textOrAbsence(childFilesOf(boardFolder, childFolder, instance).recordPath)}`),
    eventsOf: (childFolder, instance) => {
      const { eventLogPath } = childFilesOf(boardFolder, childFolder, instance);
      const reading = eventLogEntriesOf(existsSync(eventLogPath) ? readFileSync(eventLogPath, 'utf8') : '');
      return reading.verdict === 'read' ? reading.entries : [];
    },
    talosLogOf,
    exitCodeOf,
    remove: async () => {
      await stopProcessesReachingInto(boardFolder);
      removeScratchDirectory(boardFolder);
      removeScratchDirectory(monitorFolder);
    },
  };
}
