/**
 * What Gaia can do with a forge by the contracts it publishes: open it in place, which needs the embed contract Gaia knows and a forge read
 * in full or as last reported, and send it what its Overseer carries, which needs a control contract Gaia sends to: the current one, or an
 * older one, which lacks only the commands the later ones add.
 */
import { FLINT_BRAIN_CONTRACT_VERSIONS } from 'overseer-contracts/OverseerContractVersions';

import { CONTRACT_VERSIONS, OLDER_CONTRACT_VERSIONS_READ } from '../../../src/shared/constants/ContractVersions.ts';
import { ContractVersionUtil }                             from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { FleetDocumentForge }                         from '../../@types/FleetDocument.ts';

function canOpenInPlace(forge: FleetDocumentForge): boolean {
  const isReadInFullOrAsLastReported = forge.fidelity === 'full' || forge.fidelity === 'unreachable';
  return isReadInFullOrAsLastReported && forge.contracts.embed === CONTRACT_VERSIONS.forgeEmbedChannel;
}

function controlContractIsKnown(forge: FleetDocumentForge): boolean {
  const controlVersion = forge.contracts.control;
  if (controlVersion === null) return false;
  const verdict = ContractVersionUtil.majorVerdictOf(controlVersion, CONTRACT_VERSIONS.forgeControl, OLDER_CONTRACT_VERSIONS_READ.forgeControl);
  return verdict === 'known' || verdict === 'older-read';
}

/**
 * Wake and Stop go to an Overseer that answers, at a control contract Gaia knows that carries the brain's commands (G3); under an older
 * one, or as an Overseer that stopped answering last reported it, the brain only shows.
 */
function brainCommandsAreServed(forge: FleetDocumentForge): boolean {
  const controlVersion = forge.contracts.control;
  return forge.fidelity === 'full'
    && controlContractIsKnown(forge)
    && controlVersion !== null
    && controlVersion >= FLINT_BRAIN_CONTRACT_VERSIONS.control;
}

export const ForgeContractUtil = {
  canOpenInPlace,
  controlContractIsKnown,
  brainCommandsAreServed,
} as const;
