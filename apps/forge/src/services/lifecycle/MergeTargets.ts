/** Where a ticket merges: its group's branch, or the main line for a ticket with no group and a group's release ticket. */
import type { MergeTargetOf } from '../../domain/tracker-model/AirlockClaims.ts';
import { GitProcess }         from '../../lib/git/GitProcess.ts';

const DEFAULT_MAIN_LINE = 'main';

/** The branch the main checkout has out is the main line Hephaestus lands onto; a detached or unreadable HEAD reads as `main`. */
export function mainLineOf(repositoryRoot: string): string {
  const head = GitProcess.run(repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return GitProcess.succeeded(head) && head.standardOutput.trim() !== '' ? head.standardOutput.trim() : DEFAULT_MAIN_LINE;
}

export function mergeTargetRuleOf(mainLine: string, groupTargetPrefix: string): MergeTargetOf {
  return (ticket) => (ticket.group === undefined || ticket.releasesGroup === true ? mainLine : `${groupTargetPrefix}${ticket.group}`);
}
