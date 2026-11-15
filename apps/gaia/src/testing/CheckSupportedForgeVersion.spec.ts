/**
 * The supported-forge step of verify. What matters: it warns only while Gaia's supported forge version is behind forge's current one, by
 * major or minor, and says which version to take up; at forge's current version, or past it, it has nothing to say.
 */
import { describe, expect, test } from 'bun:test';

import { supportedForgeVersionWarningOf } from './CheckSupportedForgeVersion.ts';

describe('the supported-forge step', () => {
  test('warns while the supported forge version is behind forge\'s current one, by its minor or its major', () => {
    expect(supportedForgeVersionWarningOf({ major: 1, minor: 1 }, { major: 1, minor: 2 }))
      .toBe('Gaia supports forge 1.1, behind forge\'s current 1.2: take up what 1.2 changed and raise SUPPORTED_FORGE_VERSION.');
    expect(supportedForgeVersionWarningOf({ major: 1, minor: 9 }, { major: 2, minor: 0 })).toStartWith('Gaia supports forge 1.9, behind forge\'s current 2.0');
  });

  test('says nothing at forge\'s current version or past it', () => {
    expect(supportedForgeVersionWarningOf({ major: 1, minor: 1 }, { major: 1, minor: 1 })).toBeNull();
    expect(supportedForgeVersionWarningOf({ major: 1, minor: 2 }, { major: 1, minor: 1 })).toBeNull();
  });
});
