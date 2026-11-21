/**
 * What Gaia can do with a forge by the contracts it publishes: open its board in place, which needs a forge read in full or as last
 * reported; and send it what its Hephaestus carries, which needs the control contract Gaia sends.
 */
import type { FleetDocumentForge }       from '../../@types/FleetDocument.ts';
import { KNOWN_FORGE_CONTRACT_VERSIONS } from '../constants/KnownForgeContractVersions.ts';

function canOpenInPlace(forge: FleetDocumentForge): boolean {
  return forge.fidelity === 'full' || forge.fidelity === 'unreachable';
}

function controlContractIsKnown(forge: FleetDocumentForge): boolean {
  return forge.contracts.control === KNOWN_FORGE_CONTRACT_VERSIONS.control;
}

export const ForgeContractUtil = {
  canOpenInPlace,
  controlContractIsKnown,
} as const;
