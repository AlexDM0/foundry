/**
 * What Gaia can do with a forge by its contracts. What matters: a forge opens in place only with the known embed contract and while it is
 * read in full or as last reported, so a forge read through its summary, or of a newer contract, never does; and only a control contract
 * Gaia sends to, the current one or the older one, is sent what an Overseer carries; the brain's commands go only to an Overseer that answers.
 */
import { describe, expect, test } from 'bun:test';

import { FLINT_BRAIN_CONTRACT_VERSIONS } from 'forge-contracts/OverseerContractVersions';
import type { FleetDocumentForge }       from '../../@types/FleetDocument.ts';
import { FLEET_DEGRADED }                from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES_READINGS }    from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeContractUtil }             from './ForgeContractUtil.ts';

const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

function degradedForgeNamed(project: string): FleetDocumentForge {
  const forge = FLEET_DEGRADED.forges.find((candidate) => candidate.project === project);
  if (forge === undefined) throw new Error(`The degraded fixture holds no forge named ${project}.`);
  return forge;
}

describe('opening a forge in place', () => {
  test('needs the known embed contract, and a forge read in full or as last reported', () => {
    expect(ForgeContractUtil.canOpenInPlace(STOREFRONT)).toBe(true);
    expect(ForgeContractUtil.canOpenInPlace(degradedForgeNamed('Invoice Service'))).toBe(true);
    expect(ForgeContractUtil.canOpenInPlace({ ...STOREFRONT, contracts: { ...STOREFRONT.contracts, embed: null } })).toBe(false);
    expect(ForgeContractUtil.canOpenInPlace({ ...STOREFRONT, contracts: { ...STOREFRONT.contracts, embed: 2 } })).toBe(false);
  });

  test('is not offered for a forge read through its summary, of a newer contract, dormant or gone', () => {
    expect(ForgeContractUtil.canOpenInPlace(degradedForgeNamed('Research Wiki'))).toBe(false);
    expect(ForgeContractUtil.canOpenInPlace(degradedForgeNamed('Analytics Sandbox'))).toBe(false);
    expect(ForgeContractUtil.canOpenInPlace(FLEET_FIVE_FORGES_READINGS.designSystem)).toBe(false);
    expect(ForgeContractUtil.canOpenInPlace(FLEET_FIVE_FORGES_READINGS.legacyImporter)).toBe(false);
  });
});

describe('the control contract', () => {
  test('is known at the number this Gaia speaks and at the older number it still sends to, and at no other', () => {
    expect(ForgeContractUtil.controlContractIsKnown(STOREFRONT)).toBe(true);
    expect(ForgeContractUtil.controlContractIsKnown({ ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: 1 } })).toBe(true);
    expect(ForgeContractUtil.controlContractIsKnown({ ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: 2 } })).toBe(true);
    expect(ForgeContractUtil.controlContractIsKnown(degradedForgeNamed('Research Wiki'))).toBe(false);
    expect(ForgeContractUtil.controlContractIsKnown(degradedForgeNamed('Analytics Sandbox'))).toBe(false);
  });
});

describe('the brain\'s commands', () => {
  test('are served only by an Overseer that answers, at a known control contract that carries them', () => {
    const atTheBrainContract = { ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: FLINT_BRAIN_CONTRACT_VERSIONS.control } };
    expect(ForgeContractUtil.brainCommandsAreServed(atTheBrainContract)).toBe(true);
    expect(ForgeContractUtil.brainCommandsAreServed({ ...atTheBrainContract, fidelity: 'unreachable' })).toBe(false);
    const belowTheBrainContract = { ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: FLINT_BRAIN_CONTRACT_VERSIONS.control - 1 } };
    expect(ForgeContractUtil.brainCommandsAreServed(belowTheBrainContract)).toBe(false);
    expect(ForgeContractUtil.brainCommandsAreServed(degradedForgeNamed('Analytics Sandbox'))).toBe(false);
  });
});
