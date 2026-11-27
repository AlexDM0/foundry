import type { Pipeline } from '../@types/Pipeline.ts';
import type {
  ReviewedRound,
  ReviewedRoundWithRework,
  RoundFinding,
  RoundLimits,
  RoundRefusal,
  RoundVerdict
} from '../@types/ReviewRound.ts';

function findingsOfRoundsBefore<Finding extends RoundFinding>(earlierRounds: readonly ReviewedRound<Finding>[], round: number): Finding[] {
  return earlierRounds.filter((earlier) => earlier.round < round).flatMap((earlier) => earlier.findings);
}

function refusedVerdictOf(refusal: RoundRefusal): RoundVerdict {
  return { granted: false, refusal };
}

/**
 * Round `ROUND_GRANTED_ON_REWORK_ALONE` needs the rework count alone; a later round also needs the findings converging, or it only finds more.
 * Only rounds before `current.round` are read, so `earlierRounds` may already hold the current one.
 */
function nextRoundVerdictOf(earlierRounds: readonly ReviewedRound[], current: ReviewedRoundWithRework, limits: RoundLimits): RoundVerdict {
  const requestedRound = current.round + 1;
  if (limits.REWORK_ROUND_THRESHOLD_LINES === null) return refusedVerdictOf({ reason: 're-review-off', requestedRound });
  if (current.reworkedLines <= limits.REWORK_ROUND_THRESHOLD_LINES) {
    return refusedVerdictOf({ reason: 'rework-not-over-threshold', requestedRound, reworkedLines: current.reworkedLines });
  }
  if (requestedRound === limits.ROUND_GRANTED_ON_REWORK_ALONE) return { granted: true };
  const previous = earlierRounds.find((earlier) => earlier.round === current.round - 1);
  if (previous === undefined) return refusedVerdictOf({ reason: 'previous-round-not-reviewed-in-this-run', requestedRound });
  const earlierFindings = findingsOfRoundsBefore(earlierRounds, current.round);
  const earlierClasses = new Set(earlierFindings.map((finding) => finding.class));
  const earlierFiles = new Set(earlierFindings.map((finding) => finding.file));
  if (current.findings.length * limits.FINDINGS_SHRINK_FACTOR_PER_ROUND > previous.findings.length) {
    return refusedVerdictOf({
      reason:               'findings-not-halved',
      requestedRound,
      findingCount:         current.findings.length,
      previousFindingCount: previous.findings.length,
    });
  }
  const findingOfAReturnedClass = current.findings.find((finding) => earlierClasses.has(finding.class));
  if (findingOfAReturnedClass !== undefined) return refusedVerdictOf({ reason: 'finding-class-returned', requestedRound, findingClass: findingOfAReturnedClass.class });
  const findingInANewFile = current.findings.find((finding) => !earlierFiles.has(finding.file));
  if (findingInANewFile !== undefined) return refusedVerdictOf({ reason: 'new-file-named', requestedRound, file: findingInANewFile.file });
  return { granted: true };
}

/**
 * The limits a round verdict reads on this pipeline: its review's re-review sets the rework threshold, and a review with none grants no
 * round. With no pipeline, the threshold of `fallback` holds.
 */
function roundLimitsOf(pipeline: Readonly<Pipeline> | null, fallback: RoundLimits): RoundLimits {
  if (pipeline === null) return fallback;
  return { ...fallback, REWORK_ROUND_THRESHOLD_LINES: pipeline.review?.reReview?.thresholdLines ?? null };
}

export const RoundVerdictUtil = {
  findingsOfRoundsBefore,
  nextRoundVerdictOf,
  roundLimitsOf,
} as const;
