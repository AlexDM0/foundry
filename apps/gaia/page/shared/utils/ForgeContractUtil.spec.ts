/**
 * What Gaia can do with a forge by its contracts. What matters: a forge's board opens in place while it is read in full or as last
 * reported, so a forge read through its summary, or of a newer contract, never does; only a control contract Gaia sends is sent what an
 * Overseer carries; and the brain's commands go only to an Overseer that answers.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocumentForge }    from '../../@types/FleetDocument.ts';
import { FLEET_DEGRADED }             from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES_READINGS } from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeContractUtil }          from './ForgeContractUtil.ts';

const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

function degradedForgeNamed(project: string): FleetDocumentForge {
  const forge = FLEET_DEGRADED.forges.find((candidate) => candidate.project === project);
  if (forge === undefined) throw new Error(`The degraded fixture holds no forge named ${project}.`);
  return forge;
}

describe('opening a forge in place', () => {
  test('needs a forge read in full or as last reported', () => {
    expect(ForgeContractUtil.canOpenInPlace(STOREFRONT)).toBe(true);
    expect(ForgeContractUtil.canOpenInPlace(degradedForgeNamed('Invoice Service'))).toBe(true);
  });

  test('is not offered for a forge read through its summary, of a newer contract, dormant or gone', () => {
    expect(ForgeContractUtil.canOpenInPlace(degradedForgeNamed('Research Wiki'))).toBe(false);
    expect(ForgeContractUtil.canOpenInPlace(degradedForgeNamed('Analytics Sandbox'))).toBe(false);
    expect(ForgeContractUtil.canOpenInPlace(FLEET_FIVE_FORGES_READINGS.designSystem)).toBe(false);
    expect(ForgeContractUtil.canOpenInPlace(FLEET_FIVE_FORGES_READINGS.legacyImporter)).toBe(false);
  });
});

describe('the control contract', () => {
  test('is known at the one number this Gaia sends, and at no other', () => {
    expect(ForgeContractUtil.controlContractIsKnown(STOREFRONT)).toBe(true);
    expect(ForgeContractUtil.controlContractIsKnown({ ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: 3 } })).toBe(false);
    expect(ForgeContractUtil.controlContractIsKnown(degradedForgeNamed('Research Wiki'))).toBe(false);
    expect(ForgeContractUtil.controlContractIsKnown(degradedForgeNamed('Analytics Sandbox'))).toBe(false);
  });
});

describe('the brain\'s commands', () => {
  test('are served only by an Overseer that answers, at the control contract Gaia sends', () => {
    expect(ForgeContractUtil.brainCommandsAreServed(STOREFRONT)).toBe(true);
    expect(ForgeContractUtil.brainCommandsAreServed({ ...STOREFRONT, fidelity: 'unreachable' })).toBe(false);
    expect(ForgeContractUtil.brainCommandsAreServed({ ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: 3 } })).toBe(false);
    expect(ForgeContractUtil.brainCommandsAreServed(degradedForgeNamed('Analytics Sandbox'))).toBe(false);
  });
});
