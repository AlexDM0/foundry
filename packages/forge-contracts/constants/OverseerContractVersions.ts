/**
 * The version of each contract an Overseer serves, as the integer key of its documents carries it (`monitorVersion`, the identity's
 * `contracts`). A forge's system version, not these, says whether a client can talk to it (`ForgeSystemVersions.ts`); forge keeps the keys
 * for clients built before system versions (`ForgeCompatibilityRegistry.ts`).
 */
import type { ServedContractName } from '../@types/IdentityDocument.ts';

/** Control stays 1 although forge 1.1 adds Flint's brain's two kinds: a client built for 1.0 compares it for equality. */
export const OVERSEER_CONTRACT_VERSIONS = {
  identity: 1,
  summary:  1,
  monitor:  3,
  control:  1,
  embed:    1,
} as const satisfies Readonly<Record<'identity' | ServedContractName, number>>;
