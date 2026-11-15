/**
 * The version of each contract an Overseer serves, as the integer key of its documents carries it (`monitorVersion`, the identity's
 * `contracts`), and the older ones those documents still describe. A forge's system version, not these, says whether a client can talk to
 * it (`ForgeSystemVersions.ts`); forge keeps the keys for clients built before system versions (`ForgeCompatibilityRegistry.ts`).
 */
import type { ServedContractName } from '../@types/IdentityDocument.ts';

export const OVERSEER_CONTRACT_VERSIONS = {
  identity: 1,
  summary:  1,
  monitor:  3,
  control:  2,
  embed:    1,
} as const satisfies Readonly<Record<'identity' | ServedContractName, number>>;

/** Monitor 1 and 2 have their own document types; a control 1 forge reads every command but the two control 2 adds. */
export const OLDER_OVERSEER_CONTRACT_VERSIONS: { readonly monitor: readonly number[]; readonly control: readonly number[] } = {
  monitor: [1, 2],
  control: [1],
};

/** The first control version that carries Flint's brain (G3): a forge at an older one is sent neither brain command. */
export const FLINT_BRAIN_CONTRACT_VERSIONS = { control: 2 } as const;
