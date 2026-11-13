/**
 * The launcher-programs recordings: the example values every call shape is keyed by, in place of the paths, port and code of the launch
 * that was recorded, and the answer set of each situation of a launch. Test-only.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingPathOf,
  repositoryRoot,
} from '../../../testing/BoundaryRecordings.ts';
import { recordedProcessRun, type RecordedProcessRun, type RecordedRun } from '../../../testing/RecordedRuns.ts';
import type { FoundBrowser }                                             from '../BrowserFinder.ts';

export const LAUNCHER_PROGRAMS_RECORDING_NAME = 'launcher-programs';

/**
 * `server-down`: nothing answers on the port, so the launch starts the server and opens the splash. `server-up`: Gaia answers, so the
 * launch opens its page. `server-ends`: the server it starts ends before it answers, which a dialog says. `no-browser` and `port-held`:
 * the launch refuses in a dialog. `every-dialog`: the dialog of each refusal and failure, shown on its own.
 */
export const LAUNCH_SITUATIONS = ['server-down', 'server-up', 'server-ends', 'no-browser', 'port-held', 'every-dialog'] as const;

export type LaunchSituation = typeof LAUNCH_SITUATIONS[number];

export const EXAMPLE_PORT = 4790;
export const EXAMPLE_BUN_PROGRAM = '/Users/example/.bun/bin/bun';
export const EXAMPLE_MAIN_PATH = '/Users/example/gaia/src/Main.ts';
export const EXAMPLE_SPLASH_PAGE_PATH = '/Users/example/gaia/resources/page/loading.html';
export const EXAMPLE_PROFILE_FOLDER = '/Users/example/.gaia/browser-profile';
export const EXAMPLE_SESSION_CODE = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
export const EXAMPLE_THEME = 'dark';
export const EXAMPLE_BROWSER: FoundBrowser = { browser: 'chrome', program: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' };

const SITUATION_SEPARATOR = ': ';

export function launchCallShapeOf(situation: LaunchSituation, callShape: string): string {
  return `${situation}${SITUATION_SEPARATOR}${callShape}`;
}

/** The recorded runs of one situation, each call shape without its situation. */
export function recordedLauncherRunsOf(situation: LaunchSituation, operatingSystem: string = process.platform): readonly RecordedRun[] {
  const recordingPath = recordingPathOf(LAUNCHER_PROGRAMS_RECORDING_NAME, operatingSystem);
  const recordAgain   = `Record it with \`${recordCommandOf(LAUNCHER_PROGRAMS_RECORDING_NAME)}\`.`;
  let recordingText: string;
  try {
    recordingText = readFileSync(join(repositoryRoot(), recordingPath), 'utf8');
  } catch {
    throw new Error(`${LAUNCHER_PROGRAMS_RECORDING_NAME} has no recording for ${operatingSystem} at ${recordingPath}. ${recordAgain}`);
  }
  const reading = boundaryRecordingReadingOf(recordingText);
  if (reading.verdict === 'unreadable') throw new Error(`${recordingPath} is unreadable: ${reading.reason}. ${recordAgain}`);
  const situationPrefix = launchCallShapeOf(situation, '');
  return reading.recording.answers
    .filter(({ callShape }) => callShape.startsWith(situationPrefix))
    .map(({ callShape, answer }) => ({ callShape: callShape.slice(situationPrefix.length), answer }) as RecordedRun);
}

/** The process-run mock of one situation, with the dialog of every refusal and failure; it checks each answer fits its call shape. */
export function recordedLauncherProgramsOf(situation: LaunchSituation): RecordedProcessRun {
  const situationRuns = recordedLauncherRunsOf(situation);
  const answeredShapes = new Set(situationRuns.map(({ callShape }) => callShape));
  const dialogRuns = recordedLauncherRunsOf('every-dialog').filter(({ callShape }) => !answeredShapes.has(callShape));
  return recordedProcessRun([...situationRuns, ...dialogRuns]);
}
