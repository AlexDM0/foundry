/**
 * The registry recording: the five boards it brings up and the example values each run-drawn value is recorded as, and the recorded
 * registry document the registry specs read. Test-only.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import {
  boundaryRecordingReadingOf,
  recordCommandOf,
  recordingPathOf,
  repositoryRoot,
} from '../../../testing/BoundaryRecordings.ts';

export type RegistryBoardName = 'example-agency' | 'example-bookshop' | 'example-clinic' | 'example-dairy' | 'example-estate';

export interface RegistryBoardExample {
  readonly project:   string;
  readonly root:      string;
  readonly trackerId: string;
}

export const REGISTRY_RECORDING = {
  recordingName:   'forge-registry',
  callShape:       'read projects.json',
  agencyGitOrigin: 'git@example.invalid:example/example-agency.git',
  boards:          {
    'example-agency':   { project: 'Example Agency', root: '/Users/example/development/example-agency', trackerId: '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c0a37' },
    'example-bookshop': { project: 'Example Bookshop', root: '/Users/example/development/example-bookshop', trackerId: '8a3d1f60-2c4b-4e7a-b915-6f0e2d8c4b19' },
    'example-clinic':   { project: 'Example Clinic', root: '/Users/example/development/example-clinic', trackerId: 'c47e9b2a-0d5f-4a18-8e63-91b7f4a2d0c5' },
    'example-dairy':    { project: 'Example Dairy', root: '/Users/example/development/example-dairy', trackerId: 'e2b86d14-9f3a-4c70-a5d2-3b8e0f6c7a91' },
    'example-estate':   { project: 'Example Estate', root: '/Users/example/development/example-estate', trackerId: '1d7f3c58-6a2e-4b9d-8c04-e5a19b3f6d82' },
  } satisfies Readonly<Record<RegistryBoardName, RegistryBoardExample>>,
  /** The address and process each started Overseer is recorded with, in the order the boards are started. */
  overseers: [
    { address: '127.0.0.1:4987', processId: 4242 },
    { address: '127.0.0.1:4988', processId: 5151 },
    { address: '127.0.0.1:4990', processId: 5353 },
    { address: '127.0.0.1:4989', processId: 6060 },
  ],
} as const;

/** The registry document the forge wrote, as recorded for this OS. */
export function recordedRegistryDocument(operatingSystem: string = process.platform): Record<string, unknown> {
  const recordingPath = recordingPathOf(REGISTRY_RECORDING.recordingName, operatingSystem);
  const reading = boundaryRecordingReadingOf(readFileSync(join(repositoryRoot(), recordingPath), 'utf8'));
  const recorded = reading.verdict === 'readable' ? reading.recording.answers.find(({ callShape }) => callShape === REGISTRY_RECORDING.callShape) : undefined;
  if (recorded === undefined || typeof recorded.answer !== 'object' || recorded.answer === null) {
    throw new Error(`${recordingPath} holds no registry. Record it with \`${recordCommandOf(REGISTRY_RECORDING.recordingName)}\`.`);
  }
  return recorded.answer as Record<string, unknown>;
}
