/**
 * The setup landing of a forge with no pipeline, the welcome: what a pipeline is and that every answer is kept, the steps the setup walks
 * with what each decides, the first one current, and the one way in, Start with the agent, which opens the agent step; beside it whether
 * forge found this machine's program of the agent. A `pipeline.json` it cannot read is named with its reason, and waiting tickets in one
 * quiet line.
 */
import {
  Banner,
  Button,
  StateDot,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }                                                     from '../../../shared/routing/BoardRouteLinks.ts';
import { ViewTitle }                                                          from '../../ViewTitle.tsx';
import { PipelineViewModel, type PipelineViewFacts, type UnreadablePipeline } from '../PipelineViewModel.ts';
import { ProgramPathText }                                                    from '../agent/ProgramPathText.tsx';
import { PIPELINE_WHAT_IT_IS }                                                from './SetupIntro.tsx';
import { SetupWelcomeModel, type WelcomeAgentLine }                           from './SetupWelcomeModel.ts';

export interface SetupWelcomeProps {
  readonly facts:      PipelineViewFacts;
  readonly unreadable: UnreadablePipeline | null;
}

const WELCOME_LEAD = `${PIPELINE_WHAT_IT_IS} Every answer is saved as you go, so you can leave and come back.`;

function AgentProgramLine({ line }: { readonly line: WelcomeAgentLine }) {
  return (
    <span className="board-pipeline-welcome-agent">
      {line.programIsFound ? <StateDot tone="success" small /> : <StateDot tone="accent" shape="dashed-ring" small />}
      <Text muted>{line.text}</Text>
      {line.programIsFound ? <ProgramPathText path={line.path} /> : null}
    </span>
  );
}

export function SetupWelcome({ facts, unreadable }: SetupWelcomeProps) {
  const hrefOf = useBoardHrefOf();
  const waitingTicketsText = SetupWelcomeModel.waitingTicketsTextOf(facts.page?.tickets ?? []);
  return (
    <div className="board-pipeline-welcome">
      <View gap="eight">
        <span className="board-pipeline-welcome-kicker">New forge</span>
        <ViewTitle title={SetupWelcomeModel.titleOf(facts.project)} lead={WELCOME_LEAD} />
      </View>
      {unreadable === null ? null : <Banner tone="warn" role="status" text={PipelineViewModel.unreadableTextOf(unreadable)} />}
      <ol className="board-pipeline-welcome-steps" aria-label="Setup steps">
        {SetupWelcomeModel.stepRowsOf().map((row) => (
          <li
            key={row.step}
            className="board-pipeline-welcome-step"
            data-current={row.isCurrent ? '' : undefined}
            aria-current={row.isCurrent ? 'step' : undefined}
          >
            <span className="board-pipeline-welcome-step-number" aria-hidden="true">{row.position}</span>
            <span className="board-pipeline-welcome-step-words">
              <Text bold>{row.label}</Text>
              <Text muted>{row.summary}</Text>
            </span>
          </li>
        ))}
      </ol>
      <div className="board-pipeline-welcome-start">
        <Button label="Start with the agent" emphasis="primary" attention href={hrefOf(PipelineViewModel.setupStartRoute)} />
        <AgentProgramLine line={SetupWelcomeModel.agentLineOf(facts.agent)} />
      </div>
      {waitingTicketsText === null ? null : <Text typeRole="small" muted element="p">{waitingTicketsText}</Text>}
    </div>
  );
}
