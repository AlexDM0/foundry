/**
 * A `pipeline.json` that version 3 wrote, before version 4 added entities. What matters: it reads unchanged, writes back byte for byte as
 * version 3, and keeps the content hash and the phase hashes version 3 gave it, so an Apply opened before the upgrade and every green
 * recorded before it still hold. `FrozenVersionThreePipeline.json` and the hashes below were taken from forge at `22e237b3`, whose
 * `PipelineFile.contentsOf` and `PipelineUtil` wrote and hashed `PipelineFile.spec.ts`'s example pipeline with both approvals set; retake
 * them only from that commit, never from this build.
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

const FROZEN_VERSION_THREE_TEXT = readFileSync(join(import.meta.dir, 'FrozenVersionThreePipeline.json'), 'utf8');

const FROZEN_VERSION_THREE_CONTENT_HASH = '0d1df259fdd21da2';

const FROZEN_VERSION_THREE_PHASE_HASHES: Record<GatePhase, string> = { build: 'e79dd9f0feaad57a', review: 'b03eda2513d57b2f', merge: '0c90e113c871fdd8' };

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('pipeline-file-version-three');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function frozenReading(): ReturnType<typeof PipelineFile.read> {
  const pipelineFilePath = join(scratchDirectory, 'pipeline.json');
  writeFileSync(pipelineFilePath, FROZEN_VERSION_THREE_TEXT);
  return PipelineFile.read(pipelineFilePath);
}

test('a file version 3 wrote reads with every key it holds, and writes back as version 3 byte for byte', () => {
  const reading = frozenReading();
  if (reading.verdict !== 'readable') throw new Error(`the frozen version 3 file read as ${reading.verdict}`);

  const { version: _storedVersion, ...storedKeys } = JSON.parse(FROZEN_VERSION_THREE_TEXT) as Record<string, unknown>;
  expect(reading.pipeline).toMatchObject(storedKeys);
  expect(PipelineUtil.formatVersionOf(reading.pipeline)).toBe(3);
  expect(PipelineFile.contentsOf(reading.pipeline)).toBe(FROZEN_VERSION_THREE_TEXT);
});

test('a file version 3 wrote keeps the content hash and the phase hashes version 3 gave it', () => {
  const reading = frozenReading();
  if (reading.verdict !== 'readable') throw new Error(`the frozen version 3 file read as ${reading.verdict}`);

  expect(PipelineUtil.contentHashOf(reading.pipeline)).toBe(FROZEN_VERSION_THREE_CONTENT_HASH);
  for (const phase of GATE_PHASES) expect(PipelineUtil.phaseHashOf(reading.pipeline, phase), phase).toBe(FROZEN_VERSION_THREE_PHASE_HASHES[phase]);
});
