/**
 * The process facts `status` prints above the board: the Baton, the stored pause, the code on disk against the live Hephaestus's, the notices and
 * presence, with the lines that word them. Read-only and lockless; the live Hephaestus's Baton says which code it runs.
 */
import type { TrackerProgress }                                   from '../../src/lib/tracker-model/@types/TrackerProgress.ts';
import { readingBoardOf }                                         from '../../src/lib/tracker-model/ReadingBoard.ts';
import { Baton, type BatonRecord }                                from '../../src/services/hephaestus/Baton.ts';
import type { BatonPassFailure }                                  from '../../src/services/hephaestus/BatonPass.ts';
import { CodeVersion }                                            from '../../src/services/hephaestus/CodeVersion.ts';
import type { HephaestusNotice }                                  from '../../src/services/hephaestus/DrivePass.ts';
import { hephaestusFilesIn }                                      from '../../src/services/hephaestus/HephaestusFiles.ts';
import { PresenceStatus, type CrashReading, type StatusPresence } from '../../src/services/hephaestus/PresenceStatus.ts';
import type { Workspace }                                         from '../../src/services/tracker/Workspace.ts';
import { PRODUCT_NAMES }                                          from '../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                                    from '../CommandContext.ts';
import { HephaestusRemote }                                       from './HephaestusRemote.ts';
import { HephaestusWording }                                      from './HephaestusWording.ts';
import { PresenceWording }                                        from './PresenceWording.ts';

/** The `hephaestus` block of `status --json`. `state` is the live Hephaestus's runtime state, `serving` or `starting` when it names none, or `down`. */
export interface HephaestusStatusFacts {
  state:               string;
  paused:              boolean;
  url:                 string | null;
  baton:               ({ generation: number } & BatonRecord) | null;
  codeVersionOnDisk:   string;
  codeVersionInMemory: string | null;
  notices:             HephaestusNotice[];
  batonPassWarning:    BatonPassFailure | null;
  presence:            StatusPresence;
}

export interface HephaestusStatusReading {
  facts: HephaestusStatusFacts;
  /** Set only while the forge is off after a crash. */
  crash: CrashReading | null;
}

export async function readHephaestusStatus(context: CommandContext, workspace: Workspace, progress: TrackerProgress): Promise<HephaestusStatusReading> {
  const files           = hephaestusFilesIn(workspace.trackerDirectory);
  const newest          = Baton.newestBatonOf(context.platformPorts, files.hephaestusDirectory);
  const live            = newest.verdict === 'live' ? newest : null;
  const stateDocument   = live === null ? null : HephaestusWording.hephaestusStateOf(await HephaestusRemote.stateOf(live.record));
  const answeringState  = async (record: BatonRecord): Promise<string> => (await HephaestusRemote.identityAnswers(record) ? 'serving' : 'starting');
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
      baton:               live === null ? null : { generation: live.generation, ...live.record },
      codeVersionOnDisk:   CodeVersion.onDisk(),
      codeVersionInMemory: live?.record.codeVersion ?? null,
      notices:             stateDocument?.notices ?? [],
      batonPassWarning:    stateDocument?.batonPassWarning ?? null,
      presence:            presenceReading.presence,
    },
    crash: presenceReading.crash,
  };
}

/** Down, the crash it stays off after comes first, with its log's path; live, where it serves and what it runs. */
export function hephaestusStatusTextOf({ facts, crash }: HephaestusStatusReading): string {
  const pausedText = facts.paused ? 'paused' : 'not paused';
  const { baton, codeVersionOnDisk } = facts;
  if (baton === null) {
    return [
      ...(crash === null ? [] : [PresenceWording.offAfterACrashLineOf(crash, facts.presence.crashLog)]),
      `hephaestus: down; ${pausedText}`,
      `code on disk: ${codeVersionOnDisk}`,
    ].join('\n');
  }
  const newCodeAdvice = baton.codeVersion === codeVersionOnDisk ? '' : ` (new code: run \`${PRODUCT_NAMES.PROGRAM} update\`)`;
  return [
    `hephaestus: ${facts.state} at ${baton.url}, process ${baton.processId}, Baton ${baton.generation}; ${pausedText}`,
    `code on disk: ${codeVersionOnDisk}; in memory: ${baton.codeVersion}${newCodeAdvice}`,
    ...PresenceWording.livePresenceLinesOf(facts.presence),
    ...facts.notices.map((notice) => `notice: ${HephaestusWording.noticeTextOf(notice)}`),
    ...(facts.batonPassWarning === null ? [] : [`warning: ${HephaestusWording.batonPassWarningTextOf(facts.batonPassWarning)}`]),
  ].join('\n');
}
