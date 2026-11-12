/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route. The setup landing and a
 * reopened billing step show the billing step, the research and constitution steps their pages (the constitution also at
 * `#pipeline/edit/constitution` while an applied pipeline is edited), the design step the proposed flow beside the pipeline agent, the
 * bare `#pipeline` of an open setup the resume summary; each of them carries its own heading, and every other screen shows its title. The
 * setup landing names an unreadable `pipeline.json` in a warn banner. The flow screen draws the flow workspace (the flow, the smallest
 * pipeline's note beside it, the gates area under them and the dialog a node, a gate row or a + opens) and, while editing, the footer
 * with the removed steps, Discard and Apply changes, which opens the apply dialog. Once a setup is applied, the live flow takes back the
 * bare `#pipeline` route.
 */
import { useEffect, useState } from 'react';

import type { TranscriptFollower }      from '../../conversation/TranscriptLog.tsx';
import { ActionBar }                    from '../../design-system/ActionBar.tsx';
import { Banner }                       from '../../design-system/Banner.tsx';
import { Button }                       from '../../design-system/Button.tsx';
import { Tag }                          from '../../design-system/Tag.tsx';
import type { PreferenceStore }         from '../../preferences/PreferenceStore.ts';
import type { BridgeClock }             from '../../shell/BridgeClock.ts';
import { CommandButton }                from '../../shell/CommandButton.tsx';
import { HashRouter, type BridgeRoute } from '../../shell/HashRouter.ts';

import { FlowWorkspace, useFlowSelection }                                from './FlowWorkspace.tsx';
import { PipelineViewModel, type PipelineScreen, type PipelineViewFacts } from './PipelineViewModel.ts';
import { ApplyChangesDialog }                                             from './apply/ApplyChangesDialog.tsx';
import { PipelineFlowModel }                                              from './flow/PipelineFlowModel.ts';
import { MinimalPipelineNote }                                            from './live/MinimalPipelineNote.tsx';
import { MinimalPipelineNoteModel }                                       from './live/MinimalPipelineNoteModel.ts';
import { BillingStep }                                                    from './setup/BillingStep.tsx';
import { ConstitutionStep }                                               from './setup/ConstitutionStep.tsx';
import { DesignStep }                                                     from './setup/DesignStep.tsx';
import { ResearchStep }                                                   from './setup/ResearchStep.tsx';
import { ResumeSummary }                                                  from './setup/ResumeSummary.tsx';

export interface PipelineViewProps {
  readonly facts:            PipelineViewFacts;
  readonly route:            BridgeRoute;
  readonly boardStore?:      PreferenceStore | null;
  /** Follows the pipeline agent's transcript for its chat. */
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

interface FlowScreenProps {
  readonly facts:      PipelineViewFacts;
  readonly boardStore: PreferenceStore | null;
}

function FlowScreen({ facts, boardStore }: FlowScreenProps) {
  const selection = useFlowSelection();
  const setup = facts.pipelineSetup ?? null;
  const [applyChangesIsAsked, setApplyChangesIsAsked] = useState((setup?.applyState ?? null) !== null);
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  const record = setup?.record ?? null;
  const editing = flow.toolbarStage === 'editing' && record !== null;
  const removedStepsText = PipelineFlowModel.removedStepsTextOf(flow.changeList);
  return (
    <>
      <FlowWorkspace
        facts={facts}
        boardStore={boardStore}
        selection={selection}
        flowAside={MinimalPipelineNoteModel.noteIsShownFor(flow) ? <MinimalPipelineNote flow={flow} /> : null}
      />
      {editing
        ? (
          <ActionBar
            label="Pipeline changes"
            start={(
              <>
                <Tag text="Editing" tone="neutral" />
                {removedStepsText === null ? null : <span className="bridge-pipeline-footer-note">{removedStepsText}</span>}
              </>
            )}
            end={(
              <>
                <CommandButton label="Discard" command={{ kind: 'pipeline-draft-discard', setupId: record.setupId }} />
                <Button label="Apply changes" emphasis="primary" expanded={applyChangesIsAsked} onPress={() => setApplyChangesIsAsked(true)} />
              </>
            )}
          />
        )
        : null}
      {editing && applyChangesIsAsked && setup !== null
        ? <ApplyChangesDialog setup={setup} flow={flow} pipeline={facts.pipeline} onClose={() => setApplyChangesIsAsked(false)} />
        : null}
    </>
  );
}

interface ScreenContentProps {
  readonly facts:            PipelineViewFacts;
  readonly screen:           PipelineScreen;
  readonly boardStore:       PreferenceStore | null;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

function ScreenContent({
  facts, screen, boardStore, followTranscript, clock
}: ScreenContentProps) {
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
  if (screen.screen === 'setup-step' && screen.step === 'research' && setup !== null) {
    return <ResearchStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />;
  }
  const constitutionIsShown = (screen.screen === 'setup-step' && screen.step === 'constitution') || screen.screen === 'constitution-edit';
  if (constitutionIsShown && setup !== null) return <ConstitutionStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />;
  if (screen.screen === 'setup-resume' && setup !== null) return <ResumeSummary setup={setup} />;
  if (screen.screen === 'setup-step' && screen.step === 'design' && setup !== null) {
    return <DesignStep facts={facts} setup={setup} boardStore={boardStore} followTranscript={followTranscript} clock={clock} />;
  }
  const title = <h2 className="bridge-pipeline-title">{PipelineViewModel.screenTitleOf(screen)}</h2>;
  if (screen.screen !== 'flow') return title;
  return (
    <>
      {title}
      <FlowScreen facts={facts} boardStore={boardStore} />
    </>
  );
}

export function PipelineView({
  facts, route, boardStore = null, followTranscript, clock
}: PipelineViewProps) {
  const screen = PipelineViewModel.screenOf(facts, route);
  const setupRouteIsLeft = PipelineViewModel.setupRouteIsLeftOf(screen, route);
  useEffect(() => {
    if (setupRouteIsLeft) HashRouter.navigateTo(PipelineViewModel.liveRoute);
  }, [setupRouteIsLeft]);
  return (
    <section className="bridge-pipeline" aria-label={PipelineViewModel.screenTitleOf(screen)} data-screen={screen.screen}>
      <ScreenContent facts={facts} screen={screen} boardStore={boardStore} followTranscript={followTranscript} clock={clock} />
    </section>
  );
}
