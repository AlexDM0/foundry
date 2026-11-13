/**
 * The browser-window-watch mock every launcher spec uses in place of the real boundary. It answers from the answers recorded from a real
 * browser for one situation of its window, which the spec moves on as the flow goes, and fails the spec on a call with no answer. It keeps
 * the real boundary's demands on the caller: a target list is asked at the port the profile names, and a navigation goes to a listed
 * window. Test-only.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingPathOf,
  repositoryRoot,
} from '../../../testing/BoundaryRecordings.ts';
import type {
  BrowserWindowWatch,
  DebuggingPortAnswer,
  NavigationAnswer,
  PageTarget,
  PageTargetsAnswer,
} from '../BrowserWindowWatch.ts';

/**
 * `browser-starting`: the profile names no port yet. `window-open`: one window, the splash, is listed. `window-closed`: the browser runs
 * and lists no window. `browser-ended`: the browser is gone, and its port answers nothing.
 */
export const BROWSER_WINDOW_SITUATIONS = ['browser-starting', 'window-open', 'window-closed', 'browser-ended'] as const;

export type BrowserWindowSituation = typeof BROWSER_WINDOW_SITUATIONS[number];

export type BrowserWindowCall = 'debugging port' | 'page targets' | 'navigate';

export const BROWSER_WINDOW_WATCH_RECORDING_NAME = 'browser-window-watch';

const SITUATION_SEPARATOR = ': ';

export interface RecordedBrowserWindowWatch extends BrowserWindowWatch {
  readonly enterSituation: (situation: BrowserWindowSituation) => void;
  /** Every address a window was navigated to, in order. */
  readonly navigations:    () => readonly string[];
  /** Every call answered so far, each led by the situation it was answered in. */
  readonly callsAnswered:  () => readonly string[];
}

export function browserWindowCallShapeOf(situation: BrowserWindowSituation, call: BrowserWindowCall): string {
  return `${situation}${SITUATION_SEPARATOR}${call}`;
}

function recordedAnswersByCallShape(operatingSystem: string): ReadonlyMap<string, unknown> {
  const recordingPath = recordingPathOf(BROWSER_WINDOW_WATCH_RECORDING_NAME, operatingSystem);
  const recordAgain   = `Record it with \`${recordCommandOf(BROWSER_WINDOW_WATCH_RECORDING_NAME)}\`.`;
  let recordingText: string;
  try {
    recordingText = readFileSync(join(repositoryRoot(), recordingPath), 'utf8');
  } catch {
    throw new Error(`${BROWSER_WINDOW_WATCH_RECORDING_NAME} has no recording for ${operatingSystem} at ${recordingPath}. ${recordAgain}`);
  }
  const reading = boundaryRecordingReadingOf(recordingText);
  if (reading.verdict === 'unreadable') throw new Error(`${recordingPath} is unreadable: ${reading.reason}. ${recordAgain}`);
  return new Map(reading.recording.answers.map(({ callShape, answer }) => [callShape, answer]));
}

export function recordedBrowserWindowWatch(firstSituation: BrowserWindowSituation, operatingSystem: string = process.platform): RecordedBrowserWindowWatch {
  const answerByCallShape = recordedAnswersByCallShape(operatingSystem);
  let situation = firstSituation;
  const navigations: string[]   = [];
  const callsAnswered: string[] = [];
  const answeredPorts = new Set<number>();
  const listedDebuggerAddresses = new Set<string>();

  function recordedAnswerFor(call: BrowserWindowCall): unknown {
    const callShape = browserWindowCallShapeOf(situation, call);
    if (!answerByCallShape.has(callShape)) {
      const recordedShapes = [...answerByCallShape.keys()].map((recordedShape) => `  ${recordedShape}`).join('\n');
      throw new Error(`No recorded answer for ${callShape}. The recorded call shapes are:\n${recordedShapes}`);
    }
    callsAnswered.push(callShape);
    return answerByCallShape.get(callShape);
  }

  return {
    debuggingPortIn: async () => {
      const answer = recordedAnswerFor('debugging port') as DebuggingPortAnswer;
      if (answer.verdict === 'written') answeredPorts.add(answer.debuggingPort);
      return answer;
    },
    pageTargetsAt: async (debuggingPort) => {
      if (!answeredPorts.has(debuggingPort)) throw new Error(`The page targets were asked at port ${debuggingPort}, which no profile named.`);
      const answer = recordedAnswerFor('page targets') as PageTargetsAnswer;
      if (answer.verdict === 'listed') for (const pageTarget of answer.pageTargets) listedDebuggerAddresses.add(pageTarget.debuggerAddress);
      return answer;
    },
    navigate: async (pageTarget: PageTarget, address: string) => {
      if (!listedDebuggerAddresses.has(pageTarget.debuggerAddress)) throw new Error(`A navigation went to ${pageTarget.debuggerAddress}, which no listing held.`);
      const answer = recordedAnswerFor('navigate') as NavigationAnswer;
      navigations.push(address);
      return answer;
    },
    enterSituation: (nextSituation) => {
      situation = nextSituation;
    },
    navigations:   () => [...navigations],
    callsAnswered: () => [...callsAnswered],
  };
}
