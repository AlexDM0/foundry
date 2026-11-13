/**
 * A0Setup, the billing step: who pays for the agents (two cards, and the cap per launch under the API key), then the pipeline agent that
 * works the pipeline out with User. On the landing the one start sends the chosen billing and opens the research. Reopened from the
 * stepper while a record is open, a billing change is saved to the record, and the start is replaced by the way back to the current step,
 * or by Continue while the record is still at billing.
 */
import { useId, useState } from 'react';

import type { PipelineSetup }                        from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { Button }                                    from '../../../design-system/Button.tsx';
import { ChoiceOption }                              from '../../../design-system/ChoiceOption.tsx';
import { ModelEffortMeter }                          from '../../../design-system/ModelEffortMeter.tsx';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { HashRouter }                                from '../../../shell/HashRouter.ts';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
import {
  BILLING_CARDS,
  BillingStepModel,
  HOW_IT_WORKS_LINES,
  type BillingChoice
} from './BillingStepModel.ts';

const CARD_LETTERS = ['a', 'b'] as const;

export interface BillingStepProps {
  readonly facts:                      PipelineViewFacts;
  /** The landing of an unreadable `pipeline.json`: the start says that Apply replaces the file. */
  readonly replacesUnreadablePipeline: boolean;
}

interface BillingCardsProps {
  readonly choice:   BillingChoice;
  readonly onChoose: (choice: BillingChoice) => void;
}

function BillingCards({ choice, onChoose }: BillingCardsProps) {
  const groupName = useId();
  return (
    <div className="bridge-pipeline-billing-cards">
      {BILLING_CARDS.map((card, index) => (
        <ChoiceOption
          key={card.mode}
          letter={CARD_LETTERS[index] ?? ''}
          label={card.label}
          description={card.description}
          chosen={choice.mode === card.mode}
          variant="card"
          input={{
            type: 'radio', name: groupName, checked: choice.mode === card.mode, accessibleName: card.label, onChange: () => onChoose({ ...choice, mode: card.mode }),
          }}
          {...(card.mode === 'api'
            ? {
              facts: (
                <span className="bridge-pipeline-billing-cap">
                  Cap per launch
                  <span className="bridge-pipeline-billing-cap-field">
                    $
                    <input
                      className="bridge-pipeline-billing-cap-input"
                      type="text"
                      inputMode="decimal"
                      value={choice.capText}
                      placeholder="none"
                      aria-label="Cap per launch in US dollars"
                      onFocus={() => onChoose({ ...choice, mode: 'api' })}
                      onChange={(event) => onChoose({ mode: 'api', capText: event.currentTarget.value })}
                    />
                  </span>
                </span>
              ),
            }
            : {})}
        />
      ))}
    </div>
  );
}

interface StartOrBackProps {
  readonly record:                     PipelineSetup | null;
  readonly choice:                     BillingChoice;
  readonly replacesUnreadablePipeline: boolean;
}

function StartOrBack({ record, choice, replacesUnreadablePipeline }: StartOrBackProps) {
  const continueCommand = record === null ? null : BillingStepModel.continueCommandOf(record);
  if (continueCommand !== null) {
    return (
      <CommandButton
        label="Continue to research"
        command={continueCommand}
        primary
        attention
        onApplied={() => HashRouter.navigateTo(PipelineViewModel.setupStepRouteOf('research'))}
      />
    );
  }
  if (record !== null) {
    return <Button label={BillingStepModel.backLabelOf(record)} emphasis="primary" href={PipelineViewModel.setupStepFragmentOf(record.currentStep)} />;
  }
  return (
    <CommandButton
      label="Set up the pipeline"
      command={BillingStepModel.startCommandOf(choice, replacesUnreadablePipeline)}
      primary
      attention
      onApplied={() => HashRouter.navigateTo(PipelineViewModel.setupStepRouteOf('research'))}
    />
  );
}

export function BillingStep({ facts, replacesUnreadablePipeline }: BillingStepProps) {
  const record = facts.pipelineSetup?.record ?? null;
  const [choice, setChoice] = useState<BillingChoice>(() => BillingStepModel.billingChoiceOf(record?.billing ?? null));
  const meter = BillingStepModel.pipelineAgentMeterOf(record, facts);
  const pendingTicketCount = BillingStepModel.pendingTicketCountOf(facts.page?.tickets ?? []);
  const billingHeadingId = useId();
  const agentHeadingId = useId();
  return (
    <div className="bridge-pipeline-setup" data-reopened={record === null ? undefined : ''}>
      <section className="bridge-pipeline-setup-hero">
        <span className="bridge-pipeline-setup-chip">
          <span className="bridge-pipeline-setup-chip-dot" aria-hidden="true" />
          {record === null ? 'Pipeline not set' : 'Setup in progress'}
        </span>
        <h2 className="bridge-pipeline-setup-heading">Set the pipeline before the first build</h2>
        <p className="bridge-pipeline-setup-lead">
          The pipeline is the path every ticket takes: which agent files it, which agent builds and reviews it, which commands judge it after the
          build and before the merge, and where User approves. Until one is applied, no ticket builds.
        </p>
        <span className="bridge-pipeline-setup-fact">{BillingStepModel.waitingTicketsTextOf(pendingTicketCount)}</span>
      </section>

      <section className="bridge-pipeline-setup-section" aria-labelledby={billingHeadingId}>
        <h3 className="bridge-pipeline-setup-section-heading" id={billingHeadingId}>
          <span className="bridge-pipeline-setup-section-number">1</span>
          Who pays for the agents
        </h3>
        <BillingCards choice={choice} onChoose={setChoice} />
        {record === null
          ? null
          : <CommandButton label="Save billing" command={BillingStepModel.billingChangeCommandOf(record, choice)} />}
      </section>

      <section className="bridge-pipeline-setup-section" aria-labelledby={agentHeadingId}>
        <h3 className="bridge-pipeline-setup-section-heading" id={agentHeadingId}>
          <span className="bridge-pipeline-setup-section-number">2</span>
          Set up the pipeline
        </h3>
        <div className="bridge-pipeline-setup-agent-card">
          <div className="bridge-pipeline-setup-agent-text">
            <span className="bridge-pipeline-setup-agent-title">
              <b>Work it out with the pipeline agent</b>
              {meter === null
                ? null
                : (
                  <ModelEffortMeter
                    model={meter.model}
                    effort={meter.effort}
                    level={meter.level}
                    levelCount={meter.levelCount}
                    accessibleName={meter.accessibleName}
                    size="node"
                  />
                )}
            </span>
            <ol className="bridge-pipeline-setup-agent-steps">
              {HOW_IT_WORKS_LINES.map((line) => <li key={line}>{line}</li>)}
            </ol>
            <p className="bridge-pipeline-setup-agent-note">Starts one agent session, also while the board is paused. Nothing is stored until Apply.</p>
          </div>
          <div className="bridge-pipeline-setup-agent-action">
            <StartOrBack record={record} choice={choice} replacesUnreadablePipeline={replacesUnreadablePipeline} />
          </div>
        </div>
      </section>
    </div>
  );
}
