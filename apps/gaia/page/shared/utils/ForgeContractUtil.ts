/**
 * What Gaia can do with a forge by the contracts it publishes: open it in place, which needs the embed contract Gaia knows and a forge read
 * in full or as last reported, and send it what its Overseer carries, Flint's brain's commands included, which needs the control contract
 * Gaia sends.
 */
import { CONTRACT_VERSIONS }       from '../../../src/shared/constants/ContractVersions.ts';
import type { FleetDocumentForge } from '../../@types/FleetDocument.ts';

function canOpenInPlace(forge: FleetDocumentForge): boolean {
  const isReadInFullOrAsLastReported = forge.fidelity === 'full' || forge.fidelity === 'unreachable';
  return isReadInFullOrAsLastReported && forge.contracts.embed === CONTRACT_VERSIONS.forgeEmbedChannel;
}

function controlContractIsKnown(forge: FleetDocumentForge): boolean {
  return forge.contracts.control === CONTRACT_VERSIONS.forgeControl;
}

/** Wake and Stop go to an Overseer that answers; as an Overseer that stopped answering last reported it, the brain only shows. */
function brainCommandsAreServed(forge: FleetDocumentForge): boolean {
  return forge.fidelity === 'full' && controlContractIsKnown(forge);
}

export const ForgeContractUtil = {
  canOpenInPlace,
  controlContractIsKnown,
  brainCommandsAreServed,
} as const;
