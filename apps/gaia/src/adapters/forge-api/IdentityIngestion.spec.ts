/**
 * The identity ingestion over the identities recorded from forges at the version Gaia supports, read through the forge client. What
 * matters: PLAN 7.1's choice of whether a forge is read, a monitor at the known number (read) against an older one, none or an identity
 * from before F1 (older, nothing read) and a newer number (nothing, at fidelity newer-contract, which equals B3's fixture); an identity
 * that names no contracts (malformed); an identity of another forge at the registry's address; and an identity at a newer
 * `identityVersion` mapped to nothing.
 */
import { describe, expect, test } from 'bun:test';

import { CONTRACT_VERSIONS }                   from '../../shared/constants/ContractVersions.ts';
import { FLEET_SNAPSHOT_DEGRADED }             from '../page-api/testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../page-api/testing/fleet-snapshot-five-forges.ts';

import type { ForgeRegistryFacts }             from './@types/ForgeDocumentReading.ts';
import { IdentityIngestion }                   from './IdentityIngestion.ts';
import { recordedDocumentOf, registryFactsOf } from './testing/ExampleForgeDocuments.ts';

const STOREFRONT_FACTS = registryFactsOf(FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront);

/** The forge the identity of the `serving` situation was taken from, in a scratch repository. */
const RECORDED_FORGE_FACTS: ForgeRegistryFacts = {
  trackerId:         '712f8bdb-e7cf-48bc-86a5-2616d2cf935f',
  project:           'Example Project',
  root:              '/Users/alexexample/development/example-project',
  overseerUrl:       'http://127.0.0.1:54795/',
  overseerProcessId: 21_008,
  program:           null,
  lastCommand:       'open',
  lastChangedAt:     '2026-11-12T09:00:00.000Z',
};

const CURRENT_CONTRACTS = {
  summary: 1,
  monitor: 3,
  control: 1,
  embed:   1,
};

const ANALYTICS_SANDBOX = FLEET_SNAPSHOT_DEGRADED.forges.find((reading) => reading.fidelity === 'newer-contract');

async function storefrontIdentity(): Promise<Record<string, unknown>> {
  return await recordedDocumentOf('serving-every-contract', 'identity', STOREFRONT_FACTS.overseerUrl) as Record<string, unknown>;
}

describe('the identity of a forge at the version Gaia supports', () => {
  test('reads a forge whose monitor contract is the known one', async () => {
    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf(await storefrontIdentity())).toEqual({
      verdict:  'readable',
      identity: {
        trackerId:      'example-storefront-7c41',
        project:        'Example Storefront',
        codeVersion:    '3508409d9d36',
        installVersion: 29,
        processId:      48_107,
        contracts:      CURRENT_CONTRACTS,
      },
    });
  });

  test('reads the identity of the second forge, Example Project, alike', async () => {
    const document = await recordedDocumentOf('serving', 'identity', RECORDED_FORGE_FACTS.overseerUrl);
    expect(new IdentityIngestion(RECORDED_FORGE_FACTS).readingOf(document)).toEqual({
      verdict:  'readable',
      identity: {
        trackerId:      '712f8bdb-e7cf-48bc-86a5-2616d2cf935f',
        project:        'Example Project',
        codeVersion:    '3508409d9d36',
        installVersion: 29,
        processId:      21_008,
        contracts:      CURRENT_CONTRACTS,
      },
    });
  });

  test('reads a forge whose identity names an older monitor contract, or none, as older, with nothing read', async () => {
    const ingestion = new IdentityIngestion(STOREFRONT_FACTS);
    expect(ingestion.readingOf({ ...await storefrontIdentity(), contracts: { ...CURRENT_CONTRACTS, monitor: 2 } }))
      .toEqual({ verdict: 'older-contract', contract: 'monitor', version: 2 });
    expect(ingestion.readingOf({ ...await storefrontIdentity(), contracts: { summary: 1, control: 1 } }))
      .toEqual({ verdict: 'older-contract', contract: 'monitor', version: null });
  });

  test('reads an identity from before F1, which names no version, as older, with nothing read, and one that names no contracts as malformed', async () => {
    const { identityVersion, contracts, ...beforeF1 } = await storefrontIdentity();
    expect([identityVersion, contracts]).toEqual([1, CURRENT_CONTRACTS]);
    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf(beforeF1)).toEqual({ verdict: 'older-contract', contract: 'identity', version: null });
    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf({ ...beforeF1, identityVersion: 1 })).toEqual({ verdict: 'malformed', invalidKeys: ['contracts'] });
  });

  test('maps a forge whose monitor contract is newer to the reading B3\'s fixture shows for it, nothing read', async () => {
    if (ANALYTICS_SANDBOX === undefined) throw new Error('The degraded fixture holds no forge at fidelity newer-contract.');
    const identity = {
      ...await storefrontIdentity(),
      trackerId:   ANALYTICS_SANDBOX.trackerId,
      project:     ANALYTICS_SANDBOX.project,
      codeVersion: '9c04e5b',
      processId:   49_012,
      contracts:   {
        summary: 1,
        monitor: CONTRACT_VERSIONS.forgeMonitor + 1,
        control: ANALYTICS_SANDBOX.contracts.control,
        embed:   1,
      },
    };
    expect(new IdentityIngestion(registryFactsOf(ANALYTICS_SANDBOX)).readingOf(identity)).toEqual({
      verdict:  'newer-contract',
      contract: 'monitor',
      version:  CONTRACT_VERSIONS.forgeMonitor + 1,
      // The watch, not the ingestion, adds the versions the forge answered.
      reading:  { ...ANALYTICS_SANDBOX, versions: null },
    });
  });

  test('names another forge that answers at the address the registry gives this one', async () => {
    const otherForge = { ...await storefrontIdentity(), trackerId: 'invoice-service-2b9e' };
    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf(otherForge)).toEqual({ verdict: 'another-forge', trackerId: 'invoice-service-2b9e' });
  });
});

describe('an identity at a version this Gaia does not know', () => {
  test('maps nothing of an identity at a newer identityVersion: the reading holds only the registry\'s facts', async () => {
    const reading = new IdentityIngestion(STOREFRONT_FACTS).readingOf({ ...await storefrontIdentity(), identityVersion: 2 });
    expect(reading.verdict).toBe('newer-contract');
    if (reading.verdict !== 'newer-contract') return;
    expect([reading.contract, reading.version, reading.reading.fidelity]).toEqual(['identity', 2, 'newer-contract']);
    expect([reading.reading.processId, reading.reading.codeVersion, reading.reading.contracts]).toEqual([
      STOREFRONT_FACTS.overseerProcessId,
      null,
      {
        summary: null,
        monitor: null,
        control: null,
        embed:   null,
      },
    ]);
  });

  test('answers older-contract for an identityVersion below the known one', async () => {
    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf({ ...await storefrontIdentity(), identityVersion: 0 }))
      .toEqual({ verdict: 'older-contract', contract: 'identity', version: 0 });
  });
});

describe('an identity that cannot be read', () => {
  test('names each key that is missing or fails its check', async () => {
    const broken = {
      ...await storefrontIdentity(),
      application: 'agent-dashboard',
      processId:   '48107',
      contracts:   { monitor: 'one' },
    };
    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf(broken)).toEqual({
      verdict:     'malformed',
      invalidKeys: ['application', 'processId', 'contracts.monitor'],
    });
  });

  test('names an identityVersion that is no whole number', async () => {
    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf({ ...await storefrontIdentity(), identityVersion: 1.5 }))
      .toEqual({ verdict: 'malformed', invalidKeys: ['identityVersion'] });
  });
});

describe('an identity with keys this Gaia does not know', () => {
  test('reads as it reads one without them, a key named as a minor included', async () => {
    const withoutAddedKeys = new IdentityIngestion(STOREFRONT_FACTS).readingOf(await storefrontIdentity());
    const withAddedKeys = { ...await storefrontIdentity(), identityMinor: 4, exampleAddedKey: { exampleNested: true } };

    expect(new IdentityIngestion(STOREFRONT_FACTS).readingOf(withAddedKeys)).toEqual(withoutAddedKeys);
  });
});
