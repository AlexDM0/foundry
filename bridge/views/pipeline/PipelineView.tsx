/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route, under its title. The
 * setup landing names an unreadable `pipeline.json` in a warn banner.
 */
import { Banner }           from '../../design-system/Banner.tsx';
import type { BridgeRoute } from '../../shell/HashRouter.ts';

import { PipelineViewModel, type PipelineViewFacts } from './PipelineViewModel.ts';

export interface PipelineViewProps {
  readonly facts: PipelineViewFacts;
  readonly route: BridgeRoute;
}

export function PipelineView({ facts, route }: PipelineViewProps) {
  const screen = PipelineViewModel.screenOf(facts, route);
  const title = PipelineViewModel.screenTitleOf(screen);
  return (
    <section className="bridge-pipeline" aria-label={title} data-screen={screen.screen}>
      <h2 className="bridge-pipeline-title">{title}</h2>
      {screen.screen === 'setup-landing' && screen.unreadable !== null
        ? <Banner tone="warn" role="status" text={PipelineViewModel.unreadableTextOf(screen.unreadable)} />
        : null}
    </section>
  );
}
