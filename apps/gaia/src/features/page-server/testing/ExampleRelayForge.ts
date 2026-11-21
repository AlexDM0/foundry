/**
 * Example Storefront as the board's relay specs reach it: the registry entry and the forge watch's reading of the forge the
 * `hephaestus-fetch-board` recording was taken from, at the supported forge version, its token file in a scratch folder, and the sources a
 * relay route reads it with over that recording's answers. Test-only.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';

import type { PresenceReportReading } from '../../../adapters/forge-api/PresenceIngestion.ts';
import { RECORDED_TRACKER_ID }        from '../../../adapters/forge-api/testing/BoardDocuments.ts';
import type { RegisteredForge }       from '../../../adapters/forge-registry/@types/RegisteredForge.ts';
import type { RegistryReading }       from '../../../adapters/forge-registry/RegistryFile.ts';
import { forgeClientOf }              from '../../../lib/forge-client/ForgeClient.ts';
import { SUPPORTED_FORGE_VERSION }    from '../../../lib/forge-client/constants/SupportedForgeVersions.ts';
import { WatchReadingUtil }           from '../../../services/utils/WatchReadingUtil.ts';
import type { ForgeReading }          from '../../../shared/@types/ForgeReading.ts';
import {
  recordedBoardAnswersOf,
  recordedHephaestusAnswersOf,
  recordedHephaestusFetch,
  type BoardSituation,
  type RecordedHephaestusFetch,
} from '../../../testing/RecordedAnswers.ts';
import type { ForgeAccessSources } from '../ForgeAccess.ts';

export const STOREFRONT_TRACKER_ID = RECORDED_TRACKER_ID;
export const STOREFRONT_URL = 'http://127.0.0.1:4951/';
export const EXAMPLE_FORGE_TOKEN = 'example-forge-token-0123456789abcdef';

export interface ExampleRelayForge {
  readonly entry:   RegisteredForge;
  readonly reading: ForgeReading;
}

export interface ExampleRelayForgeOptions {
  readonly fidelity?:  ForgeReading['fidelity'];
  readonly versions?:  ForgeReading['versions'];
  readonly tokenPath?: string | null;
}

/** Writes the forge's token file into `scratchFolder` and answers its path. */
export function exampleTokenFileIn(scratchFolder: string): string {
  const tokenPath = join(scratchFolder, 'hephaestus-token');
  writeFileSync(tokenPath, `${EXAMPLE_FORGE_TOKEN}\n`);
  return tokenPath;
}

/** A registered forge with a live Hephaestus and the watch's reading of it at the supported forge version. */
export function exampleRelayForgeOf(scratchFolder: string, tokenPath: string | null, options: ExampleRelayForgeOptions = {}): ExampleRelayForge {
  const entry: RegisteredForge = {
    trackerId:  STOREFRONT_TRACKER_ID,
    project:    'Example Storefront',
    root:       join(scratchFolder, 'example-storefront'),
    program:    null,
    hephaestus: {
      url: STOREFRONT_URL, processId: 48_107, startedAt: '2026-11-21T01:27:19.000Z', tokenPath: options.tokenPath === undefined ? tokenPath : options.tokenPath
    },
    lastCommand:   null,
    lastChangedAt: null,
    presence:      null,
  };
  const reading: ForgeReading = {
    ...WatchReadingUtil.dormantReadingOf(entry, null),
    fidelity:  options.fidelity ?? 'full',
    condition: 'live',
    url:       STOREFRONT_URL,
    versions:  options.versions === undefined ? { verdict: 'current', current: SUPPORTED_FORGE_VERSION, minimumSupported: { major: 1, minor: 0 } } : options.versions,
  };
  return { entry, reading };
}

/** `presenceReadingAfterNow` stands for the forge watch's presence reader; when not given, the watch follows no monitor of the forge. */
export function relaySourcesOver(
  forge: ExampleRelayForge,
  hephaestusFetch: RecordedHephaestusFetch,
  registry?: RegistryReading,
  presenceReadingAfterNow: (trackerId: string) => Promise<PresenceReportReading | null> = () => Promise.resolve(null),
): ForgeAccessSources {
  const registryReading: RegistryReading = registry ?? { verdict: 'readable', forges: [forge.entry] };
  return {
    readRegistry: () => Promise.resolve(registryReading),
    readings:     () => [forge.reading],
    presenceReadingAfterNow,
    forgeClient:  forgeClientOf({ hephaestusFetch }),
  };
}

/** The recorded answers of one board situation; `withCallShape` keeps those whose call shape passes. */
export function boardAnswering(situation: BoardSituation, withCallShape: (callShape: string) => boolean = () => true): RecordedHephaestusFetch {
  return recordedHephaestusFetch(recordedBoardAnswersOf(situation).filter(({ callShape }) => withCallShape(callShape)));
}

const BOARD_EVENT_ID_PATTERN = /\nid: ([^\n]+)\nevent: board\n/;

/** The id of the first board event the recorded board stream of `situation` carries, asked afresh or from a last event id. */
export function recordedBoardEventIdOf(situation: BoardSituation, asked: 'afresh' | 'from-a-last-event-id'): string {
  const callShape = `STREAM /api/v3/events with bearer${asked === 'afresh' ? '' : ' from a last event id'}`;
  const recorded = recordedBoardAnswersOf(situation).find((answer) => answer.callShape === callShape)?.answer;
  const boardEventId = recorded?.verdict === 'streaming' ? BOARD_EVENT_ID_PATTERN.exec(`\n${recorded.chunks.join('')}`)?.[1] : undefined;
  if (boardEventId === undefined) throw new Error(`The recorded stream ${callShape} carries no board event with an id.`);
  return boardEventId;
}

const STOPPED_FORGE_REQUEST_CALL_SHAPE = 'GET /api/v4/monitor with bearer';
const STOPPED_FORGE_STREAM_CALL_SHAPE = 'STREAM /api/v4/monitor/events with bearer';

/**
 * A stopped forge, which answers no path: the answers recorded for its monitor and its monitor's stream, given for each call shape named,
 * a request's or a stream's by the shape's own kind.
 */
export function stoppedForgeAnswering(callShapes: readonly string[]): RecordedHephaestusFetch {
  const stoppedAnswers = recordedHephaestusAnswersOf('stopped');
  const answerOf = (recordedShape: string) => {
    const recorded = stoppedAnswers.find(({ callShape }) => callShape === recordedShape);
    if (recorded === undefined) throw new Error(`The stopped situation holds no answer for ${recordedShape}.`);
    return recorded.answer;
  };
  return recordedHephaestusFetch(callShapes.map((callShape) => ({
    callShape,
    answer: answerOf(callShape.startsWith('STREAM ') ? STOPPED_FORGE_STREAM_CALL_SHAPE : STOPPED_FORGE_REQUEST_CALL_SHAPE),
  })));
}
