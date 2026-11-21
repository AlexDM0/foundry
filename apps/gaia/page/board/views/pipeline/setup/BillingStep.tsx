/**
 * A0Setup, the billing step, as FlowSetup draws it: the page's title row with the pipeline's state and the waiting tickets, the Billing
 * step card with who pays for the agents (two cards, and the cap per launch under the API key), and what the pipeline decides in its four
 * phases; beside it the pipeline agent's panel, which introduces Flint and what it does once started; the footer words the chosen billing.
 * On the landing the one start sends the chosen billing and opens the research. Reopened from the step bar while a record is open, a
 * billing change is saved to the record, and the start is replaced by the way back to the current step, or by Continue while the record
 * is still at billing.
 */
import { ActionBar }                                 from 'design-system/ActionBar';
import { Button }                                    from 'design-system/Button';
import { Card }                                      from 'design-system/Card';
import { ChoiceInput, ChoiceOption }                 from 'design-system/ChoiceOption';
import { Row }                                       from 'design-system/Row';
import { Tag }                                       from 'design-system/Tag';
import { Text }                                      from 'design-system/Text';
import { View }                                      from 'design-system/View';
import { useId, useState, type ReactNode }           from 'react';
import type { BoardSetupRecordDocument }             from '../../../../@types/board/BoardPipelineDocuments.ts';
import { FlintSlotHabitat }                          from '../../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                       from '../../../flint/FlintSlotHabitats.ts';
import { useBoardHrefOf, useBoardNavigation }        from '../../../shell/BoardRouteLinks.ts';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { useCoveringPanelHoldsTheFlintSlot }         from '../../../shell/CoveringPanel.ts';
import { ViewTitle }                                 from '../../ViewTitle.tsx';
import { PipelinePage }                              from '../PipelinePage.tsx';
import { PipelinePanel, PipelinePanelBody }          from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { AgentMeter }                                from '../agent-panel/AgentMeter.tsx';
import { PIPELINE_AGENT_FLINT_LABEL }                from '../agent-panel/AgentStrip.tsx';
import {
  BILLING_CARDS,
  BillingStepModel,
  HOW_IT_WORKS_LINES,
  PIPELINE_PHASE_SUMMARIES,
  type BillingChoice
} from './BillingStepModel.ts';

export interface BillingStepProps {
  readonly facts:                      PipelineViewFacts;
  /** The landing of an unreadable `pipeline.json`: the start says that Apply replaces the file. */
  readonly replacesUnreadablePipeline: boolean;
}

interface BillingCardsProps {
  readonly choice:   BillingChoice;
  readonly onChoose: (choice: BillingChoice) => void;
}

function CapPerLaunch({ choice, onChoose }: BillingCardsProps) {
  return (
    <span className="board-pipeline-billing-cap">
      Cap per launch
      <span className="board-pipeline-billing-cap-field">
        $
        <input
          className="board-pipeline-billing-cap-input"
          type="text"
          inputMode="decimal"
          value={choice.capText}
          placeholder="none"
          aria-label="Cap per launch in US dollars"
          onFocus={() => onChoose({ ...choice, mode: 'api' })}
          onChange={(event) => onChoose({ mode: 'api', capText: event.currentTarget.value })}
        />
      </span>
      <Text typeRole="small" subtle>Optional</Text>
    </span>
  );
}

function BillingCards({ choice, onChoose }: BillingCardsProps) {
  const groupName = useId();
  return (
    <div className="board-pipeline-billing-cards">
      {BILLING_CARDS.map((card) => (
        <ChoiceOption
          key={card.mode}
          label={card.label}
          description={card.description}
          chosen={choice.mode === card.mode}
          variant="card"
          tone="question"
          size="roomy"
          input={(
            <ChoiceInput
              type="radio"
              name={groupName}
              checked={choice.mode === card.mode}
              accessibleName={card.label}
              onChange={() => onChoose({ ...choice, mode: card.mode })}
            />
          )}
          {...(card.mode === 'subscription' ? { marks: <Tag text="Default" tone="neutral" /> } : { facts: <CapPerLaunch choice={choice} onChoose={onChoose} /> })}
        />
      ))}
    </div>
  );
}

/** The step card's head: "Step 1 of 5" after the signal dot, the step's name and what it decides, and the head's end. */
function BillingStepHead({ end }: { readonly end: ReactNode }) {
  return (
    <header className="board-pipeline-setup-card-head">
      <View gap="two">
        <Row centerY gap="seven">
          <span className="board-pipeline-setup-step-dot" aria-hidden="true" />
          <Text typeRole="small" muted>Step 1 of 5</Text>
        </Row>
        <Text typeRole="phase" element="h3">Billing</Text>
        <Text typeRole="lead" muted>Who pays for the agents. The pipeline agent is billed this way too.</Text>
      </View>
      {end}
    </header>
  );
}

/** The four phases every ticket goes through, each with its phase dot. */
function PhaseOverview() {
  return (
    <section className="board-pipeline-setup-card" aria-label="What the pipeline decides">
      <Row centerY gap="ten" paddingTop="fourteen" paddingHorizontal="twentyTwo" wrap>
        <Text typeRole="title" element="h3">What the pipeline decides</Text>
        <Text muted>Every ticket goes through four phases. You design each one in step 4.</Text>
      </Row>
      <div className="board-pipeline-setup-phases">
        {PIPELINE_PHASE_SUMMARIES.map((summary) => (
          <Card key={summary.phase} step gap="four">
            <Row centerY gap="eight">
              <span className="board-pipeline-phase-dot" data-phase={summary.phase} aria-hidden="true" />
              <Text bold>{summary.name}</Text>
            </Row>
            <Text muted>{summary.line}</Text>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** The panel's introduction before the agent starts: Flint waving, and what it does once started. */
function MeetFlint() {
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <>
      <Row centerY gap="fourteen">
        {flintSlotIsCovered
          ? null
          : (
            <FlintSlotHabitat
              habitat={FLINT_SLOT_HABITATS.setup}
              cue={null}
              label={PIPELINE_AGENT_FLINT_LABEL}
              ground="page"
            />
          )}
        <View gap="four">
          <Text typeRole="page" element="h4">Meet Flint</Text>
          <Text muted>Your pipeline agent. You work out the pipeline together.</Text>
        </View>
      </Row>
      <Text typeRole="lead" element="p">When you start it, Flint:</Text>
      <ol className="board-pipeline-setup-agent-steps">
        {HOW_IT_WORKS_LINES.map((line, i) => (
          <li key={line} className="board-pipeline-setup-agent-step">
            <span className="board-pipeline-setup-agent-step-number"><Text typeRole="small" subtle>{String(i + 1)}</Text></span>
            <Text>{line}</Text>
          </li>
        ))}
      </ol>
      <div className="board-pipeline-setup-agent-note">
        <Text muted>Starts one agent session, also while the board is paused.</Text>
        <Text bold>Nothing is stored until you apply.</Text>
      </div>
    </>
  );
}

interface StartOrBackProps {
  readonly record:                     BoardSetupRecordDocument | null;
  readonly choice:                     BillingChoice;
  readonly replacesUnreadablePipeline: boolean;
}

function StartOrBack({ record, choice, replacesUnreadablePipeline }: StartOrBackProps) {
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const continueCommand = record === null ? null : BillingStepModel.continueCommandOf(record);
  if (continueCommand !== null) {
    return (
      <CommandButton
        label="Continue to research"
        command={continueCommand}
        primary
        attention
        onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('research'))}
      />
    );
  }
  if (record !== null) {
    return <Button label={BillingStepModel.backLabelOf(record)} emphasis="primary" href={hrefOf(PipelineViewModel.setupStepRouteOf(record.currentStep))} />;
  }
  return (
    <CommandButton
      label="Set up the pipeline"
      command={BillingStepModel.startCommandOf(choice, replacesUnreadablePipeline)}
      primary
      attention
      onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('research'))}
    />
  );
}

export function BillingStep({ facts, replacesUnreadablePipeline }: BillingStepProps) {
  const record = facts.pipeline.setup?.record ?? null;
  const [choice, setChoice] = useState<BillingChoice>(() => BillingStepModel.billingChoiceOf(record?.billing ?? null));
  const pendingTicketCount = BillingStepModel.pendingTicketCountOf(facts.page?.tickets ?? []);
  const footerLines = BillingStepModel.footerLinesOf(choice);
  const main = (
    <>
      <View gap="two">
        <ViewTitle
          title="Set up the pipeline"
          lead={'The pipeline is the path every ticket takes: who files it, who builds and reviews it, which commands check it, and where you '
            + 'approve. No ticket builds until you apply one.'}
        />
        <Row gap="six" paddingTop="eight">
          <Tag text={record === null ? 'Pipeline not set' : 'Setup in progress'} tone="warn" />
          <Tag text={BillingStepModel.waitingTicketsTextOf(pendingTicketCount)} tone="neutral" />
        </Row>
      </View>
      <section className="board-pipeline-setup-card" aria-label="Step 1: Billing">
        <BillingStepHead
          end={record === null
            ? <Text typeRole="tab" muted>You can change it later</Text>
            : <CommandButton label="Save billing" command={BillingStepModel.billingChangeCommandOf(record, choice)} />}
        />
        <BillingCards choice={choice} onChoose={setChoice} />
      </section>
      <PhaseOverview />
    </>
  );
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title="Pipeline agent"
      status={BillingStepModel.panelStatusOf(record, facts.pipeline.setup?.agentJobState ?? null)}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
    >
      <PipelinePanelBody>
        <MeetFlint />
      </PipelinePanelBody>
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Billing actions"
      start={(
        <>
          <Tag text="Billing" tone="neutral" />
          <Text bold>{footerLines.summary}</Text>
          <Text muted>{footerLines.detail}</Text>
        </>
      )}
      end={(
        <>
          {record === null ? <Text muted>Starts the pipeline agent on a snapshot of main</Text> : null}
          <StartOrBack record={record} choice={choice} replacesUnreadablePipeline={replacesUnreadablePipeline} />
        </>
      )}
    />
  );
  return <PipelinePage main={main} panel={panel} footer={footer} />;
}
