/**
 * The version of each contract an Overseer serves, as the documents in `@types/` describe it, and the older majors those documents still
 * describe, so a reader may read a forge not yet updated. These are wire versions, independent of this package's own version.
 */
import type { ContractVersion }    from '../@types/ContractVersion.ts';
import type { ServedContractName } from '../@types/IdentityDocument.ts';

export const OVERSEER_CONTRACT_VERSIONS = {
  identity: { major: 1, minor: 0 },
  summary:  { major: 1, minor: 0 },
  monitor:  { major: 3, minor: 0 },
  control:  { major: 2, minor: 0 },
  embed:    { major: 1, minor: 0 },
} as const satisfies Readonly<Record<'identity' | ServedContractName, ContractVersion>>;

/** Monitor 1 and 2 have their own document types; a control 1 forge reads every command but the two control 2 adds. */
export const OLDER_OVERSEER_CONTRACT_MAJORS: { readonly monitor: readonly number[]; readonly control: readonly number[] } = {
  monitor: [1, 2],
  control: [1],
};

/** The first control major that carries Flint's brain (G3): a forge at an older one is sent neither brain command. */
export const FLINT_BRAIN_CONTRACT_VERSIONS = { control: 2 } as const;
