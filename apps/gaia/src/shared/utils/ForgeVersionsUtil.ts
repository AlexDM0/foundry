/**
 * The verdict on one forge's system version (`GET /api/versions`) against the forge versions a Gaia knows: whether they can talk at all,
 * which side needs an update, and which paths Gaia calls the forge's endpoints at. One verdict per forge, never per endpoint.
 */
import type { SystemVersion, VersionsDocument } from 'forge-contracts/VersionsDocument';

import type { OverseerPaths }                       from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeVersions, ForgeVersionsVerdict } from '../@types/ForgeReading.ts';
import { SystemVersionUtil }                        from './SystemVersionUtil.ts';

/** Gaia's two numbers: the forge version it is built for, and the oldest it still talks to. */
export interface KnownForgeVersions {
  readonly supported: SystemVersion;
  readonly minimum:   SystemVersion;
}

const NOT_REPORTED: ForgeVersions = { verdict: 'not-reported', current: null, minimumSupported: null };

function verdictOf({ current, minimumSupported }: VersionsDocument, known: KnownForgeVersions): ForgeVersionsVerdict {
  if (SystemVersionUtil.isOlder(known.supported, minimumSupported)) return 'newer';
  if (SystemVersionUtil.isOlder(current, known.minimum)) return 'older';
  const comparison = SystemVersionUtil.comparisonOf(current, known.supported);
  if (comparison > 0) return 'ahead';
  return comparison < 0 ? 'behind' : 'current';
}

/** `null` for a forge that publishes no versions document. */
function forgeVersionsOf(document: VersionsDocument | null, known: KnownForgeVersions): ForgeVersions {
  if (document === null) return NOT_REPORTED;
  return { verdict: verdictOf(document, known), current: document.current, minimumSupported: document.minimumSupported };
}

function canTalk(versions: ForgeVersions): boolean {
  return versions.verdict !== 'newer' && versions.verdict !== 'older';
}

/** A forge that publishes its versions is called at the versioned paths Gaia knows; one that publishes none at its unversioned paths. */
function overseerPathsOf(versions: ForgeVersions): OverseerPaths {
  return versions.verdict === 'not-reported' ? 'unversioned' : 'versioned';
}

export const ForgeVersionsUtil = {
  NOT_REPORTED,
  forgeVersionsOf,
  canTalk,
  overseerPathsOf,
} as const;
