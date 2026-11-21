/**
 * The pipeline part of the board model mapped out to the page's contract, on the recorded board's pipeline: an applied pipeline over two
 * entities and an update setup whose entities draft holds a standing refusal. What matters: every value reaches its page field, a refusal's
 * sentence under `text` unchanged, and a refusal's fix keeps its typed draft edits.
 */
import { describe, expect, test } from 'bun:test';

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
