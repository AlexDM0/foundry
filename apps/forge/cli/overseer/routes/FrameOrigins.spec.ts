/**
 * Which origins may frame the Bridge. What matters: Gaia's record adds its `origin` only at version 1, so a record of another version, an
 * unreadable one or none adds nothing and the Bridge stays unframeable; agent-dashboard's record keeps adding its two origins; and an
 * origin both name is listed once.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { FrameOrigins }                                   from './FrameOrigins.ts';

const GAIA_ORIGIN = 'http://127.0.0.1:5180';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:4800';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function homeWith(records: { gaia?: string; dashboard?: string }): { homeDirectory: string; monitorFolder: string } {
  const homeDirectory = createScratchDirectory('frame-origins');
  scratchDirectories.push(homeDirectory);
  const monitorFolder = join(homeDirectory, '.example-monitor');
  if (records.gaia !== undefined) {
    mkdirSync(join(monitorFolder, 'gaia'), { recursive: true });
    writeFileSync(join(monitorFolder, 'gaia', 'server.json'), records.gaia);
  }
  if (records.dashboard !== undefined) {
    mkdirSync(join(homeDirectory, '.agent-progress-monitor', 'agent-dashboard'), { recursive: true });
    writeFileSync(join(homeDirectory, '.agent-progress-monitor', 'agent-dashboard', 'server.json'), records.dashboard);
  }
  return { homeDirectory, monitorFolder };
}

function gaiaRecord(fields: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1, url: `${GAIA_ORIGIN}/`, origin: GAIA_ORIGIN, processId: 4242, startedAt: '2026-11-12T09:00:00+01:00', ...fields
  });
}

describe('FrameOrigins.frameOriginsOf', () => {
  test('with no record no origin may frame the Bridge', () => {
    const { homeDirectory, monitorFolder } = homeWith({});
    expect(FrameOrigins.frameOriginsOf(homeDirectory, monitorFolder)).toEqual([]);
  });

  test('a version 1 Gaia record adds its origin, normalised', () => {
    const { homeDirectory, monitorFolder } = homeWith({ gaia: gaiaRecord({ origin: `${GAIA_ORIGIN}/` }) });
    expect(FrameOrigins.frameOriginsOf(homeDirectory, monitorFolder)).toEqual([GAIA_ORIGIN]);
  });

  test('a Gaia record of another version, an unreadable one, or one whose origin is no URL adds nothing', () => {
    const records = [
      gaiaRecord({ version: 2 }),
      gaiaRecord({ version: '1' }),
      '{"version": 1, "origin"',
      gaiaRecord({ origin: 'not a url' }),
      gaiaRecord({ origin: 'file:///example' }),
    ];
    for (const record of records) {
      const { homeDirectory, monitorFolder } = homeWith({ gaia: record });
      expect(FrameOrigins.frameOriginsOf(homeDirectory, monitorFolder), record).toEqual([]);
    }
  });

  test('agent-dashboard\'s origins and Gaia\'s are listed together, each once', () => {
    const { homeDirectory, monitorFolder } = homeWith({
      gaia:      gaiaRecord({}),
      dashboard: JSON.stringify({ url: `${DASHBOARD_ORIGIN}/`, boardOrigin: GAIA_ORIGIN }),
    });
    expect(FrameOrigins.frameOriginsOf(homeDirectory, monitorFolder)).toEqual([DASHBOARD_ORIGIN, GAIA_ORIGIN]);
  });
});
