/** `bun run versions:raise-minimum <major.minor>`: the dry run of raising forge's minimum supported version, which changes nothing. */
import { CompatibilityRegistryUtil } from 'system-versions/CompatibilityRegistryUtil';

import { FORGE_COMPATIBILITY_REGISTRY } from '../constants/ForgeCompatibilityRegistry.ts';
import { FORGE_SYSTEM_VERSIONS }        from '../constants/ForgeSystemVersions.ts';

const answer = CompatibilityRegistryUtil.raiseMinimumAnswerOf(FORGE_COMPATIBILITY_REGISTRY, FORGE_SYSTEM_VERSIONS, Bun.argv[2]);

if (answer.outcome === 'reported') {
  console.log(answer.text);
} else {
  console.error(answer.text);
  process.exitCode = 1;
}
