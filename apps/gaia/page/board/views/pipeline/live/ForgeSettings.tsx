/**
 * The forge's settings after setup: its agent (the vendor, whether it follows this machine's program or a program for this forge only, the
 * program's path and whether it runs, Choose program… and Look again) and its tools (the approved ones, Edit tools, and following the
 * pipeline's programs again). Changing this machine's program from here asks first and names how many other forges follow it.
 */
import { useState } from 'react';
import {
  Button,
  Card,
  Row,
  Tag,
  Text,
  TextButton,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }                                                 from '../../../shell/BoardRouteLinks.ts';
import { CommandButton }                                                  from '../../../shell/CommandButton.tsx';
import { ViewTitle }                                                      from '../../ViewTitle.tsx';
import { PipelineViewModel, type PipelineViewFacts }                      from '../PipelineViewModel.ts';
import { AgentChoiceModel }                                               from '../agent/AgentChoiceModel.ts';
import { AgentProgramPanel, useProgramChoice, WhereForgeLooked }          from '../agent/AgentProgramPanel.tsx';
import { ToolListDialog }                                                 from '../agent/ToolListDialog.tsx';
import { SANDBOX_NOTE, TOOLS_FOLLOW_THE_PIPELINE_COMMAND, ToolListModel } from '../agent/ToolListModel.ts';

export interface ForgeSettingsProps {
  readonly facts: PipelineViewFacts;
}

function AgentCard({ facts }: ForgeSettingsProps) {
  const { agent, project } = facts;
  const programChoice = useProgramChoice(agent);
  const vendor = AgentChoiceModel.chosenVendorOf(agent, agent.choice);
  const displayName = AgentChoiceModel.displayNameOf(agent, vendor);
  const choiceKind = AgentChoiceModel.programChoiceKindOf(agent.choice);
  const followers = agent.otherForgesFollowingMachine;
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
      {choiceKind === 'machine' && followers > 0
        ? <Text subtle>{`Changing this machine's ${displayName} here asks first: ${followers === 1 ? '1 other forge follows' : `${followers} other forges follow`} it.`}</Text>
        : null}
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
  return (
    <div className="board-forge-settings">
      <ViewTitle title="Forge settings" lead="The agent every job of this forge runs, the program forge starts for it, and the tools its agents may run." />
      <div className="board-forge-settings-columns">
        <View gap="sixteen">
          <AgentCard facts={facts} />
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
