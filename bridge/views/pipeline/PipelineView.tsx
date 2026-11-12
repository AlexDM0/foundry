/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route. The setup landing and a
 * reopened billing step show the billing step, the bare `#pipeline` of an open setup the resume summary; each of them carries its own
 * heading, and every other screen shows its title. The setup landing names an unreadable `pipeline.json` in a warn banner.
 */
import { Banner }           from '../../design-system/Banner.tsx';
import type { BridgeRoute } from '../../shell/HashRouter.ts';

import { PipelineViewModel, type PipelineScreen, type PipelineViewFacts } from './PipelineViewModel.ts';
import { BillingStep }                                                    from './setup/BillingStep.tsx';
import { ResumeSummary }                                                  from './setup/ResumeSummary.tsx';

export interface PipelineViewProps {
  readonly facts: PipelineViewFacts;
  readonly route: BridgeRoute;
}

function ScreenContent({ facts, screen }: { readonly facts: PipelineViewFacts; readonly screen: PipelineScreen }) {
  const setup = facts.pipelineSetup ?? null;
  if (screen.screen === 'setup-landing') {
    return (
      <>
        {screen.unreadable === null ? null : <Banner tone="warn" role="status" text={PipelineViewModel.unreadableTextOf(screen.unreadable)} />}
        <BillingStep facts={facts} replacesUnreadablePipeline={screen.unreadable !== null} />
      </>
    );
  }
  if (screen.screen === 'setup-step' && screen.step === 'billing') return <BillingStep facts={facts} replacesUnreadablePipeline={false} />;
  if (screen.screen === 'setup-resume' && setup !== null) return <ResumeSummary setup={setup} />;
  return <h2 className="bridge-pipeline-title">{PipelineViewModel.screenTitleOf(screen)}</h2>;
}

export function PipelineView({ facts, route }: PipelineViewProps) {
  const screen = PipelineViewModel.screenOf(facts, route);
  return (
    <section className="bridge-pipeline" aria-label={PipelineViewModel.screenTitleOf(screen)} data-screen={screen.screen}>
      <ScreenContent facts={facts} screen={screen} />
    </section>
  );
}
