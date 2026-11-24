/**
 * The pipeline part of the board model mapped out to the page's contract, on the recorded board's pipeline: an applied pipeline over two
 * entities and an update setup whose entities draft holds a standing refusal. What matters: every value reaches its page field, a refusal's
 * sentence under `text` unchanged, and a refusal's fix keeps its typed draft edits. A pipeline in the spec-then-plan route carries its route
 * and each agent's document reading rules to the page; a pipeline without them carries neither key.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardPipelineFacts } from '../../shared/@types/board/BoardPipeline.ts';
import { PipelineDocumentMapUtil } from './PipelineDocumentMapUtil.ts';
import {
  markdownLeftAsWritten,
  modelLeavesOf,
  pageLeavesOf,
  recordedBoardModel
} from './testing/BoardModelLeaves.ts';

describe('pipelineFactsOut', () => {
  test('carries every value of the recorded pipeline facts to its page field', async () => {
    const { pipeline } = await recordedBoardModel();
    expect(Object.fromEntries(pageLeavesOf(PipelineDocumentMapUtil.pipelineFactsOut(pipeline, markdownLeftAsWritten)))).toEqual(Object.fromEntries(modelLeavesOf(pipeline)));
  });

  test('words no refusal itself: each entity refusal\'s text is the forge\'s sentence', async () => {
    const { pipeline } = await recordedBoardModel();
    const { setup } = PipelineDocumentMapUtil.pipelineFactsOut(pipeline, markdownLeftAsWritten);
    expect(setup?.entityRefusals.map(({ text }) => text)).toEqual(pipeline.setup?.entityRefusals.map(({ sentence }) => sentence));
  });
});

describe('refusalOut', () => {
  test('marks the refusal as the forge\'s and keeps its code, fields and sentence', () => {
    const sentence = 'There is no readable ticket 999. Run `forge ticket list` to see what this tracker holds.';
    expect(PipelineDocumentMapUtil.refusalOut({ code: 'no-readable-ticket', fields: { reference: '999' }, sentence })).toEqual({
      refusedBy: 'forge', code: 'no-readable-ticket', fields: { reference: '999' }, text: sentence
    });
  });
});

/** The recorded pipeline facts with the applied pipeline in the spec-then-plan route and the reviewer's document reading rules set. */
function pipelineInTheDocumentsRoute(pipeline: BoardPipelineFacts): BoardPipelineFacts {
  if (pipeline.applied.readingVerdict !== 'readable') throw new Error('The recorded board applied a readable pipeline.');
  const { applied } = pipeline;
  const reviewer = {
    model: null, effort: null, instructions: null, documents: { spec: 'always', plan: 'never' }
  } as const;
  const definition = { ...applied.pipeline, ticketWriting: 'spec-then-plan', agents: { ...applied.pipeline.agents, reviewer } } as const;
  return { ...pipeline, applied: { ...applied, pipeline: definition } };
}

describe('pipelineFactsOut, in the spec-then-plan route', () => {
  test('carries the route and an agent\'s document reading rules, as every other value, to its page field', async () => {
    const pipeline = pipelineInTheDocumentsRoute((await recordedBoardModel()).pipeline);
    expect(Object.fromEntries(pageLeavesOf(PipelineDocumentMapUtil.pipelineFactsOut(pipeline, markdownLeftAsWritten)))).toEqual(Object.fromEntries(modelLeavesOf(pipeline)));
    const { applied } = PipelineDocumentMapUtil.pipelineFactsOut(pipeline, markdownLeftAsWritten);
    expect(applied.readingVerdict === 'readable' ? [applied.pipeline.ticketWriting, applied.pipeline.agents.reviewer?.documents] : null).toEqual([
      'spec-then-plan',
      { spec: 'always', plan: 'never' },
    ]);
  });

  test('carries no route and no reading rules where the pipeline names none', async () => {
    const { applied } = PipelineDocumentMapUtil.pipelineFactsOut((await recordedBoardModel()).pipeline, markdownLeftAsWritten);
    if (applied.readingVerdict !== 'readable') throw new Error('The recorded board applied a readable pipeline.');
    expect(applied.pipeline).not.toHaveProperty('ticketWriting');
    expect(Object.values(applied.pipeline.agents).filter((settings) => settings !== undefined && 'documents' in settings)).toEqual([]);
  });
});
