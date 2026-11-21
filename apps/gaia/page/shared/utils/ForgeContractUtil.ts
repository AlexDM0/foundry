/**
 * What Gaia can do with a forge by the contracts it publishes: open its board in place, which needs a forge read in full or as last
 * reported; and send it what its Overseer carries, Flint's brain's commands included, which needs the control contract Gaia sends.
 */
import type { FleetDocumentForge }       from '../../@types/FleetDocument.ts';
import { KNOWN_FORGE_CONTRACT_VERSIONS } from '../constants/KnownForgeContractVersions.ts';

function canOpenInPlace(forge: FleetDocumentForge): boolean {
  return forge.fidelity === 'full' || forge.fidelity === 'unreachable';
}

function controlContractIsKnown(forge: FleetDocumentForge): boolean {
  return forge.contracts.control === KNOWN_FORGE_CONTRACT_VERSIONS.control;
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
