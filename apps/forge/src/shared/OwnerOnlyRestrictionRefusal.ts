/** A path that must be its owner's alone and cannot be proved so refuses the operation that needs it, before a secret is kept there. */
import type { OwnerOnlyRestriction } from '../lib/owner-only-files/OwnerOnlyFiles.ts';
import { OperationRefusal }          from './OperationRefusal.ts';

export function refuseUnlessOwnerOnly(restriction: OwnerOnlyRestriction): void {
  if (restriction.verdict === 'refused') throw new OperationRefusal('refused', { kind: 'path-not-owner-only', path: restriction.path, cause: restriction.cause });
}
