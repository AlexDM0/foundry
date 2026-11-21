/**
 * Talos and Hephaestus find each other's files only by these paths, so each is held to the name the files table gives it: Talos's own
 * files in the board's `talos` folder by start number, a child's beside its `/`-separated folder by instance, the secret owner-only.
 */
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  childFilesOf,
  launchRegistryPathOf,
  privateFolderOf,
  startFilePathOf,
  talosFolderOf,
  talosLogPathOf,
  talosRecordPathOf,
  talosSecretPathOf,
} from './TalosFiles.ts';

const BOARD_FOLDER = join('/example', 'board');
const MONITOR_FOLDER = join('/example', 'monitor');

test('Talos\'s own files sit in the board\'s talos folder, named by start number', () => {
  expect(talosFolderOf(BOARD_FOLDER)).toBe(join(BOARD_FOLDER, 'talos'));
  expect(startFilePathOf(BOARD_FOLDER, 3)).toBe(join(BOARD_FOLDER, 'talos', 'start-3.json'));
  expect(talosRecordPathOf(BOARD_FOLDER, 3)).toBe(join(BOARD_FOLDER, 'talos', 'talos-3.json'));
  expect(talosLogPathOf(BOARD_FOLDER, 3)).toBe(join(BOARD_FOLDER, 'talos', 'talos-3.log'));
  expect(launchRegistryPathOf(BOARD_FOLDER, 3)).toBe(join(BOARD_FOLDER, 'talos', 'launches-3.ndjson'));
});

test('a child\'s files sit in its folder under the board, named by instance', () => {
  const childFolder = join(BOARD_FOLDER, 'jobs', 'J1', 'gate-1');
  expect(childFilesOf(BOARD_FOLDER, 'jobs/J1/gate-1', 2)).toEqual({
    recordPath:        join(childFolder, 'child-2.json'),
    eventLogPath:      join(childFolder, 'events-2.ndjson'),
    standardErrorPath: join(childFolder, 'child-2.log'),
  });
});

test('the secret sits in the tracker\'s private folder of the monitor folder', () => {
  expect(privateFolderOf(MONITOR_FOLDER, 'example-tracker')).toBe(join(MONITOR_FOLDER, 'private', 'example-tracker'));
  expect(talosSecretPathOf(MONITOR_FOLDER, 'example-tracker', 3)).toBe(join(MONITOR_FOLDER, 'private', 'example-tracker', 'talos-3.secret'));
});
