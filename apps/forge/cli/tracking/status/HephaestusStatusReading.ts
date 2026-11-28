/**
 * The process facts `status` prints above the board: the Hephaestus lock, the stored pause, the code on disk against the live one's, the notices and
 * presence, with the lines that word them. Read-only and lockless; the live Hephaestus's Hephaestus lock says which code it runs.
 */
import type { TrackerProgress }                                   from '../../../src/domain/tracker-model/@types/TrackerProgress.ts';
import { readingBoardOf }                                         from '../../../src/domain/tracker-model/ReadingBoard.ts';
import { CodeVersion }                                            from '../../../src/services/hephaestus/CodeVersion.ts';
import { hephaestusFilesIn }                                      from '../../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock, type HephaestusLockRecord }              from '../../../src/services/hephaestus/HephaestusLock.ts';
import { PresenceStatus, type CrashReading, type StatusPresence } from '../../../src/services/hephaestus/PresenceStatus.ts';
import type { RestartFailure }                                    from '../../../src/services/hephaestus/Restart.ts';
import type { Workspace }                                         from '../../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                          from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                                    from '../../CommandContext.ts';
import { HephaestusNoticeWording, type ServedHephaestusNotice }   from '../../HephaestusNoticeWording.ts';
import { HephaestusRemote }                                       from '../../HephaestusRemote.ts';
import { PresenceWording }                                        from './PresenceWording.ts';

/** The `hephaestus` block of `status --json`. `state` is the live Hephaestus's runtime state, `serving` or `starting` when it names none, or `down`. */
export interface HephaestusStatusFacts {
  state:               string;
  paused:              boolean;
  url:                 string | null;
  hephaestusLock:      ({ generation: number } & HephaestusLockRecord) | null;
  codeVersionOnDisk:   string;
  codeVersionInMemory: string | null;
  notices:             ServedHephaestusNotice[];
  restartWarning:      RestartFailure | null;
  presence:            StatusPresence;
}

export interface HephaestusStatusReading {
  facts: HephaestusStatusFacts;
  /** Set only while the forge is off after a crash. */
  crash: CrashReading | null;
}

/** What `status` reads of the live Hephaestus's state document; anything it does not recognise reads as no document. */
interface HephaestusStateReading {
  runtimeState:   string;
  notices:        ServedHephaestusNotice[];
  restartWarning: RestartFailure | null;
}

function hephaestusStateOf(document: unknown): HephaestusStateReading | null {
  if (typeof document !== 'object' || document === null) return null;
  const { hephaestus, notices } = document as { hephaestus?: unknown; notices?: unknown };
  if (typeof hephaestus !== 'object' || hephaestus === null || !Array.isArray(notices)) return null;
  const { state: runtimeState, restartWarning } = hephaestus as { state?: unknown; restartWarning?: unknown };
  if (typeof runtimeState !== 'string') return null;
  return { runtimeState, notices: notices as ServedHephaestusNotice[], restartWarning: (restartWarning ?? null) as RestartFailure | null };
}

export async function readHephaestusStatus(context: CommandContext, workspace: Workspace, progress: TrackerProgress): Promise<HephaestusStatusReading> {
  const files           = hephaestusFilesIn(workspace.trackerDirectory);
  const newest          = HephaestusLock.newestOf(context.platformPorts, files.hephaestusDirectory);
  const live            = newest.verdict === 'live' ? newest : null;
  const stateDocument   = live === null ? null : hephaestusStateOf(await HephaestusRemote.stateOf(live.record));
  const answeringState  = async (record: HephaestusLockRecord): Promise<string> => (await HephaestusRemote.identityAnswers(record) ? 'serving' : 'starting');
  const state           = live === null ? 'down' : stateDocument?.runtimeState ?? await answeringState(live.record);
  const presenceReading = PresenceStatus.readingOf(
    { ports: context.platformPorts, files, workspace },
    live === null ? null : { generation: live.generation, answersAlready: state !== 'starting' },
  );
  return {
    facts: {
      state,
      paused:              readingBoardOf(progress, [], []).hephaestusState() === 'paused',
      url:                 live?.record.url ?? null,
      hephaestusLock:      live === null ? null : { generation: live.generation, ...live.record },
      codeVersionOnDisk:   CodeVersion.onDisk(),
      codeVersionInMemory: live?.record.codeVersion ?? null,
      notices:             stateDocument?.notices ?? [],
      restartWarning:      stateDocument?.restartWarning ?? null,
      presence:            presenceReading.presence,
    },
    crash: presenceReading.crash,
  };
}

/** Down, the crash it stays off after comes first, with its log's path; live, where it serves and what it runs. */
export function hephaestusStatusTextOf({ facts, crash }: HephaestusStatusReading): string {
  const pausedText = facts.paused ? 'paused' : 'not paused';
  const { hephaestusLock, codeVersionOnDisk } = facts;
  if (hephaestusLock === null) {
    return [
      ...(crash === null ? [] : [PresenceWording.offAfterACrashLineOf(crash, facts.presence.crashLog)]),
      `hephaestus: down; ${pausedText}`,
      `code on disk: ${codeVersionOnDisk}`,
    ].join('\n');
  }
  const newCodeAdvice = hephaestusLock.codeVersion === codeVersionOnDisk ? '' : ` (new code: run \`${PRODUCT_NAMES.PROGRAM} update\`)`;
  return [
    `hephaestus: ${facts.state} at ${hephaestusLock.url}, process ${hephaestusLock.processId}, Hephaestus lock ${hephaestusLock.generation}; ${pausedText}`,
    `code on disk: ${codeVersionOnDisk}; in memory: ${hephaestusLock.codeVersion}${newCodeAdvice}`,
    ...PresenceWording.livePresenceLinesOf(facts.presence),
    ...facts.notices.map((notice) => `notice: ${HephaestusNoticeWording.noticeTextOf(notice)}`),
    ...(facts.restartWarning === null ? [] : [`warning: ${HephaestusNoticeWording.restartWarningTextOf(facts.restartWarning)}`]),
  ].join('\n');
}
