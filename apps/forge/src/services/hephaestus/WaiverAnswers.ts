import type { PlaybookStep }         from '../../domain/tracker-model/@types/PlaybookStep.ts';
import { ReviewOutcome }             from '../lifecycle/ReviewOutcome.ts';
import type { BoardTransaction }     from '../tracker/BoardTransaction.ts';
import { jobFolderIn }               from './HephaestusFiles.ts';
import { StoredFileUnreadable }      from './StoredFileUnreadable.ts';
import { UnreadableJobFileIncident } from './UnreadableJobFileIncident.ts';

/**
 * Acts on each answered waiver the Playbook named, with the tree read outside the lock. An answer that came after the observation has no
 * tree yet, so it waits for the next pass. Proposals that cannot be read open their incident on the review job, which takes no step while
 * it stands. Answers whether another pass is due: the one that launches what the answer freed, or acts on it.
 */
export function actOnWaiverAnswers(
  change: BoardTransaction, steps: readonly PlaybookStep[], answeredWaiverTrees: ReadonlyMap<string, string | null>, trackerDirectory: string
): boolean {
  const { board, at } = change;
  const waiverAnswerSteps = steps.flatMap((step) => (step.kind === 'act-on-waiver-answer' && !UnreadableJobFileIncident.standsOpenFor(board, step.jobId) ? [step] : []));
  for (const step of waiverAnswerSteps) {
    if (!answeredWaiverTrees.has(step.jobId)) continue;
    const headTree = answeredWaiverTrees.get(step.jobId) ?? null;
    const outcome = ReviewOutcome.actOnWaiverAnswer(board, step.jobId, step.answers, jobFolderIn(trackerDirectory, step.jobId), headTree, at);
    if (outcome.verdict === 'proposals-unreadable') {
      const unreadable = StoredFileUnreadable.unreadableFileOf(trackerDirectory, outcome.proposalsPath, outcome.problem);
      StoredFileUnreadable.openIncidentOn(board, step.jobId, unreadable, at);
    }
  }
  return waiverAnswerSteps.some((step) => !UnreadableJobFileIncident.standsOpenFor(board, step.jobId));
}
