/**
 * A job whose launch forge refused for its agent's program, in place of a Running it never reached: "Not launched" with forge's own words
 * of why, that forge stops retrying and launches it by itself once the program is fixed, and the ways to fix it: choose the program, or
 * have forge look again.
 */
import type { BoardAgentDocument, BoardJobNotLaunchedDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import {
  Button,
  Row,
  Tag,
  Text
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }   from '../../../shell/BoardRouteLinks.ts';
import type { BoardRoute }  from '../../../shell/BoardRouter.ts';
import { CommandButton }    from '../../../shell/CommandButton.tsx';
import { AgentChoiceModel } from './AgentChoiceModel.ts';

export interface NotLaunchedJobProps {
  readonly jobId:       string | null;
  readonly notLaunched: BoardJobNotLaunchedDocument;
  readonly agent:       BoardAgentDocument;
  /** Where the program is chosen (`PipelineViewModel.agentChoiceRouteOf`). */
  readonly choiceRoute: BoardRoute;
}

export function NotLaunchedJob({
  jobId, notLaunched, agent, choiceRoute
}: NotLaunchedJobProps) {
  const hrefOf = useBoardHrefOf();
  const displayName = AgentChoiceModel.displayNameOf(agent, AgentChoiceModel.chosenVendorOf(agent, agent.choice));
  const jobName = jobId ?? 'the job';
  return (
    <section className="board-agent-not-launched" aria-label={`${jobName} not launched`}>
      <Row centerY gap="eight" wrap>
        <Tag text="Not launched" tone="error" />
        <Text mono>{jobName}</Text>
        <Text muted>{`Forge stops retrying until the program is fixed, then launches ${jobName} by itself.`}</Text>
      </Row>
      <Text>{notLaunched.text}</Text>
      <Row centerY gap="eight" wrap>
        <Button label={`Choose the ${displayName} program…`} href={hrefOf(choiceRoute)} />
        <CommandButton label="Look again" command={AgentChoiceModel.lookAgainCommand()} />
      </Row>
    </section>
  );
}
