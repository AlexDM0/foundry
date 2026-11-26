import { join, relative, sep } from 'node:path';

import { privateFolderOf } from '../../lib/talos/TalosFiles.ts';

export interface HephaestusFiles {
  /** `<data>/hephaestus/`: it holds the Hephaestus locks, and no secret. */
  hephaestusDirectory: string;
  /** `<data>/hephaestus.log`, appended in place. */
  logFilePath:         string;
  /** `<data>/hephaestus/presence.json`: the newest generation's start, abandoned passes and ending. */
  presenceFilePath:    string;
  /** `<data>/hephaestus/heartbeat.json`: the newest beat, rewritten at each renewal Talos confirmed. */
  heartbeatFilePath:   string;
  /** `<data>/hephaestus/crash-logs/`: one `crash-<number>.json` per crash, never rewritten. */
  crashLogDirectory:   string;
}

export function hephaestusFilesIn(trackerDirectory: string): HephaestusFiles {
  const hephaestusDirectory = join(trackerDirectory, 'hephaestus');
  return {
    hephaestusDirectory,
    logFilePath:       join(trackerDirectory, 'hephaestus.log'),
    presenceFilePath:  join(hephaestusDirectory, 'presence.json'),
    heartbeatFilePath: join(hephaestusDirectory, 'heartbeat.json'),
    crashLogDirectory: join(hephaestusDirectory, 'crash-logs'),
  };
}

const JOBS_FOLDER = 'jobs';

const DATA_FOLDER_PATH_SEPARATOR = '/';

/** `<data>/jobs/<J>/`: a job's own files, its children's among them. */
export function jobFolderIn(trackerDirectory: string, jobId: string): string {
  return join(trackerDirectory, JOBS_FOLDER, jobId);
}

/** `jobs/<J>/<file>`, with `/` on every platform: a job's file as named inside the board's data folder. */
export function jobFileInDataFolderOf(jobId: string, fileName: string): string {
  return [JOBS_FOLDER, jobId, fileName].join(DATA_FOLDER_PATH_SEPARATOR);
}

/** A file's path inside the board's data folder, with `/` on every platform, as an unreadable file is named. */
export function dataFolderPathOf(trackerDirectory: string, filePath: string): string {
  return relative(trackerDirectory, filePath).split(sep).join(DATA_FOLDER_PATH_SEPARATOR);
}

/** The API token, in the board's owner-only folder; every reader takes the path from the Hephaestus lock's `tokenFile`. */
export function hephaestusTokenPathOf(monitorFolder: string, trackerId: string): string {
  return join(privateFolderOf(monitorFolder, trackerId), 'token');
}
