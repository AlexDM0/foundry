/**
 * The version of each contract a Hephaestus serves, as the integer key of its documents carries it (`monitorVersion`, `controlVersion`, the
 * identity's `contracts`). A forge's system version, not these, says whether a client can talk to it (`ForgeSystemVersions.ts`); the keys
 * are the current contract all the same: a reader checks a document's key before it maps the document.
 */
import type { ServedContractName } from '../@types/IdentityDocument.ts';

/** Forge 4.0 raised the summary and the monitor (the state `restarting`, the warning kind restart-failed). */
export const HEPHAESTUS_CONTRACT_VERSIONS = {
  identity: 1,
  summary:  3,
  monitor:  6,
  control:  3,
} as const satisfies Readonly<Record<'identity' | ServedContractName, number>>;
