/**
 * The billing step, the setup's second: the ways the record's agent bills beside the pipeline agent's panel. Continue saves a changed choice before
 * it launches the pipeline agent, since forge continues only once a billing is chosen.
 */
import { useState }                                                  from 'react';
import type { BoardPipelineSetupDocument, BoardSetupRecordDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  Button,
  Row,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { FlintSlotHabitat }                                             from '../../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                                          from '../../../flint/FlintSlotHabitats.ts';
import { useCoveringPanelHoldsTheFlintSlot }                            from '../../../shared/CoveringPanel.ts';
import { CommandButton }                                                from '../../../shared/commands/CommandButton.tsx';
import { useBoardHrefOf, useBoardNavigation }                           from '../../../shared/routing/BoardRouteLinks.ts';
import { PipelinePage }                                                 from '../PipelinePage.tsx';
import { PipelinePanel, PipelinePanelBody }                             from '../PipelinePanel.tsx';
import { PipelineViewModel, SETUP_STEP_LABELS, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { AgentChoiceModel }                                             from '../agent/AgentChoiceModel.ts';
import { BillingCards }                                                 from '../agent/BillingCards.tsx';
import { AgentMeter }                                                   from '../agent-panel/AgentMeter.tsx';
import { AgentSessionModel }                                            from '../agent-panel/AgentSessionModel.ts';
import { PIPELINE_AGENT_FLINT_LABEL }                                   from '../agent-panel/AgentStrip.tsx';
import {
  BillingStepModel,
  HOW_IT_WORKS_LINES,
  type BillingCard,
  type BillingChoice
} from './BillingStepModel.ts';
import { SetupStepHead, SetupTitleRow } from './SetupIntro.tsx';

export interface BillingStepProps {
  readonly facts: PipelineViewFacts;
  readonly setup: BoardPipelineSetupDocument;
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

interface ContinueOrBackProps {
  readonly record: BoardSetupRecordDocument;
  readonly cards:  readonly BillingCard[];
  readonly choice: BillingChoice;
}

/** Continue while the record stands at billing, saving a changed choice first; else the way back to where the setup stands. */
function ContinueOrBack({ record, cards, choice }: ContinueOrBackProps) {
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  if (record.currentStep !== 'billing') {
    return <Button label={PipelineViewModel.backToCurrentStepLabelOf(record)} emphasis="primary" href={hrefOf(PipelineViewModel.setupStepRouteOf(record.currentStep))} />;
  }
  const continueCommands = BillingStepModel.continueCommandsOf(record, choice, cards);
  return (
    <CommandButton
      label={`Continue to ${SETUP_STEP_LABELS.research.toLowerCase()}`}
      command={continueCommands}
      primary
      attention={continueCommands !== null}
      onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('research'))}
    />
  );
}

export function BillingStep({ facts, setup }: BillingStepProps) {
  const { record } = setup;
  const hrefOf = useBoardHrefOf();
  const cards = BillingStepModel.billingCardsOf(facts, record);
  const [choice, setChoice] = useState<BillingChoice>(() => BillingStepModel.billingChoiceOf(record.billing, cards));
  const displayName = AgentChoiceModel.displayNameOf(facts.agent, AgentChoiceModel.chosenVendorOf(facts.agent, record.agent));
  const footerLines = BillingStepModel.footerLinesOf(choice, cards, displayName);
  const recordIsAtBilling = record.currentStep === 'billing';
  const main = (
    <>
      <SetupTitleRow facts={facts} />
      <section className="board-pipeline-setup-card" aria-label={`${PipelineViewModel.stepPositionTextOf(record, 'billing')}: Billing`}>
        <SetupStepHead
          step="billing"
          record={record}
          lead="Who pays for the agents. The pipeline agent is billed this way too."
          end={recordIsAtBilling
            ? <Text typeRole="tab" muted>You can change it later</Text>
            : <CommandButton label="Save billing" command={BillingStepModel.billingChangeCommandOf(record, choice, cards)} />}
        />
        <BillingCards cards={cards} choice={choice} onChoose={setChoice} />
      </section>
    </>
  );
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title="Pipeline agent"
      status={BillingStepModel.panelStatusOf(record, AgentSessionModel.setupSessionStateOf(setup, facts.jobs))}
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
          {recordIsAtBilling ? <Text muted>Starts the pipeline agent on a snapshot of main</Text> : null}
          <Button label={`Back to ${SETUP_STEP_LABELS.agent.toLowerCase()}`} href={hrefOf(PipelineViewModel.setupStepRouteOf('agent'))} />
          <ContinueOrBack record={record} cards={cards} choice={choice} />
        </>
      )}
    />
  );
  return <PipelinePage main={main} panel={panel} footer={footer} />;
}
