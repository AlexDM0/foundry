/**
 * A job whose launch forge refused for its agent's program or billing, in place of a Running it never reached: "Not launched" with forge's
 * own words of why, that forge stops retrying and launches it by itself once that is fixed, and the ways to fix it: choose the program or
 * the billing, or have forge look again.
 */
import type { BoardJobNotLaunchedDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import {
  Button,
  Row,
  Tag,
  Text
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }      from '../../../shell/BoardRouteLinks.ts';
import { CommandButton }       from '../../../shell/CommandButton.tsx';
import type { NotLaunchedFix } from '../PipelineViewModel.ts';
import { AgentChoiceModel }    from './AgentChoiceModel.ts';

export interface NotLaunchedJobProps {
  readonly jobId:       string | null;
  readonly notLaunched: BoardJobNotLaunchedDocument;
  /** Where the cause is fixed (`PipelineViewModel.notLaunchedFixOf`). */
  readonly fix:         NotLaunchedFix;
}

export function NotLaunchedJob({ jobId, notLaunched, fix }: NotLaunchedJobProps) {
  const hrefOf = useBoardHrefOf();
  const jobName = jobId ?? 'the job';
  const fixedThing = notLaunched.cause === 'billing-not-offered' ? 'billing' : 'program';
  return (
    <section className="board-agent-not-launched" aria-label={`${jobName} not launched`}>
      <Row centerY gap="eight" wrap>
        <Tag text="Not launched" tone="error" />
        <Text mono>{jobName}</Text>
        <Text muted>{`Forge stops retrying until the ${fixedThing} is fixed, then launches ${jobName} by itself.`}</Text>
      </Row>
      <Text>{notLaunched.text}</Text>
      <Row centerY gap="eight" wrap>
        <Button label={fix.label} href={hrefOf(fix.route)} />
        <CommandButton label="Look again" command={AgentChoiceModel.lookAgainCommand()} />
      </Row>
    </section>
  );
}
