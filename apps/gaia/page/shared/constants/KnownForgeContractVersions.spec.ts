/**
 * The page's copy of the forge contract versions it judges a forge by is the server's, number for number, so the page and the server never
 * disagree on whether a forge can be sent a command.
 */
import { describe, expect, test } from 'bun:test';

import { CONTRACT_VERSIONS }             from '../../../src/shared/constants/ContractVersions.ts';
import { KNOWN_FORGE_CONTRACT_VERSIONS } from './KnownForgeContractVersions.ts';

describe('the forge contract versions the page knows', () => {
  test('are the control version the server knows', () => {
    expect(KNOWN_FORGE_CONTRACT_VERSIONS).toEqual({ control: CONTRACT_VERSIONS.forgeControl });
  });
});
