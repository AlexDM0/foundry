/**
 * The supported-forge step of `bun run verify`: in the monorepo Gaia strives to support forge's latest system version, so it warns, and
 * never fails, while `SUPPORTED_FORGE_VERSION` is behind the current version `forge-contracts` describes.
 */
import { FORGE_SYSTEM_VERSIONS } from 'forge-contracts/ForgeSystemVersions';
import { SystemVersionUtil }     from 'system-versions/SystemVersionUtil';
import type { SystemVersion }    from 'system-versions/VersionsDocument';

import { SUPPORTED_FORGE_VERSION } from '../shared/constants/SupportedForgeVersions.ts';

/** The warning to print while Gaia supports an older forge than the one beside it; `null` once it supports that one or a later one. */
export function supportedForgeVersionWarningOf(supported: SystemVersion, forgeCurrent: SystemVersion): string | null {
  if (!SystemVersionUtil.isOlder(supported, forgeCurrent)) return null;
  const supportedText = SystemVersionUtil.textOf(supported);
  const currentText = SystemVersionUtil.textOf(forgeCurrent);
  return `Gaia supports forge ${supportedText}, behind forge's current ${currentText}: take up what ${currentText} changed and raise SUPPORTED_FORGE_VERSION.`;
}

if (import.meta.main) {
  const warning = supportedForgeVersionWarningOf(SUPPORTED_FORGE_VERSION, FORGE_SYSTEM_VERSIONS.current);
  const supportedText = SystemVersionUtil.textOf(SUPPORTED_FORGE_VERSION);
  const currentText = SystemVersionUtil.textOf(FORGE_SYSTEM_VERSIONS.current);
  if (warning !== null) console.warn(warning);
  else if (supportedText === currentText) console.log(`Gaia supports forge's current version, ${supportedText}.`);
  else console.log(`Gaia supports forge ${supportedText}, ahead of forge's current ${currentText}.`);
}
