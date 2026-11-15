/**
 * The one reading rule of every versioned contract, against its own contract. What matters: the major is read from the key a contract has
 * always carried and a stored file's minor from its sibling, an absent minor reads as 0, a document read without a minor key passes over a
 * key of that name, a major or a minor that is no whole number is named, a document without the major is unversioned; a known major reads
 * at any minor, an older major only where it is listed, a newer one never. Each verdict is planted with an example document.
 */
import { describe, expect, test } from 'bun:test';

import { ContractVersionUtil } from './ContractVersionUtil.ts';

const EXAMPLE_KEYS = { majorKey: 'exampleVersion', minorKey: 'exampleMinor' } as const;

const EXAMPLE_ENDPOINT_KEYS = { majorKey: 'exampleVersion' } as const;

const EXAMPLE_KNOWN_MAJOR = 3;

describe('versionOf', () => {
  test('reads the major and the minor from their keys', () => {
    expect(ContractVersionUtil.versionOf({ exampleVersion: 3, exampleMinor: 2 }, EXAMPLE_KEYS)).toEqual({ verdict: 'versioned', version: { major: 3, minor: 2 } });
  });

  test('reads an absent minor as 0', () => {
    expect(ContractVersionUtil.versionOf({ exampleVersion: 3 }, EXAMPLE_KEYS)).toEqual({ verdict: 'versioned', version: { major: 3, minor: 0 } });
  });

  test('reads a document read without a minor key at minor 0, passing over a key of the minor\'s name', () => {
    expect(ContractVersionUtil.versionOf({ exampleVersion: 3, exampleMinor: 'example' }, EXAMPLE_ENDPOINT_KEYS)).toEqual({ verdict: 'versioned', version: { major: 3, minor: 0 } });
  });

  test('names a major or a minor that is no whole number, a null one included', () => {
    for (const major of ['3', 3.5, -1, null]) {
      expect(ContractVersionUtil.versionOf({ exampleVersion: major }, EXAMPLE_KEYS)).toEqual({ verdict: 'malformed', invalidKey: 'exampleVersion' });
    }
    for (const minor of ['1', 0.5, -1, null]) {
      expect(ContractVersionUtil.versionOf({ exampleVersion: 3, exampleMinor: minor }, EXAMPLE_KEYS)).toEqual({ verdict: 'malformed', invalidKey: 'exampleMinor' });
    }
  });

  test('answers unversioned for a document without the major, one that is no object, and one whose major is only inherited', () => {
    for (const document of [{ exampleMinor: 1 }, null, [3], 'exampleVersion', Object.create({ exampleVersion: 3 })]) {
      expect(ContractVersionUtil.versionOf(document, EXAMPLE_KEYS)).toEqual({ verdict: 'unversioned' });
    }
  });
});

describe('majorVerdictOf', () => {
  test('reads the known major whatever the minor, since the minor is not asked', () => {
    expect(ContractVersionUtil.majorVerdictOf(3, EXAMPLE_KNOWN_MAJOR)).toBe('known');
  });

  test('answers newer for a major above the known one, and older for any one below it', () => {
    expect(ContractVersionUtil.majorVerdictOf(4, EXAMPLE_KNOWN_MAJOR)).toBe('newer');
    expect(ContractVersionUtil.majorVerdictOf(2, EXAMPLE_KNOWN_MAJOR)).toBe('older');
    expect(ContractVersionUtil.majorVerdictOf(1, EXAMPLE_KNOWN_MAJOR)).toBe('older');
  });
});

describe('readMajorOf', () => {
  test('answers the major of a document at the known major, at a newer minor with a key the reader does not know as at minor 0', () => {
    expect(ContractVersionUtil.readMajorOf({ exampleVersion: 3 }, EXAMPLE_KEYS, EXAMPLE_KNOWN_MAJOR)).toBe(3);
    expect(ContractVersionUtil.readMajorOf({ exampleVersion: 3, exampleMinor: 9, exampleAddedKey: true }, EXAMPLE_KEYS, EXAMPLE_KNOWN_MAJOR)).toBe(3);
  });

  test('answers null for a newer major, an older one, an unversioned or a malformed document', () => {
    for (const document of [{ exampleVersion: 4 }, { exampleVersion: 2 }, {}, { exampleVersion: 3, exampleMinor: '1' }]) {
      expect(ContractVersionUtil.readMajorOf(document, EXAMPLE_KEYS, EXAMPLE_KNOWN_MAJOR)).toBeNull();
    }
  });
});
