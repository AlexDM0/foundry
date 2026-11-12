/**
 * The "About this pipeline" note's model, pure: whether the flow is the smallest kind (no review step), whether the warning that nothing
 * checks a commit shows (no phase has a gate), and one "WHERE STEPS GO" line per + slot the facts name, worded from its offered steps.
 */
import type { PipelineFlowFacts, PipelineInsertSlot, PipelineInsertableStep } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';

export interface MinimalPipelineNoteView {
  readonly warningIsShown: boolean;
  readonly stepLines:      readonly { readonly key: string; readonly text: string }[];
}

const OFFERED_STEP_WORDS: Readonly<Record<PipelineInsertableStep, string>> = Object.freeze({
  'build-gates':       'build gates',
  'review':            'a review (with the merge of main before it, its gates and re-review)',
  'human-code-review': 'human code review',
  'review-gates':      'review gates',
  're-review':         'a conditional re-review',
  'merge-gates':       'merge gates',
  'airlock-re-review': 'a conditional re-review',
});

function choiceListOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} or ${words.at(-1) ?? ''}`;
}

/** Where the slot stands, read from the steps it offers: the train's steps, the review's, or the Builder's line. */
function placeTextOf(slot: PipelineInsertSlot): string {
  if (slot.offeredSteps.some((step) => step === 'merge-gates' || step === 'airlock-re-review')) return 'In the merge train, before the fast-forward';
  if (slot.offeredSteps.some((step) => step === 'review-gates' || step === 're-review')) return 'After the review';
  return 'On the line from Builder';
}

/** The note belongs to a flow with no review step: Builder, then the merge train. */
function noteIsShownFor(flow: Pick<PipelineFlowFacts, 'nodes'>): boolean {
  return !flow.nodes.some((node) => node.nodeKind === 'review');
}

function noteOf(flow: Pick<PipelineFlowFacts, 'insertSlots' | 'gateRows'>): MinimalPipelineNoteView {
  const gateCount = flow.gateRows.build.length + flow.gateRows.review.length + flow.gateRows.merge.length;
  return {
    warningIsShown: gateCount === 0,
    stepLines:      flow.insertSlots.map((slot) => ({
      key:  slot.slotId,
      text: `${placeTextOf(slot)}: ${choiceListOf(slot.offeredSteps.map((step) => OFFERED_STEP_WORDS[step]))}.`,
    })),
  };
}

export const MinimalPipelineNoteModel = Object.freeze({ noteIsShownFor, noteOf });
