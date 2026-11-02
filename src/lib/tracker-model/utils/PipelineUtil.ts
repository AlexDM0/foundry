/**
 * What the stored pipeline means beside its steps: the content hash a row records of the pipeline it is judged by, and the folders its
 * gates write. The steps stay structured: each runs as its own process, and a display line is the shell grammar's to render.
 */
import type { Pipeline }      from '../@types/Pipeline.ts';
import { TicketBodyHashUtil } from './TicketBodyHashUtil.ts';

/** Every key in a fixed order, so a hand edit that only reorders or reindents keeps the hash. */
function pipelineHashOf(pipeline: Readonly<Pipeline>): string {
  const canonical = {
    prepare: pipeline.prepare.map((step) => ({ name: step.name, run: step.run })),
    gates:   pipeline.gates.map((gate) => ({
      name:         gate.name,
      run:          gate.run,
      fix:          gate.fix ?? null,
      in:           gate.in ?? null,
      definedBy:    gate.definedBy ?? [],
      network:      gate.network ?? [],
      writes:       gate.writes ?? [],
      overseerOnly: gate.overseerOnly ?? false,
    })),
    review:       pipeline.review === undefined ? null : { name: pipeline.review.name, model: pipeline.review.model ?? null, effort: pipeline.review.effort ?? null },
    constitution: pipeline.constitution ?? [],
    agents:       Object.entries(pipeline.agents ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  };
  return TicketBodyHashUtil.bodyHashOf(JSON.stringify(canonical));
}

function writablePathsOf(pipeline: Readonly<Pipeline>): string[] {
  return [...new Set(pipeline.gates.flatMap((gate) => gate.writes ?? []))];
}

export const PipelineUtil = Object.freeze({
  pipelineHashOf,
  writablePathsOf,
});
