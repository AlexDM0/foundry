/**
 * The agent step, the setup's first: which agent builds the forge, a card for each vendor the forge runs and one line naming those it runs
 * in a later version, and which of its programs this forge starts, with where forge looked folded under it. With no record it is reached
 * from the welcome: the page holds the choice, Back returns to the welcome, and the footer's Continue starts the setup with it, which opens
 * the billing step. With a record the choice is the record's: Continue moves a record still at this step on to billing, and a record past
 * it is reached again by the way back to its current step. While nothing is found the primary action opens the file chooser instead.
 */
import { useId, useState }                 from 'react';
import type { BoardAgentDocument }         from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  Button,
  ChoiceInput,
  ChoiceOption,
  ConfirmStrip,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf, useBoardNavigation }                           from '../../../shell/BoardRouteLinks.ts';
import { CommandButton }                                                from '../../../shell/CommandButton.tsx';
import type { CommandWaitExplanation }                                  from '../../../shell/CommandWait.ts';
import { ViewTitle }                                                    from '../../ViewTitle.tsx';
import { PipelinePage }                                                 from '../PipelinePage.tsx';
import { PipelineViewModel, SETUP_STEP_LABELS, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { AgentChoiceModel }                                             from '../agent/AgentChoiceModel.ts';
import { AgentProgramPanel, useProgramChoice, type ProgramChoiceState } from '../agent/AgentProgramPanel.tsx';

export interface AgentStepProps {
  readonly facts:                      PipelineViewFacts;
  /** `null` before the setup starts, while the page holds the choice. */
  readonly setup:                      BoardPipelineSetupDocument | null;
  /** A forge whose `pipeline.json` cannot be read: the start says that Apply replaces the file. */
  readonly replacesUnreadablePipeline: boolean;
}

const CONTINUE_LABEL = `Continue to ${SETUP_STEP_LABELS.billing.toLowerCase()}`;

const SAVED_AS_YOU_GO = 'Saved as you go';

const STEP_LEAD = 'The coding agent every job runs, and the program forge starts for it. Its vendor decides how it can be billed, the next step.';

/** What the panel over the page says while the forge saves the agent and moves the setup on. */
function continueWaitOf(displayName: string): CommandWaitExplanation {
  return {
    title:       'Moving on to billing',
    explanation: `Forge saves ${displayName} as this forge's agent and moves the setup on to billing.`,
  };
}

/** The vendors forge runs as cards, the chosen one checked with whether its program is found, and the ones it runs later in one line. */
function VendorChoice({ agent, chosenVendor }: { readonly agent: BoardAgentDocument; readonly chosenVendor: string | null }) {
  const groupName = useId();
  const laterVendorsText = AgentChoiceModel.laterVendorsTextOf(agent);
  return (
    <section className="board-agent-vendors" aria-label="The agent's vendor">
      <Text typeRole="title" element="h3">Agent</Text>
      {AgentChoiceModel.vendorCardsOf(agent).map((card) => (
        <ChoiceOption
          key={card.vendor}
          label={card.label}
          description={card.description}
          chosen={card.vendor === chosenVendor}
          variant="card"
          tone="question"
          marks={card.programIsFound ? <Tag text="Found" tone="state" stateTone="success" dot /> : <Tag text="Not found" tone="warn" />}
          input={(
            <ChoiceInput type="radio" name={groupName} checked={card.vendor === chosenVendor} accessibleName={card.label} onChange={() => undefined} />
          )}
        />
      ))}
      {laterVendorsText === null ? null : <Text typeRole="small" muted element="p">{laterVendorsText}</Text>}
    </section>
  );
}

function ChooseProgramButton({ displayName, programChoice }: { readonly displayName: string; readonly programChoice: ProgramChoiceState }) {
  return (
    <Button
      label={`Choose the ${displayName} program…`}
      emphasis="primary"
      attention
      disabled={!programChoice.chooserIsOffered}
      onPress={() => void programChoice.choose()}
    />
  );
}

interface StartFooterProps {
  readonly agent:                      BoardAgentDocument;
  readonly displayName:                string;
  readonly programChoice:              ProgramChoiceState;
  readonly replacesUnreadablePipeline: boolean;
}

/**
 * The footer before a record, when nothing is saved yet: Back to the welcome, and the start itself, which asks first when it changes a
 * program other forges follow; while no program is there, the file chooser.
 */
function StartFooter({
  agent, displayName, programChoice, replacesUnreadablePipeline
}: StartFooterProps) {
  const [isAsking, setIsAsking] = useState(false);
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const startCommands = AgentChoiceModel.startCommandsOf(agent, programChoice, replacesUnreadablePipeline);
  const openBilling = (): void => navigateTo(PipelineViewModel.setupStepRouteOf('billing'));
  const startWait = AgentChoiceModel.programCheckWaitOf(displayName, 'opens the setup at billing');
  const asksFirst = programChoice.chosenPath !== null && AgentChoiceModel.machineChangeAsksFirst(agent, programChoice.forEveryForge);
  if (isAsking && startCommands !== null) {
    return (
      <ActionBar
        label="Agent actions"
        start={(
          <ConfirmStrip
            label="Change this machine's program"
            question={AgentChoiceModel.machineChangeQuestionOf(agent, displayName)}
            tone="neutral"
            confirm={<CommandButton label="Change it for every forge" command={startCommands} primary onApplied={openBilling} wait={startWait} />}
            cancelLabel="Keep the current one"
            onCancel={() => setIsAsking(false)}
          />
        )}
        end={null}
      />
    );
  }
  return (
    <ActionBar
      label="Agent actions"
      start={null}
      end={(
        <>
          <Button label="Back" href={hrefOf(PipelineViewModel.setupLandingRoute)} />
          {startCommands === null ? <ChooseProgramButton displayName={displayName} programChoice={programChoice} /> : null}
          {startCommands !== null && asksFirst ? <Button label={CONTINUE_LABEL} emphasis="primary" attention onPress={() => setIsAsking(true)} /> : null}
          {startCommands !== null && !asksFirst
            ? <CommandButton label={CONTINUE_LABEL} command={startCommands} primary attention onApplied={openBilling} wait={startWait} />
            : null}
        </>
      )}
    />
  );
}

interface RecordFooterProps {
  readonly agent:         BoardAgentDocument;
  readonly setup:         BoardPipelineSetupDocument;
  readonly displayName:   string;
  readonly programChoice: ProgramChoiceState;
}

/** A record's footer: that it is saved as User goes, and Continue while the record stands at this step, else the way back to where it stands. */
function RecordFooter({
  agent, setup, displayName, programChoice
}: RecordFooterProps) {
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const { record } = setup;
  const nothingFound = AgentChoiceModel.machineProgramOf(agent) === null && AgentChoiceModel.pinnedPathOf(record.agent) === null;
  const continueCommand = AgentChoiceModel.continueCommandOf(record.setupId, record.agent, agent);
  const primaryOf = () => {
    if (record.currentStep !== 'agent') {
      return <Button label={PipelineViewModel.backToCurrentStepLabelOf(record)} emphasis="primary" href={hrefOf(PipelineViewModel.setupStepRouteOf(record.currentStep))} />;
    }
    if (nothingFound && record.agent === null) return <ChooseProgramButton displayName={displayName} programChoice={programChoice} />;
    return (
      <CommandButton
        label={CONTINUE_LABEL}
        command={continueCommand}
        primary
        attention={continueCommand !== null}
        onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('billing'))}
        wait={continueWaitOf(displayName)}
      />
    );
  };
  return (
    <ActionBar
      label="Agent actions"
      start={<Text muted>{SAVED_AS_YOU_GO}</Text>}
      end={primaryOf()}
    />
  );
}

export function AgentStep({ facts, setup, replacesUnreadablePipeline }: AgentStepProps) {
  const { agent, project } = facts;
  const record = setup?.record ?? null;
  const programChoice = useProgramChoice(agent);
  const recordAgent = record?.agent ?? null;
  const vendor = AgentChoiceModel.chosenVendorOf(agent, recordAgent);
  const displayName = AgentChoiceModel.displayNameOf(agent, vendor);
  const main = (
    <div className="board-pipeline-setup-column">
      <View gap="two">
        <Text typeRole="small" mono muted>{PipelineViewModel.stepPositionTextOf(record, 'agent')}</Text>
        <ViewTitle title={project === '' ? 'Which agent builds this forge' : `Which agent builds ${project}`} lead={STEP_LEAD} />
      </View>
      <VendorChoice agent={agent} chosenVendor={vendor} />
      <AgentProgramPanel
        agent={agent}
        choice={recordAgent}
        target={record === null ? { kind: 'start', replacesUnreadablePipeline } : { kind: 'setup', setupId: record.setupId }}
        project={project}
        programChoice={programChoice}
        foldsWhereForgeLooked
      />
    </div>
  );
  const footer = setup === null
    ? <StartFooter agent={agent} displayName={displayName} programChoice={programChoice} replacesUnreadablePipeline={replacesUnreadablePipeline} />
    : <RecordFooter agent={agent} setup={setup} displayName={displayName} programChoice={programChoice} />;
  return <PipelinePage main={main} panel={null} footer={footer} />;
}
