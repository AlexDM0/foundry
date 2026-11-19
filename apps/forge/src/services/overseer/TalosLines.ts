/**
 * The Overseer's own lines as line children of Talos: a `LineRunner` that launches a line through `BoardChildren` and waits for its end,
 * woken by the `state` frame of its child and, as a fallback, by a look at its record on a schedule; and the stop of every live line under
 * a folder, which a run's owner sends when it stops and the next Overseer sends for the lines an earlier one left running.
 */
import { type Dirent, readdirSync } from 'node:fs';
import { join }                     from 'node:path';

import type { FrameRefusalReason }      from '../../lib/talos/@types/TalosFrame.ts';
import type { ChildEnd }                from '../../lib/talos/ChildRecord.ts';
import type { EventLogEntry }           from '../../lib/talos/EventLog.ts';
import { TALOS_LINE_LOOK_MILLISECONDS } from '../../shared/constants/OverseerLimits.ts';
import type { LineRunEnd, LineRunner }  from '../lifecycle/GateRun.ts';
import type { BoardChildren }           from './BoardChildren.ts';
import type { TalosConnection }         from './TalosConnection.ts';

/** A live line found under a folder. */
export interface LiveLine {
  childFolder: string;
  instance:    number;
}

export interface LineStopWaits {
  lookMilliseconds: number;
  /** How many looks the stop waits for every line's end at most; a line still live after them is left to Talos. */
  looks:            number;
}

const LEFTOVER_LINE_END_LOOKS = 30;

export const LINE_STOP_WAITS: LineStopWaits = Object.freeze({ lookMilliseconds: TALOS_LINE_LOOK_MILLISECONDS, looks: LEFTOVER_LINE_END_LOOKS });

const CHILD_RECORD_FILE_PATTERN = /^child-[1-9]\d*\.json$/;
const FIRST_LINE_INSTANCE = 1;
const STOP_AT_ONCE_GRACE_MILLISECONDS = 0;

const UNAVAILABLE_END: LineRunEnd = Object.freeze({
  exitCode: null, signalCode: null, endReason: 'talos-unavailable', output: '', runMilliseconds: 0
});

/** Talos refused the launch frame: the line never ran, as with no Talos, and its output names the refusal. */
function refusedEndOf(reason: FrameRefusalReason): LineRunEnd {
  return { ...UNAVAILABLE_END, output: `Talos refused to launch the line: ${reason}.\n` };
}

/** A line its owner stopped before it launched: it never ran, so nothing judges it but as stopped. */
const STOPPED_BEFORE_LAUNCH_END: LineRunEnd = Object.freeze({
  exitCode: null, signalCode: null, endReason: 'signalled', output: '', runMilliseconds: 0
});

function signalIsAborted(stopSignal: AbortSignal | undefined): boolean {
  return stopSignal?.aborted === true;
}

function agentLinesOf(entries: readonly EventLogEntry[] | 'malformed'): string[] {
  return entries === 'malformed' ? [] : entries.filter((entry) => entry.origin === 'agent').map((entry) => entry.line);
}

/** A line that never exited by itself reports no exit code, and one stopped at its time bound no signal either, so it reads as never run. */
function lineRunEndOf(end: ChildEnd, output: string): LineRunEnd {
  return {
    exitCode:        end.reason === 'exited' ? end.exitCode : null,
    signalCode:      end.reason === 'time-bound' ? null : end.signal,
    endReason:       end.reason,
    output,
    runMilliseconds: end.runMilliseconds,
  };
}

/** Every folder at or below `folder` that holds a child record; a folder that cannot be read holds none. */
function childFoldersUnder(folder: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const ownRecord = entries.some((entry) => entry.isFile() && CHILD_RECORD_FILE_PATTERN.test(entry.name));
  const below = entries.filter((entry) => entry.isDirectory()).flatMap((entry) => childFoldersUnder(join(folder, entry.name)));
  return ownRecord ? [folder, ...below] : below;
}

/** The newest instance of every child folder at or below `folder` whose child is live. */
export function liveLinesUnder(children: BoardChildren, folder: string): LiveLine[] {
  return childFoldersUnder(folder).flatMap((childFolder) => {
    const instance = children.newestInstanceIn(childFolder);
    if (instance === null || children.livenessOf(childFolder, instance).verdict !== 'live') return [];
    return [{ childFolder, instance }];
  });
}

/** Sends `stop` with grace 0 to every live line under `folder` and waits, look by look, until none is live or the looks ran out. */
export async function stopLiveLinesUnder(children: BoardChildren, folder: string, waits: LineStopWaits = LINE_STOP_WAITS): Promise<void> {
  children.beginPass();
  const liveLines = liveLinesUnder(children, folder);
  await Promise.all(liveLines.map((line) => children.stop(line.childFolder, line.instance, STOP_AT_ONCE_GRACE_MILLISECONDS)));
  for (let look = 0; look < waits.looks; look += 1) {
    children.beginPass();
    if (liveLinesUnder(children, folder).length === 0) return;
    await Bun.sleep(waits.lookMilliseconds);
  }
}

export function createLineRunner(
  children: BoardChildren,
  connection: () => TalosConnection | null,
  lookMilliseconds: number = TALOS_LINE_LOOK_MILLISECONDS,
): LineRunner {
  const lookNowByChildId = new Map<string, () => void>();
  const listenedConnections = new WeakSet<TalosConnection>();

  /** One `state` listener per connection, which wakes the run waiting on the child the frame names. */
  function listenToTheCurrentConnection(): void {
    const current = connection();
    if (current === null || listenedConnections.has(current)) return;
    listenedConnections.add(current);
    current.onState((frame) => {
      if (frame.state === 'ended') lookNowByChildId.get(frame.childId)?.();
    });
  }

  return async (request) => {
    const { childFolder, stopSignal } = request;
    if (signalIsAborted(stopSignal)) return STOPPED_BEFORE_LAUNCH_END;
    const instance = (children.newestInstanceIn(childFolder) ?? FIRST_LINE_INSTANCE - 1) + 1;
    listenToTheCurrentConnection();
    const launched = await children.launchLine({
      childFolder,
      instance,
      label:                 request.label,
      workingDirectory:      request.directory,
      argv:                  request.argv,
      verbatimArguments:     request.verbatimArguments,
      environment:           request.environment,
      timeBoundMilliseconds: request.timeBoundMilliseconds,
    });
    if (launched.verdict === 'talos-unavailable') return UNAVAILABLE_END;
    if (launched.verdict === 'refused') return refusedEndOf(launched.reason);
    const stopAtOnce = (): void => {
      void children.stop(childFolder, instance, STOP_AT_ONCE_GRACE_MILLISECONDS);
    };
    // The owner may have stopped the run while the launch frame was on its way.
    if (signalIsAborted(stopSignal)) stopAtOnce();
    stopSignal?.addEventListener('abort', stopAtOnce, { once: true });
    const childId = children.recordOf(childFolder, instance)?.childId ?? null;
    let lastSequence = 0;

    function handOnNewOutput(): void {
      const entries = children.eventsAfter(childFolder, instance, lastSequence);
      if (entries === 'malformed') return;
      for (const entry of entries) {
        lastSequence = Math.max(lastSequence, entry.sequence);
        if (entry.origin === 'agent') request.onOutputLine?.(entry.line);
      }
    }

    const end = await new Promise<ChildEnd | 'lost'>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const look = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        listenToTheCurrentConnection();
        handOnNewOutput();
        const liveness = children.livenessOf(childFolder, instance);
        // A launch Talos took but never recorded is lost once the connection to that Talos is gone.
        const recordNeverCame = liveness.verdict === 'unlaunched' && connection() === null;
        if (liveness.verdict === 'ended' || liveness.verdict === 'lost' || recordNeverCame) {
          if (childId !== null) lookNowByChildId.delete(childId);
          resolve(liveness.verdict === 'ended' ? liveness.end : 'lost');
          return;
        }
        timer = setTimeout(look, lookMilliseconds);
      };
      if (childId !== null) lookNowByChildId.set(childId, look);
      look();
    });
    stopSignal?.removeEventListener('abort', stopAtOnce);
    if (end === 'lost') return UNAVAILABLE_END;
    const output = agentLinesOf(children.eventsAfter(childFolder, instance, 0)).map((line) => `${line}\n`).join('');
    return lineRunEndOf(end, output);
  };
}
