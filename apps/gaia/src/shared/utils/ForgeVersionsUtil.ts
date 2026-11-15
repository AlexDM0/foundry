/**
 * The verdict on one forge's system version (`GET /api/versions`) against the one forge version this Gaia supports: whether they can talk
 * at all, and which side needs an update. One verdict per forge, never per endpoint.
 */
import type { SystemVersion, VersionsDocument } from 'system-versions/VersionsDocument';

import type { ForgeVersions, ForgeVersionsVerdict } from '../@types/ForgeReading.ts';
import { SystemVersionUtil }                        from './SystemVersionUtil.ts';

/** A forge that serves no `/api/versions`, as every forge released before system versions: it needs an update before Gaia can talk to it. */
const NO_VERSIONS_SERVED: ForgeVersions = { verdict: 'older', current: null, minimumSupported: null };

function verdictOf({ current, minimumSupported }: VersionsDocument, supported: SystemVersion): ForgeVersionsVerdict {
  if (SystemVersionUtil.isOlder(supported, minimumSupported)) return 'newer';
  const comparison = SystemVersionUtil.comparisonOf(current, supported);
  if (comparison < 0) return 'older';
  return comparison > 0 ? 'ahead' : 'current';
}

function forgeVersionsOf(document: VersionsDocument, supported: SystemVersion): ForgeVersions {
  return { verdict: verdictOf(document, supported), current: document.current, minimumSupported: document.minimumSupported };
}

/** Gaia talks to a forge at the version it supports, and to one ahead of it that still serves that version; never to a newer or older one. */
function canTalk(versions: ForgeVersions): boolean {
  return versions.verdict === 'current' || versions.verdict === 'ahead';
}

export const ForgeVersionsUtil = {
  NO_VERSIONS_SERVED,
  forgeVersionsOf,
  canTalk,
} as const;
