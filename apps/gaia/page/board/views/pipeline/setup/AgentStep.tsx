/**
 * The agent step, the setup's first: which agent builds the forge, from the vendors the forge knows (one it cannot run yet shows as coming
 * later and cannot be chosen), and which of its programs this forge starts; beside it where forge looked for that program. With no record
 * it is the setup's landing, under the setup's title row and over what the pipeline decides: the page holds the choice, and the footer's
 * Continue starts the setup with it, which opens the billing step. With a record the choice is the record's: Continue moves a record still
 * at this step on to billing, and a record past it is reached again by the way back to its current step. While nothing is found the
 * primary action opens the file chooser instead.
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
  Tag
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CommandButton }                                                from '../../../shared/commands/CommandButton.tsx';
import { useBoardHrefOf, useBoardNavigation }                           from '../../../shared/routing/BoardRouteLinks.ts';
import { ViewTitle }                                                    from '../../ViewTitle.tsx';
import { PipelinePage }                                                 from '../PipelinePage.tsx';
import { PipelinePanel, PipelinePanelBody }                             from '../PipelinePanel.tsx';
import { PipelineViewModel, SETUP_STEP_LABELS, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { AgentChoiceModel, type VendorCard }                            from '../agent/AgentChoiceModel.ts';
import {
  AgentProgramPanel,
  useProgramChoice,
  WhereForgeLooked,
  type ProgramChoiceState
} from '../agent/AgentProgramPanel.tsx';
import { PhaseOverview, SetupStepHead, SetupTitleRow } from './SetupIntro.tsx';

export interface AgentStepProps {
  readonly facts:                      PipelineViewFacts;
  /** `null` on the setup's landing, before the setup starts. */
  readonly setup:                      BoardPipelineSetupDocument | null;
  /** The landing of an unreadable `pipeline.json`: the start says that Apply replaces the file. */
  readonly replacesUnreadablePipeline: boolean;
}

const CONTINUE_LABEL = `Continue to ${SETUP_STEP_LABELS.billing.toLowerCase()}`;

const STEP_LEAD = 'The coding agent every job runs, and the program forge starts for it. Its vendor decides how it can be billed.';

function VendorCards({ cards, chosenVendor }: { readonly cards: readonly VendorCard[]; readonly chosenVendor: string | null }) {
  const groupName = useId();
  return (
    <div className="board-agent-vendor-cards">
      {cards.map((card) => (
        <ChoiceOption
          key={card.vendor}
          label={card.label}
          description={card.description}
          chosen={card.vendor === chosenVendor}
          variant="card"
          tone="question"
          marks={<Tag text={card.tag.text} tone={card.tag.tone} />}
          input={(
            <ChoiceInput
              type="radio"
              name={groupName}
              checked={card.vendor === chosenVendor}
              accessibleName={card.label}
              disabled={!card.selectable}
              onChange={() => undefined}
            />
          )}
        />
      ))}
    </div>
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

interface LandingFooterProps {
  readonly agent:                      BoardAgentDocument;
  readonly displayName:                string;
  readonly programChoice:              ProgramChoiceState;
  readonly replacesUnreadablePipeline: boolean;
}

/**
 * The landing's footer: the program the start sends and the start itself, which asks first when it changes a program other forges follow;
 * while no program is there, the file chooser.
 */
function LandingFooter({
  agent, displayName, programChoice, replacesUnreadablePipeline
}: LandingFooterProps) {
  const [isAsking, setIsAsking] = useState(false);
  const navigateTo = useBoardNavigation();
  const startCommands = AgentChoiceModel.startCommandsOf(agent, programChoice, replacesUnreadablePipeline);
  const programPath = programChoice.chosenPath ?? AgentChoiceModel.machineProgramOf(agent)?.path ?? null;
  const openBilling = (): void => navigateTo(PipelineViewModel.setupStepRouteOf('billing'));
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
            confirm={<CommandButton label="Change it for every forge" command={startCommands} primary onApplied={openBilling} />}
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
      start={<Tag text={AgentChoiceModel.footerTextOf(displayName, programPath)} tone="neutral" chip />}
      end={(
        <>
          {startCommands === null ? <ChooseProgramButton displayName={displayName} programChoice={programChoice} /> : null}
          {startCommands !== null && asksFirst ? <Button label={CONTINUE_LABEL} emphasis="primary" attention onPress={() => setIsAsking(true)} /> : null}
          {startCommands !== null && !asksFirst ? <CommandButton label={CONTINUE_LABEL} command={startCommands} primary attention onApplied={openBilling} /> : null}
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

/** A record's footer: its program, and Continue while the record stands at this step, else the way back to where it stands. */
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
      />
    );
  };
  return (
    <ActionBar
      label="Agent actions"
      start={<Tag text={AgentChoiceModel.footerTextOf(displayName, record.agent === null ? null : agent.programPath)} tone="neutral" chip />}
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
  const stepCard = (
    <section className="board-pipeline-setup-card" aria-label={`${PipelineViewModel.stepPositionTextOf(record, 'agent')}: Agent`}>
      <SetupStepHead step="agent" record={record} lead={STEP_LEAD} />
      <VendorCards cards={AgentChoiceModel.vendorCardsOf(agent)} chosenVendor={vendor} />
      <div className="board-agent-step-program">
        <AgentProgramPanel
          agent={agent}
          choice={recordAgent}
          target={record === null ? { kind: 'start', replacesUnreadablePipeline } : { kind: 'setup', setupId: record.setupId }}
          project={project}
          programChoice={programChoice}
        />
      </div>
    </section>
  );
  const main = record === null
    ? (
      <>
        <SetupTitleRow facts={facts} />
        {stepCard}
        <PhaseOverview />
      </>
    )
    : (
      <>
        <ViewTitle
          title={project === '' ? 'Which agent builds this forge' : `Which agent builds ${project}`}
          lead={'Every job of this forge runs this agent: the pipeline agent, builders and reviewers. You can change it later in the forge\'s '
            + 'settings.'}
        />
        {stepCard}
      </>
    );
  const panel = (
    <PipelinePanel label="Where forge looked" title="Where forge looked" status={{ tone: 'idle', text: displayName }}>
      <PipelinePanelBody>
        <WhereForgeLooked agent={agent} />
      </PipelinePanelBody>
    </PipelinePanel>
  );
  const footer = setup === null
    ? <LandingFooter agent={agent} displayName={displayName} programChoice={programChoice} replacesUnreadablePipeline={replacesUnreadablePipeline} />
    : <RecordFooter agent={agent} setup={setup} displayName={displayName} programChoice={programChoice} />;
  return <PipelinePage main={main} panel={panel} footer={footer} />;
}
