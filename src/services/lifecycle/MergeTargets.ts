/** Where a ticket merges: its group's branch, or the main line for a ticket with no group and a group's release ticket. */
import { GitProcess }         from '../../lib/git/GitProcess.ts';
import type { MergeTargetOf } from '../../lib/tracker-model/AirlockClaims.ts';

export const GROUP_TARGET_PREFIX = 'group-';

const DEFAULT_MAIN_LINE = 'main';

/** The branch the main checkout has out is the main line the Overseer lands onto; a detached or unreadable HEAD reads as `main`. */
export function mainLineOf(repositoryRoot: string): string {
  const head = GitProcess.run(repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return GitProcess.succeeded(head) && head.standardOutput.trim() !== '' ? head.standardOutput.trim() : DEFAULT_MAIN_LINE;
}

export function mergeTargetRuleOf(mainLine: string): MergeTargetOf {
  return (ticket) => (ticket.group === undefined || ticket.releasesGroup === true ? mainLine : `${GROUP_TARGET_PREFIX}${ticket.group}`);
}
