/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route. The setup landing and a
 * reopened billing step show the billing step, the research and constitution steps their pages (the constitution also at
 * `#pipeline/edit/constitution` while an applied pipeline is edited), the design step the proposed flow beside the pipeline agent, the
 * bare `#pipeline` of an open setup the resume summary; each of them carries its own heading, and every other screen shows its title. The
 * setup landing names an unreadable `pipeline.json` in a warn banner. The flow screen draws the flow workspace (the flow, the smallest
 * pipeline's note beside it, the gates area under them and the dialog a node, a gate row or a + opens). While an applied pipeline is
 * edited, the editing aside stands beside it (the smallest pipeline keeps its note instead), and the footer counts the changes, or names
 * the smallest pipeline's removed steps, beside Discard, which returns to `#pipeline`, and Apply, which opens the apply dialog. Once a
 * setup is applied, the live flow takes back the bare `#pipeline` route.
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
import { ApplyChangesDialogModel }                                        from './apply/ApplyChangesDialogModel.ts';
import { EditingAside }                                                   from './editing/EditingAside.tsx';
import { PipelineEditingModel }                                           from './editing/PipelineEditingModel.ts';
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
  readonly facts:            PipelineViewFacts;
  readonly boardStore:       PreferenceStore | null;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

interface EditingFooterProps {
  readonly facts:        PipelineViewFacts;
  readonly setupId:      string;
  /** The smallest pipeline names its removed steps and offers Apply changes, as A7 draws it. */
  readonly minimal:      boolean;
  readonly applyIsAsked: boolean;
  readonly onApplyAsked: () => void;
}

function EditingFooter({
  facts, setupId, minimal, applyIsAsked, onApplyAsked
}: EditingFooterProps) {
  const changeList = facts.pipelineFlow?.changeList ?? [];
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline);
  const removedStepsText = PipelineFlowModel.removedStepsTextOf(changeList);
  const notes = minimal
    ? (removedStepsText === null ? null : <span className="bridge-pipeline-footer-note">{removedStepsText}</span>)
    : (
      <>
        <span className="bridge-pipeline-editing-summary">{PipelineEditingModel.footerSummaryOf(changeList.length, appliedRevision)}</span>
        <span className="bridge-pipeline-footer-note">{PipelineEditingModel.boardNoteOf(appliedRevision)}</span>
      </>
    );
  return (
    <ActionBar
      label="Pipeline changes"
      start={(
        <>
          <Tag text="Editing" tone="warn" pops />
          {notes}
        </>
      )}
      end={(
        <>
          <CommandButton
            label="Discard"
            command={PipelineEditingModel.discardCommandOf(setupId)}
            onApplied={() => HashRouter.navigateTo(PipelineViewModel.liveRoute)}
          />
          <Button
            label={minimal ? 'Apply changes' : ApplyChangesDialogModel.applyLabelOf(changeList.length)}
            emphasis="primary"
            expanded={applyIsAsked}
            onPress={onApplyAsked}
          />
        </>
      )}
    />
  );
}

function FlowScreen({
  facts, boardStore, followTranscript, clock
}: FlowScreenProps) {
  const selection = useFlowSelection();
  const setup = facts.pipelineSetup ?? null;
  const [applyChangesIsAsked, setApplyChangesIsAsked] = useState((setup?.applyState ?? null) !== null);
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  const minimal = MinimalPipelineNoteModel.noteIsShownFor(flow);
  const workspace = (
    <FlowWorkspace
      facts={facts}
      boardStore={boardStore}
      selection={selection}
      flowAside={minimal ? <MinimalPipelineNote flow={flow} /> : null}
    />
  );
  if (flow.toolbarStage !== 'editing' || setup === null) return workspace;
  return (
    <>
      {minimal
        ? workspace
        : (
          <div className="bridge-pipeline-editing-body">
            <div className="bridge-pipeline-editing-main">{workspace}</div>
            <EditingAside facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />
          </div>
        )}
      <EditingFooter
        facts={facts}
        setupId={setup.record.setupId}
        minimal={minimal}
        applyIsAsked={applyChangesIsAsked}
        onApplyAsked={() => setApplyChangesIsAsked(true)}
      />
      {applyChangesIsAsked
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
      <FlowScreen facts={facts} boardStore={boardStore} followTranscript={followTranscript} clock={clock} />
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
