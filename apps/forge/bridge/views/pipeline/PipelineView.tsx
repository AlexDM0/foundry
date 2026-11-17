/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route. The setup landing and a
 * reopened billing step show the billing step, the research, entities and constitution steps their pages (the constitution also at
 * `#pipeline/edit/constitution` while an applied pipeline is edited), the design step the proposed flow beside the pipeline agent, the
 * bare `#pipeline` of an open setup the resume summary; each of them carries its own heading, and every other screen shows its title. The
 * setup landing names an unreadable `pipeline.json` in a warn banner. The flow screen draws the Focus layout (the phase stepper, the open
 * phase, the stage's panel in its right column and its footer under both). While an applied pipeline is edited, the panel is the editing
 * panel (the smallest pipeline's About panel instead), and the footer counts the changes, or names the smallest pipeline's removed
 * steps, and the version the board runs on until Apply, beside Discard, which returns to `#pipeline`, and Apply, which opens the apply
 * dialog; one modal dialog is open at a time. Once a setup is applied, the live flow takes back the bare `#pipeline` route, with the
 * activity panel (About first on the smallest pipeline) and the applied footer, and an Apply sent from this view shows its toast once the
 * facts carry the version it made. A gate dialog on any screen reads a profile's output through the follower the view provides.
 */
import { ActionBar }           from 'design-system/ActionBar';
import { Banner }              from 'design-system/Banner';
import { Button }              from 'design-system/Button';
import { Tag }                 from 'design-system/Tag';
import { Text }                from 'design-system/Text';
import { Toast }               from 'design-system/Toast';
import { useEffect, useState } from 'react';

import type { TranscriptFollower }         from '../../conversation/TranscriptLog.tsx';
import { useTickingNow, type BridgeClock } from '../../shell/BridgeClock.ts';
import { CommandButton }                   from '../../shell/CommandButton.tsx';
import { HashRouter, type BridgeRoute }    from '../../shell/HashRouter.ts';
import { TimeUtil }                        from '../../utils/TimeUtil.ts';

import { FlowWorkspace }                                                  from './FlowWorkspace.tsx';
import { PipelineViewModel, type PipelineScreen, type PipelineViewFacts } from './PipelineViewModel.ts';
import { ProfileLogFollowerContext }                                      from './ProfileLogFollowerContext.ts';
import { ApplyChangesDialog }                                             from './apply/ApplyChangesDialog.tsx';
import { ApplyChangesDialogModel }                                        from './apply/ApplyChangesDialogModel.ts';
import type { ProfileLogFollower }                                        from './dialogs/ProfileBox.tsx';
import { EditingAside }                                                   from './editing/EditingAside.tsx';
import { PipelineEditingModel }                                           from './editing/PipelineEditingModel.ts';
import { useFlowSelection }                                               from './flow/FlowSelection.ts';
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
import { EntitiesStep }                                                   from './setup/EntitiesStep.tsx';
import { ResearchStep }                                                   from './setup/ResearchStep.tsx';
import { ResumeSummary }                                                  from './setup/ResumeSummary.tsx';

export interface PipelineViewProps {
  readonly facts:            PipelineViewFacts;
  readonly route:            BridgeRoute;
  /** Follows the pipeline agent's transcript for its chat. */
  readonly followTranscript: TranscriptFollower;
  /** Follows a gate profile's output on its stream route for the gate dialog's log. */
  readonly followProfileLog: ProfileLogFollower;
  readonly clock:            BridgeClock;
}

interface FlowScreenProps {
  readonly facts:            PipelineViewFacts;
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
  const summaryText = minimal ? removedStepsText : PipelineEditingModel.footerSummaryOf(changeList.length, appliedRevision);
  return (
    <ActionBar
      label="Pipeline changes"
      start={(
        <>
          <Tag text="Editing" tone="warn" />
          {summaryText === null ? null : <Text bold>{summaryText}</Text>}
          <Text muted>{PipelineEditingModel.boardNoteOf(appliedRevision)}</Text>
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
  facts, followTranscript, clock, onApplySent
}: FlowScreenProps) {
  const now = useTickingNow(clock, false);
  const setup = facts.pipelineSetup ?? null;
  const selection = useFlowSelection(setup?.applyState === null || setup === null ? null : setup.record.setupId);
  const applyChangesIsAsked = setup !== null && selection.applyIsAskedFor(setup.record.setupId);
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  const minimal = MinimalPipelineNoteModel.noteIsShownFor(flow);
  const words = PipelineViewModel.flowPageWordsOf(flow.toolbarStage, flow, ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline));
  const minimalNote = minimal ? <MinimalPipelineNote flow={flow} /> : null;
  if (flow.toolbarStage === 'live') {
    const stampFormat = stampFormatOf(facts, now);
    const footer = LivePipelineModel.footerOf(facts.pipeline, stampFormat);
    return (
      <FlowWorkspace
        facts={facts}
        selection={selection}
        title={words.title}
        lead={words.lead}
        aside={<FlowActivityPanel facts={facts} stampFormat={stampFormat} clock={clock} />}
        footer={footer === null ? null : <LiveFooter footer={footer} />}
      />
    );
  }
  if (flow.toolbarStage !== 'editing' || setup === null) {
    return <FlowWorkspace facts={facts} selection={selection} title={words.title} lead={words.lead} aside={minimalNote} footer={null} />;
  }
  return (
    <>
      <FlowWorkspace
        facts={facts}
        selection={selection}
        title={words.title}
        lead={words.lead}
        aside={minimalNote ?? <EditingAside facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />}
        footer={(
          <EditingFooter
            facts={facts}
            setupId={setup.record.setupId}
            minimal={minimal}
            applyIsAsked={applyChangesIsAsked}
            onApplyAsked={() => selection.askApply(setup.record.setupId)}
          />
        )}
      />
      {applyChangesIsAsked
        ? (
          <ApplyChangesDialog
            setup={setup}
            flow={flow}
            pipeline={facts.pipeline}
            onClose={selection.closeApply}
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
  readonly route:            BridgeRoute;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
  readonly onApplySent:      (resumesBoard: boolean) => void;
}

function ScreenContent({
  facts, screen, route, followTranscript, clock, onApplySent
}: ScreenContentProps) {
  const setup = facts.pipelineSetup ?? null;
  if (screen.screen === 'setup-landing') {
    return (
      <>
        {screen.unreadable === null
          ? null
          : <div className="bridge-pipeline-unreadable-notice"><Banner tone="warn" role="status" text={PipelineViewModel.unreadableTextOf(screen.unreadable)} /></div>}
        <BillingStep facts={facts} replacesUnreadablePipeline={screen.unreadable !== null} />
      </>
    );
  }
  if (screen.screen === 'setup-step' && screen.step === 'billing') return <BillingStep facts={facts} replacesUnreadablePipeline={false} />;
  if (screen.screen === 'setup-step' && screen.step === 'research' && setup !== null) {
    return <ResearchStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />;
  }
  if (screen.screen === 'setup-step' && screen.step === 'entities' && setup !== null) {
    return <EntitiesStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />;
  }
  const constitutionIsShown = (screen.screen === 'setup-step' && screen.step === 'constitution') || screen.screen === 'constitution-edit';
  if (constitutionIsShown && setup !== null) return <ConstitutionStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />;
  if (screen.screen === 'setup-resume' && setup !== null) return <ResumeSummary setup={setup} />;
  if (screen.screen === 'setup-step' && screen.step === 'design' && setup !== null) {
    return (
      <DesignStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} onApplySent={onApplySent} route={route} />
    );
  }
  if (screen.screen !== 'flow') return <h2 className="bridge-pipeline-title">{PipelineViewModel.screenTitleOf(screen)}</h2>;
  return <FlowScreen facts={facts} followTranscript={followTranscript} clock={clock} onApplySent={onApplySent} />;
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
  facts, route, followTranscript, followProfileLog, clock
}: PipelineViewProps) {
  const screen = PipelineViewModel.screenOf(facts, route);
  const setupRouteIsLeft = PipelineViewModel.setupRouteIsLeftOf(screen, route);
  const appliedToast = useAppliedToast(facts);
  useEffect(() => {
    if (setupRouteIsLeft) HashRouter.navigateTo(PipelineViewModel.liveRouteOf(route));
  }, [setupRouteIsLeft, route]);
  return (
    <section className="bridge-pipeline" aria-label={PipelineViewModel.screenTitleOf(screen)} data-screen={screen.screen}>
      <ProfileLogFollowerContext.Provider value={followProfileLog}>
        <ScreenContent
          facts={facts}
          screen={screen}
          route={route}
          followTranscript={followTranscript}
          clock={clock}
          onApplySent={appliedToast.awaitApply}
        />
      </ProfileLogFollowerContext.Provider>
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
