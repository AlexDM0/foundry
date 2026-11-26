/**
 * What the setup's pages say around their step: what a pipeline is, the billing step's title row with the pipeline's state and the
 * waiting tickets, and the head of a step's card with its place in the steps' order.
 */
import type { ReactNode }                from 'react';
import type { BoardSetupRecordDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardSetupStep }           from '../../../../@types/board/BoardVocabulary.ts';
import {
  Row,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { ViewTitle }                                                    from '../../ViewTitle.tsx';
import { PipelineViewModel, SETUP_STEP_LABELS, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { BillingStepModel }                                             from './BillingStepModel.ts';

export const PIPELINE_WHAT_IT_IS = 'The pipeline is the path every ticket takes: who files it, who builds and reviews it, which commands check it, '
  + 'and where you approve. Forge builds nothing until you apply one.';

/** "Set up the pipeline" with what it is, and whether a setup is open beside the count of tickets waiting for a pipeline. */
export function SetupTitleRow({ facts }: { readonly facts: PipelineViewFacts }) {
  const setupIsOpen = facts.pipeline.setup !== null;
  const pendingTicketCount = BillingStepModel.pendingTicketCountOf(facts.page?.tickets ?? []);
  return (
    <View gap="two">
      <ViewTitle title="Set up the pipeline" lead={PIPELINE_WHAT_IT_IS} />
      <Row gap="six" paddingTop="eight">
        <Tag text={setupIsOpen ? 'Setup in progress' : 'Pipeline not set'} tone="warn" />
        <Tag text={BillingStepModel.waitingTicketsTextOf(pendingTicketCount)} tone="neutral" />
      </Row>
    </View>
  );
}

export interface SetupStepHeadProps {
  readonly step:   BoardSetupStep;
  /** The steps the record walks: the stepper's, with `entities` only in monorepo mode; `null` on the landing. */
  readonly record: BoardSetupRecordDocument | null;
  readonly lead:   string;
  readonly end?:   ReactNode;
}

/** "Step 1 of 6" after the signal dot, from the step's place in the steps the record walks, the step's name and what it decides. */
export function SetupStepHead({
  step, record, lead, end = null
}: SetupStepHeadProps) {
  return (
    <header className="board-pipeline-setup-card-head">
      <View gap="two">
        <Row centerY gap="seven">
          <span className="board-pipeline-setup-step-dot" aria-hidden="true" />
          <Text typeRole="small" muted>{PipelineViewModel.stepPositionTextOf(record, step)}</Text>
        </Row>
        <Text typeRole="phase" element="h3">{SETUP_STEP_LABELS[step]}</Text>
        <Text typeRole="lead" muted>{lead}</Text>
      </View>
      {end}
    </header>
  );
}
