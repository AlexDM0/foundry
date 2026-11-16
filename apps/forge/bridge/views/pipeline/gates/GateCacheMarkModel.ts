/**
 * The cache mark of a gate's newest profile run, pure: the word for what the gate reported of its own tool's cache, "cached" when every
 * task replayed from it and "partly cached" when some did. A run that replayed nothing, or whose gate reported nothing, has no mark.
 */
import type { GatePhase }           from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { GateCacheReport }     from '../../../../src/lib/tracker-model/@types/Job.ts';
import type { GateProfileRunFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';

const CACHE_WORDS: Readonly<Record<GateCacheReport, string | null>> = Object.freeze({ hit: 'cached', partial: 'partly cached', miss: null });

function cacheWordOf(cacheReport: GateCacheReport | null): string | null {
  return cacheReport === null ? null : CACHE_WORDS[cacheReport];
}

/** The report of the newest run of the gate in the phase; only that run is kept, so a run queued again has none until it ends. */
function gateCacheReportOf(profileRuns: readonly GateProfileRunFacts[], gateName: string, phase: GatePhase): GateCacheReport | null {
  return profileRuns.find((candidate) => candidate.gateName === gateName && candidate.phase === phase)?.cacheReport ?? null;
}

/** "41 s · cached": the text with the mark beside it, or the text alone with none. */
function withCacheWordOf(text: string, cacheReport: GateCacheReport | null): string {
  const cacheWord = cacheWordOf(cacheReport);
  return cacheWord === null ? text : `${text} · ${cacheWord}`;
}

export const GateCacheMarkModel = Object.freeze({ cacheWordOf, gateCacheReportOf, withCacheWordOf });
