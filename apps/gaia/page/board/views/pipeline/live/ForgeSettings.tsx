/**
 * The forge's settings after setup: its agent (the vendor, whether it follows this machine's program or a program for this forge only, the
 * program's path and whether it runs, Choose program… and Look again), its billing only while the pipeline's is not a way the agent bills,
 * and its tools (the approved ones, Edit tools, and following the pipeline's programs again). Changing this machine's program from here asks
 * first and names how many other forges follow it.
 */
import { useState }                        from 'react';
import type { BoardPipelineAgentDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardBillingDocument }       from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Button,
  Card,
  Row,
  Tag,
  Text,
  TextButton,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CommandButton }                                                  from '../../../shared/commands/CommandButton.tsx';
import { useBoardHrefOf }                                                 from '../../../shared/routing/BoardRouteLinks.ts';
import { ViewTitle }                                                      from '../../ViewTitle.tsx';
import { PipelineViewModel, type PipelineViewFacts }                      from '../PipelineViewModel.ts';
import { AgentChoiceModel }                                               from '../agent/AgentChoiceModel.ts';
import { AgentProgramPanel, useProgramChoice, WhereForgeLooked }          from '../agent/AgentProgramPanel.tsx';
import { BillingCards }                                                   from '../agent/BillingCards.tsx';
import { ToolListDialog }                                                 from '../agent/ToolListDialog.tsx';
import { SANDBOX_NOTE, TOOLS_FOLLOW_THE_PIPELINE_COMMAND, ToolListModel } from '../agent/ToolListModel.ts';
import { BillingStepModel, type BillingChoice }                           from '../setup/BillingStepModel.ts';
import { ForgeBillingModel }                                              from './ForgeBillingModel.ts';

export interface ForgeSettingsProps {
  readonly facts: PipelineViewFacts;
}

function AgentCard({ facts }: ForgeSettingsProps) {
  const { agent, project } = facts;
  const programChoice = useProgramChoice(agent);
  const vendor = AgentChoiceModel.chosenVendorOf(agent, agent.choice);
  const displayName = AgentChoiceModel.displayNameOf(agent, vendor);
  const choiceKind = AgentChoiceModel.programChoiceKindOf(agent.choice);
  const followers = AgentChoiceModel.followersTextOf(agent.otherForgesFollowingMachine);
  return (
    <Card gap="twelve">
      <Row centerY gap="eight" wrap>
        <Text typeRole="title" element="h3">Agent</Text>
        <Text>{displayName}</Text>
        {choiceKind === null
          ? <Tag text="Not chosen" tone="warn" />
          : <Tag text={choiceKind === 'machine' ? `this machine's ${displayName}` : 'a program for this forge only'} tone="neutral" />}
      </Row>
      {choiceKind === null ? <Text>No agent is chosen for this forge, so no job launches. Choose its program below.</Text> : null}
      <AgentProgramPanel agent={agent} choice={agent.choice} target={{ kind: 'forge' }} project={project} programChoice={programChoice} />
      <Row centerY gap="eight" wrap>
        <CommandButton label="Look again" command={AgentChoiceModel.lookAgainCommand()} />
        <Text muted>Forge runs the program again and launches every job that stood not launched.</Text>
      </Row>
      {choiceKind === 'machine' && agent.otherForgesFollowingMachine !== 0
        ? <Text subtle>{`Changing this machine's ${displayName} here asks first: ${followers ?? 'other forges may follow'} it.`}</Text>
        : null}
    </Card>
  );
}

interface BillingCardProps {
  readonly facts:             ForgeSettingsProps['facts'];
  readonly agentChoice:       BoardPipelineAgentDocument;
  readonly billingNotOffered: BoardBillingDocument;
}

/** The ways the agent bills, its default preselected, and Save billing, which stores the chosen way with the agent as it is. */
function BillingCard({ facts, agentChoice, billingNotOffered }: BillingCardProps) {
  const cards = BillingStepModel.billingCardsOf(facts, { agent: agentChoice });
  const [choice, setChoice] = useState<BillingChoice>(() => BillingStepModel.billingChoiceOf(null, cards));
  const displayName = AgentChoiceModel.displayNameOf(facts.agent, agentChoice.vendor);
  return (
    <Card gap="twelve">
      <Row centerY gap="eight" wrap>
        <Text typeRole="title" element="h3">Billing</Text>
        <Tag text={`Not a way ${displayName} bills`} tone="warn" />
      </Row>
      <Text>{ForgeBillingModel.noticeTextOf(billingNotOffered, displayName)}</Text>
      <BillingCards cards={cards} choice={choice} onChoose={setChoice} />
      <span>
        <CommandButton label="Save billing" command={ForgeBillingModel.saveCommandOf(agentChoice, choice, cards)} primary attention />
      </span>
    </Card>
  );
}

function ToolsCard({ facts }: ForgeSettingsProps) {
  const [toolsAreOpen, setToolsAreOpen] = useState(false);
  const { agent, project } = facts;
  return (
    <Card gap="twelve">
      <Row centerY gap="eight" wrap>
        <Text typeRole="title" element="h3">Tools</Text>
        <Tag text={ToolListModel.summaryOf(agent.tools)} tone="neutral" />
        {agent.toolsListed ? <Tag text="This forge's own list" tone="neutral" /> : <Tag text="Follows the pipeline's programs" tone="neutral" />}
      </Row>
      <Text mono muted>{ToolListModel.approvedNamesTextOf(agent.tools)}</Text>
      <Row centerY gap="eight" wrap>
        <TextButton label="Edit tools" onPress={() => setToolsAreOpen(true)} />
        {agent.toolsListed ? <CommandButton label="Follow the pipeline's programs" command={TOOLS_FOLLOW_THE_PIPELINE_COMMAND} /> : null}
      </Row>
      <Text subtle>{SANDBOX_NOTE}</Text>
      {toolsAreOpen
        ? (
          <ToolListDialog
            tools={agent.tools}
            target={{ kind: 'pipeline' }}
            title={project === '' ? 'The tools this forge\'s agents use' : `The tools ${project}'s agents use`}
            isOpen
            onClose={() => setToolsAreOpen(false)}
          />
        )
        : null}
    </Card>
  );
}

export function ForgeSettings({ facts }: ForgeSettingsProps) {
  const hrefOf = useBoardHrefOf();
  const billingNotOffered = ForgeBillingModel.billingNotOfferedOf(facts);
  return (
    <div className="board-forge-settings">
      <ViewTitle title="Forge settings" lead="The agent every job of this forge runs, the program forge starts for it, and the tools its agents may run." />
      <div className="board-forge-settings-columns">
        <View gap="sixteen">
          <AgentCard facts={facts} />
          {facts.agent.choice === null || billingNotOffered === null
            ? null
            : <BillingCard facts={facts} agentChoice={facts.agent.choice} billingNotOffered={billingNotOffered} />}
          <ToolsCard facts={facts} />
        </View>
        <Card gap="twelve">
          <Text typeRole="title" element="h3">Where forge looked</Text>
          <WhereForgeLooked agent={facts.agent} />
        </Card>
      </div>
      <span>
        <Button label="Back to the pipeline" href={hrefOf(PipelineViewModel.liveRoute)} />
      </span>
    </div>
  );
}
