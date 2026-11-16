/**
 * A `pipeline.json` that version 2 wrote, before version 3 added step folders, gate folders from the repository's root and the reach. What
 * matters: it reads unchanged, writes back byte for byte as version 2, and keeps the content hash and the phase hashes version 2 gave it, so
 * an Apply opened before the upgrade and every green recorded before it still hold. `FrozenVersionTwoPipeline.json` and the hashes below
 * were taken from forge at `db64ed0a`, whose `PipelineFile.contentsOf` and `PipelineUtil` wrote and hashed its own spec's example pipeline;
 * retake them only from that commit, never from this build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';
import type { GatePhase }                                 from '../../lib/tracker-model/@types/GatePhase.ts';
import { GATE_PHASES }                                    from '../../lib/tracker-model/@types/GatePhase.ts';
import { PipelineUtil }                                   from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { PipelineFile }                                   from './PipelineFile.ts';

const FROZEN_VERSION_TWO_TEXT = readFileSync(join(import.meta.dir, 'FrozenVersionTwoPipeline.json'), 'utf8');

const FROZEN_VERSION_TWO_CONTENT_HASH = '29d82186f27c4ed4';

const FROZEN_VERSION_TWO_PHASE_HASHES: Record<GatePhase, string> = { build: '28bdb379042f397c', review: '8922a86da01b0edd', merge: 'e62aaeb47d8902f8' };

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('pipeline-file-version-two');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function frozenReading(): ReturnType<typeof PipelineFile.read> {
  const pipelineFilePath = join(scratchDirectory, 'pipeline.json');
  writeFileSync(pipelineFilePath, FROZEN_VERSION_TWO_TEXT);
  return PipelineFile.read(pipelineFilePath);
}

test('a file version 2 wrote reads with every key it holds, and writes back as version 2 byte for byte', () => {
  const reading = frozenReading();
  if (reading.verdict !== 'readable') throw new Error(`the frozen version 2 file read as ${reading.verdict}`);

  const { version: _storedVersion, ...storedKeys } = JSON.parse(FROZEN_VERSION_TWO_TEXT) as Record<string, unknown>;
  expect(reading.pipeline).toMatchObject(storedKeys);
  expect(PipelineUtil.formatVersionOf(reading.pipeline)).toBe(2);
  expect(PipelineFile.contentsOf(reading.pipeline)).toBe(FROZEN_VERSION_TWO_TEXT);
});

test('a file version 2 wrote keeps the content hash and the phase hashes version 2 gave it', () => {
  const reading = frozenReading();
  if (reading.verdict !== 'readable') throw new Error(`the frozen version 2 file read as ${reading.verdict}`);

  expect(PipelineUtil.contentHashOf(reading.pipeline)).toBe(FROZEN_VERSION_TWO_CONTENT_HASH);
  for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(reading.pipeline, phase), phase).toBe(FROZEN_VERSION_TWO_PHASE_HASHES[phase]);
});
