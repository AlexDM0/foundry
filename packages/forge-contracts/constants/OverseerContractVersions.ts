/**
 * The version of each contract an Overseer serves, as the integer key of its documents carries it (`monitorVersion`, `controlVersion`, the
 * identity's `contracts`). A forge's system version, not these, says whether a client can talk to it (`ForgeSystemVersions.ts`); the keys
 * are the current contract all the same: a reader checks a document's key before it maps the document.
 */
import type { ServedContractName } from '../@types/IdentityDocument.ts';

/** Forge 2.0 raised the monitor (typed targets, no Flint's brain) and control (the brain's two kinds left, the Assistant's switch came). */
export const OVERSEER_CONTRACT_VERSIONS = {
  identity: 1,
  summary:  1,
  monitor:  4,
  control:  2,
} as const satisfies Readonly<Record<'identity' | ServedContractName, number>>;
