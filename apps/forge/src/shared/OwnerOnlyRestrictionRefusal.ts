/** A path that must be its owner's alone and cannot be proved so refuses the operation that needs it, before a secret is kept there. */
import type { OwnerOnlyRestriction } from '../lib/owner-only-files/OwnerOnlyFiles.ts';
import { OperationRefusal }          from './OperationRefusal.ts';

export function refuseUnlessOwnerOnly(restriction: OwnerOnlyRestriction): void {
  if (restriction.verdict === 'restricted') return;
  // Unrepaired, so a command exits 2 as it did when the restriction threw a plain error.
  throw new OperationRefusal('unrepaired', restriction.cause === 'no-adapter'
    ? {
      kind: 'path-not-owner-only', cause: restriction.cause, platformName: restriction.platformName, path: restriction.path
    }
    : { kind: 'path-not-owner-only', cause: restriction.cause, path: restriction.path });
}
