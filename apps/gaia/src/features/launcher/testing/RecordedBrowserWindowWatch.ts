/**
 * The browser-window-watch mock every launcher spec uses: it answers what was recorded from a real browser for one situation of its window, fails
 * the spec on a call with no answer, and keeps the real boundary's demands of an open channel and a navigation to a listed window. Test-only.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import type { ChildChannel } from '../../../lib/process-run/ProcessRun.ts';
import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingPathOf,
  repositoryRoot,
} from '../../../testing/BoundaryRecordings.ts';
import type {
  BrowserWindowWatch,
  NavigationAnswer,
  PageTarget,
  PageTargetsAnswer,
} from '../BrowserWindowWatch.ts';

/**
 * `window-open`: one window, the splash, is listed. `navigation-refused`: the window is listed and refuses a navigation.
 * `other-window-left`: the splash's window is closed, and the browser lists only another window on the same profile. `window-closed`: the
 * browser runs and lists no window. `browser-ended`: the browser is gone, and its pipe answers nothing.
 */
export const BROWSER_WINDOW_SITUATIONS = ['window-open', 'navigation-refused', 'other-window-left', 'window-closed', 'browser-ended'] as const;

export type BrowserWindowSituation = typeof BROWSER_WINDOW_SITUATIONS[number];

export type BrowserWindowCall = 'page targets' | 'navigate';

export const BROWSER_WINDOW_WATCH_RECORDING_NAME = 'browser-window-watch';

const SITUATION_SEPARATOR = ': ';

export interface RecordedBrowserWindowWatch {
  /** Takes the place of `browserWindowWatchOver`: the watch over one browser child's channel. */
  readonly watchOver:      (channel: ChildChannel) => BrowserWindowWatch;
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
  const listedTargetIds = new Set<string>();

  function recordedAnswerFor(call: BrowserWindowCall): unknown {
    const callShape = browserWindowCallShapeOf(situation, call);
    if (!answerByCallShape.has(callShape)) {
      const recordedShapes = [...answerByCallShape.keys()].map((recordedShape) => `  ${recordedShape}`).join('\n');
      throw new Error(`No recorded answer for ${callShape}. The recorded call shapes are:\n${recordedShapes}`);
    }
    callsAnswered.push(callShape);
    return answerByCallShape.get(callShape);
  }

  function watchOver(channel: ChildChannel): BrowserWindowWatch {
    let channelIsClosed = false;
    void channel.closed.then(() => {
      channelIsClosed = true;
    });
    const demandAnOpenChannel = (call: BrowserWindowCall): void => {
      if (channelIsClosed) throw new Error(`The window watch was asked for ${call} after its browser's channel had closed.`);
    };
    return {
      pageTargets: async () => {
        demandAnOpenChannel('page targets');
        const answer = recordedAnswerFor('page targets') as PageTargetsAnswer;
        if (answer.verdict === 'listed') for (const pageTarget of answer.pageTargets) listedTargetIds.add(pageTarget.targetId);
        return answer;
      },
      navigate: async (pageTarget: PageTarget, address: string) => {
        demandAnOpenChannel('navigate');
        if (!listedTargetIds.has(pageTarget.targetId)) throw new Error(`A navigation went to ${pageTarget.targetId}, which no listing held.`);
        const answer = recordedAnswerFor('navigate') as NavigationAnswer;
        navigations.push(address);
        return answer;
      },
    };
  }

  return {
    watchOver,
    enterSituation: (nextSituation) => {
      situation = nextSituation;
    },
    navigations:   () => [...navigations],
    callsAnswered: () => [...callsAnswered],
  };
}
