/** The git floor `init` and `start` hold before they write anything: below it, merge forecasts and merge verification would fail later. */
import { gitVersionVerdictIn } from '../src/lib/git/GitVersion.ts';
import { OperationRefusal }    from '../src/shared/OperationRefusal.ts';

export function requireGitAtTheFloor(directory: string): void {
  const verdict = gitVersionVerdictIn(directory);
  if (verdict.verdict === 'supported') return;
  throw new OperationRefusal('refused', { kind: 'git-below-floor', foundVersion: verdict.verdict === 'below-floor' ? verdict.version : null, floorVersion: verdict.floor, });
}
