/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route. The setup landing and a
 * reopened billing step show the billing step, the research and constitution steps their pages (the constitution also at
 * `#pipeline/edit/constitution` while an applied pipeline is edited), the design step the proposed flow beside the pipeline agent, the
 * bare `#pipeline` of an open setup the resume summary; each of them carries its own heading, and every other screen shows its title. The
 * setup landing names an unreadable `pipeline.json` in a warn banner. The flow screen draws the flow workspace (the flow, the smallest
 * pipeline's note beside it, the gates area under them and the dialog a node, a gate row or a + opens). While an applied pipeline is
 * edited, the editing aside stands beside it (the smallest pipeline keeps its note instead), and the footer counts the changes, or names
 * the smallest pipeline's removed steps, beside Discard, which returns to `#pipeline`, and Apply, which opens the apply dialog. Once a
 * setup is applied, the live flow takes back the bare `#pipeline` route; it stands beside the activity aside over the applied footer, and
 * an Apply sent from this view shows its toast once the facts carry the version it made.
 */
import { useEffect, useState } from 'react';

import type { TranscriptFollower }         from '../../conversation/TranscriptLog.tsx';
import { ActionBar }                       from '../../design-system/ActionBar.tsx';
import { Banner }                          from '../../design-system/Banner.tsx';
import { Button }                          from '../../design-system/Button.tsx';
import { Tag }                             from '../../design-system/Tag.tsx';
import { Toast }                           from '../../design-system/Toast.tsx';
import type { PreferenceStore }            from '../../preferences/PreferenceStore.ts';
import { useTickingNow, type BridgeClock } from '../../shell/BridgeClock.ts';
import { CommandButton }                   from '../../shell/CommandButton.tsx';
import { HashRouter, type BridgeRoute }    from '../../shell/HashRouter.ts';
import { TimeUtil }                        from '../../utils/TimeUtil.ts';

import { FlowWorkspace, useFlowSelection }                                from './FlowWorkspace.tsx';
import { PipelineViewModel, type PipelineScreen, type PipelineViewFacts } from './PipelineViewModel.ts';
import { ApplyChangesDialog }                                             from './apply/ApplyChangesDialog.tsx';
import { ApplyChangesDialogModel }                                        from './apply/ApplyChangesDialogModel.ts';
import { EditingAside }                                                   from './editing/EditingAside.tsx';
import { PipelineEditingModel }                                           from './editing/PipelineEditingModel.ts';
import { PipelineFlowModel }                                              from './flow/PipelineFlowModel.ts';
import { FlowActivityPanel }                                              from './live/FlowActivityPanel.tsx';
import type { StampFormat }                                               from './live/FlowActivityPanelModel.ts';
import { LiveFooter }                                                     from './live/LiveFooter.tsx';
import { LivePipelineModel, type LiveToastView }                          from './live/LivePipelineModel.ts';
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
  readonly onApplySent:      (resumesBoard: boolean) => void;
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

/** The page's stamp slices with the viewer's day; null on a board whose page carries none. */
function stampFormatOf(facts: PipelineViewFacts, now: Date): StampFormat | null {
  const slices = facts.page?.payload?.limits ?? null;
  return slices === null ? null : { todayCalendarDate: TimeUtil.calendarDateOf(now.getTime()), slices };
}

function FlowScreen({
  facts, boardStore, followTranscript, clock, onApplySent
}: FlowScreenProps) {
  const now = useTickingNow(clock, false);
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
  if (flow.toolbarStage === 'live') {
    const footer = LivePipelineModel.footerOf(facts.pipeline, stampFormatOf(facts, now));
    return (
      <>
        <div className="bridge-pipeline-live-body">
          <div className="bridge-pipeline-live-main">{workspace}</div>
          <FlowActivityPanel facts={facts} stampFormat={stampFormatOf(facts, now)} clock={clock} />
        </div>
        {footer === null ? null : <LiveFooter footer={footer} />}
      </>
    );
  }
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
        ? (
          <ApplyChangesDialog
            setup={setup}
            flow={flow}
            pipeline={facts.pipeline}
            onClose={() => setApplyChangesIsAsked(false)}
            onApplySent={() => onApplySent(false)}
          />
        )
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
  readonly onApplySent:      (resumesBoard: boolean) => void;
}

function ScreenContent({
  facts, screen, boardStore, followTranscript, clock, onApplySent
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
    return (
      <DesignStep facts={facts} setup={setup} boardStore={boardStore} followTranscript={followTranscript} clock={clock} onApplySent={onApplySent} />
    );
  }
  const title = <h2 className="bridge-pipeline-title">{PipelineViewModel.screenTitleOf(screen)}</h2>;
  if (screen.screen !== 'flow') return title;
  return (
    <>
      {title}
      <FlowScreen facts={facts} boardStore={boardStore} followTranscript={followTranscript} clock={clock} onApplySent={onApplySent} />
    </>
  );
}

/** An Apply this view sent: the applied version before it, and whether it resumes the board. */
interface AwaitedApply {
  readonly revisionBefore: number | null;
  readonly resumesBoard:   boolean;
}

/** The toast after an Apply this view sent, shown once the facts carry the newer applied version. */
function useAppliedToast(facts: PipelineViewFacts): { toast: LiveToastView | null; awaitApply: (resumesBoard: boolean) => void; dismiss: () => void } {
  const [awaitedApply, setAwaitedApply] = useState<AwaitedApply | null>(null);
  const [toast, setToast] = useState<LiveToastView | null>(null);
  const landedRevision = awaitedApply === null ? null : LivePipelineModel.landedRevisionOf(awaitedApply.revisionBefore, facts.pipeline);
  // The facts of this render carry the landing: the state moves here, as React's adjusting-state-on-new-props pattern does.
  if (awaitedApply !== null && landedRevision !== null) {
    setToast(LivePipelineModel.toastOf(awaitedApply.resumesBoard, landedRevision));
    setAwaitedApply(null);
  }
  const revisionBefore = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline);
  return {
    toast,
    awaitApply: (resumesBoard) => setAwaitedApply({ revisionBefore, resumesBoard }),
    dismiss:    () => setToast(null),
  };
}

export function PipelineView({
  facts, route, boardStore = null, followTranscript, clock
}: PipelineViewProps) {
  const screen = PipelineViewModel.screenOf(facts, route);
  const setupRouteIsLeft = PipelineViewModel.setupRouteIsLeftOf(screen, route);
  const appliedToast = useAppliedToast(facts);
  useEffect(() => {
    if (setupRouteIsLeft) HashRouter.navigateTo(PipelineViewModel.liveRoute);
  }, [setupRouteIsLeft]);
  return (
    <section className="bridge-pipeline" aria-label={PipelineViewModel.screenTitleOf(screen)} data-screen={screen.screen}>
      <ScreenContent
        facts={facts}
        screen={screen}
        boardStore={boardStore}
        followTranscript={followTranscript}
        clock={clock}
        onApplySent={appliedToast.awaitApply}
      />
      {appliedToast.toast === null
        ? null
        : (
          <div className="bridge-pipeline-toast">
            <Toast title={appliedToast.toast.title} text={appliedToast.toast.text} glyph="check" onExpired={appliedToast.dismiss} />
          </div>
        )}
    </section>
  );
}
