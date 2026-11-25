/**
 * The agent step, between billing and the research: which agent builds the forge, from the vendors the forge knows (one it cannot run yet
 * shows as coming later and cannot be chosen), and which of its programs this forge starts; beside it where forge looked for that program.
 * The footer names the chosen program and continues to the research once forge ran the program and it runs; while nothing is found its
 * primary action opens the file chooser instead.
 */
import { useId }                           from 'react';
import type { BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  Button,
  ChoiceInput,
  ChoiceOption,
  Row,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf, useBoardNavigation }                    from '../../../shell/BoardRouteLinks.ts';
import { CommandButton }                                         from '../../../shell/CommandButton.tsx';
import { ViewTitle }                                             from '../../ViewTitle.tsx';
import { PipelinePage }                                          from '../PipelinePage.tsx';
import { PipelinePanel, PipelinePanelBody }                      from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts }             from '../PipelineViewModel.ts';
import { AgentChoiceModel, type VendorCard }                     from '../agent/AgentChoiceModel.ts';
import { AgentProgramPanel, useProgramChoice, WhereForgeLooked } from '../agent/AgentProgramPanel.tsx';

export interface AgentStepProps {
  readonly facts: PipelineViewFacts;
  readonly setup: BoardPipelineSetupDocument;
}

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

export function AgentStep({ facts, setup }: AgentStepProps) {
  const { agent, project } = facts;
  const { record } = setup;
  const programChoice = useProgramChoice(agent);
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const vendor = AgentChoiceModel.chosenVendorOf(agent, record.agent);
  const displayName = AgentChoiceModel.displayNameOf(agent, vendor);
  const steps = PipelineViewModel.setupStepsOf(record);
  const nothingFound = AgentChoiceModel.machineProgramOf(agent) === null && AgentChoiceModel.pinnedPathOf(record.agent) === null;
  const continueCommand = AgentChoiceModel.continueCommandOf(record.setupId, record.agent, agent);
  const main = (
    <>
      <ViewTitle
        title={project === '' ? 'Which agent builds this forge' : `Which agent builds ${project}`}
        lead={'Every job of this forge runs this agent: the pipeline agent, builders and reviewers. You can change it later in the forge\'s '
          + 'settings.'}
      />
      <section className="board-pipeline-setup-card" aria-label={`Step ${steps.indexOf('agent') + 1}: Agent`}>
        <header className="board-pipeline-setup-card-head">
          <View gap="two">
            <Row centerY gap="seven">
              <span className="board-pipeline-setup-step-dot" aria-hidden="true" />
              <Text typeRole="small" muted>{`Step ${steps.indexOf('agent') + 1} of ${steps.length}`}</Text>
            </Row>
            <Text typeRole="phase" element="h3">Agent</Text>
            <Text typeRole="lead" muted>The coding agent every job runs, and the program forge starts for it.</Text>
          </View>
        </header>
        <VendorCards cards={AgentChoiceModel.vendorCardsOf(agent)} chosenVendor={vendor} />
        <div className="board-agent-step-program">
          <AgentProgramPanel
            agent={agent}
            choice={record.agent}
            target={{ kind: 'setup', setupId: record.setupId }}
            project={project}
            programChoice={programChoice}
          />
        </div>
      </section>
    </>
  );
  const panel = (
    <PipelinePanel label="Where forge looked" title="Where forge looked" status={{ tone: 'idle', text: displayName }}>
      <PipelinePanelBody>
        <WhereForgeLooked agent={agent} />
      </PipelinePanelBody>
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Agent actions"
      start={<Tag text={AgentChoiceModel.footerTextOf(displayName, record.agent === null ? null : agent.programPath)} tone="neutral" chip />}
      end={(
        <>
          <Button label="Back to billing" href={hrefOf(PipelineViewModel.setupStepRouteOf('billing'))} />
          {nothingFound && record.agent === null
            ? (
              <Button
                label={`Choose the ${displayName} program…`}
                emphasis="primary"
                attention
                disabled={!programChoice.chooserIsOffered}
                onPress={() => void programChoice.choose()}
              />
            )
            : (
              <CommandButton
                label="Continue to research"
                command={continueCommand}
                primary
                attention={continueCommand !== null}
                onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('research'))}
              />
            )}
        </>
      )}
    />
  );
  return <PipelinePage main={main} panel={panel} footer={footer} />;
}
