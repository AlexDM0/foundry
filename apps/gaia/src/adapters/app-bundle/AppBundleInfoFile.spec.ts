/**
 * The bundle's place is the home's Applications folder, and its Info.plist is read for the install version only: a plist with the key
 * reads its integer, and one without it, as another application's, is unreadable, so neither the launcher nor the install mistakes it
 * for a bundle of Gaia's. A bundle with no plist reads as absent.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath }                from '../../testing/ScratchRoot.ts';
import { AppBundleInfoFile, applicationsFolderIn, infoPlistPathIn } from './AppBundleInfoFile.ts';

let appBundlePath = '';

beforeEach(() => {
  appBundlePath = join(createScratchDirectory('app-bundle-info'), 'Gaia.app');
});

afterEach(() => {
  removeScratchPath(dirname(appBundlePath));
});

function writeInfoPlist(contents: string): void {
  mkdirSync(dirname(infoPlistPathIn(appBundlePath)), { recursive: true });
  writeFileSync(infoPlistPathIn(appBundlePath), contents);
}

describe('the installed app bundle', () => {
  test('lives in the Applications folder of the home, with its plist in Contents', () => {
    expect(applicationsFolderIn('/Users/example')).toBe('/Users/example/Applications');
    expect(infoPlistPathIn('/Users/example/Applications/Gaia.app')).toBe('/Users/example/Applications/Gaia.app/Contents/Info.plist');
  });
});

describe('the Info.plist of a bundle', () => {
  test('reads the install version as Gaia writes it', async () => {
    writeInfoPlist('<dict>\n  <key>LSUIElement</key>\n  <true/>\n  <key>GaiaInstallVersion</key>\n  <integer>3</integer>\n</dict>\n');
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'readable', installVersion: 3 });
  });

  test('is unreadable without an install version, as another application\'s plist is', async () => {
    writeInfoPlist('<dict>\n  <key>CFBundleName</key>\n  <string>Gaia</string>\n</dict>\n');
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'unreadable', failure: 'no GaiaInstallVersion' });
  });

  test('is unreadable when the install version is no integer', async () => {
    writeInfoPlist('<key>GaiaInstallVersion</key><string>1</string>');
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'unreadable', failure: 'no GaiaInstallVersion' });
  });

  test('is unreadable when the install version is past a safe integer', async () => {
    writeInfoPlist('<key>GaiaInstallVersion</key><integer>99999999999999999999</integer>');
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'unreadable', failure: 'GaiaInstallVersion out of range' });
  });

  test('is absent for a bundle with no plist', async () => {
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'absent' });
  });
});
