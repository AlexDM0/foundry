/** `bun run versions:raise-minimum <major.minor>`: the dry run of raising Gaia's own minimum supported version, which changes nothing. */
import { CompatibilityRegistryUtil } from 'system-versions/CompatibilityRegistryUtil';

import { GAIA_COMPATIBILITY_REGISTRY }                         from '../shared/constants/GaiaCompatibilityRegistry.ts';
import { GAIA_SYSTEM_VERSION, MINIMUM_SUPPORTED_GAIA_VERSION } from '../shared/constants/GaiaSystemVersions.ts';

const versions = { current: GAIA_SYSTEM_VERSION, minimumSupported: MINIMUM_SUPPORTED_GAIA_VERSION };
const answer = CompatibilityRegistryUtil.raiseMinimumAnswerOf(GAIA_COMPATIBILITY_REGISTRY, versions, Bun.argv[2]);

if (answer.outcome === 'reported') {
  console.log(answer.text);
} else {
  console.error(answer.text);
  process.exitCode = 1;
}
