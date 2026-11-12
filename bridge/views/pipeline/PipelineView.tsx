/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route. The setup landing and a
 * reopened billing step show the billing step, the research step its page, the bare `#pipeline` of an open setup the resume summary; each
 * of them carries its own heading, and every other screen shows its title. The setup landing names an unreadable `pipeline.json` in a
 * warn banner. The flow screen draws the pipeline flow, the smallest pipeline's note beside it, and, while editing, the footer with the
 * removed steps, Discard and Apply changes.
 */
import { useState } from 'react';

import type { TranscriptFollower } from '../../conversation/TranscriptLog.tsx';
import { ActionBar }               from '../../design-system/ActionBar.tsx';
import { Banner }                  from '../../design-system/Banner.tsx';
import { Button }                  from '../../design-system/Button.tsx';
import { Tag }                     from '../../design-system/Tag.tsx';
import type { PreferenceStore }    from '../../preferences/PreferenceStore.ts';
import type { BridgeClock }        from '../../shell/BridgeClock.ts';
import { CommandButton }           from '../../shell/CommandButton.tsx';
import type { BridgeRoute }        from '../../shell/HashRouter.ts';

import { PipelineViewModel, type PipelineScreen, type PipelineViewFacts } from './PipelineViewModel.ts';
import { PipelineFlow, type FlowOpenRequest }                             from './flow/PipelineFlow.tsx';
import { PipelineFlowModel }                                              from './flow/PipelineFlowModel.ts';
import { MinimalPipelineNote }                                            from './live/MinimalPipelineNote.tsx';
import { MinimalPipelineNoteModel }                                       from './live/MinimalPipelineNoteModel.ts';
import { BillingStep }                                                    from './setup/BillingStep.tsx';
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
  const [openRequest, setOpenRequest] = useState<FlowOpenRequest | null>(null);
  const [applyChangesIsAsked, setApplyChangesIsAsked] = useState(false);
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  const record = facts.pipelineSetup?.record ?? null;
  const livePipeline = facts.pipeline?.readingVerdict === 'readable' ? facts.pipeline.pipeline : null;
  const editing = flow.toolbarStage === 'editing' && record !== null;
  const removedStepsText = PipelineFlowModel.removedStepsTextOf(flow.changeList);
  return (
    <>
      <div className="bridge-pipeline-flow-screen">
        <PipelineFlow
          flow={flow}
          draft={record?.draft ?? livePipeline}
          editTarget={record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision }}
          efforts={facts.pipelineChoices?.efforts ?? []}
          profileRuns={facts.profileRuns ?? []}
          boardStore={boardStore}
          selectedNodeId={openRequest?.kind === 'node' ? openRequest.nodeId : null}
          onOpen={setOpenRequest}
        />
        {MinimalPipelineNoteModel.noteIsShownFor(flow) ? <MinimalPipelineNote flow={flow} /> : null}
      </div>
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
  if (screen.screen === 'setup-resume' && setup !== null) return <ResumeSummary setup={setup} />;
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
  return (
    <section className="bridge-pipeline" aria-label={PipelineViewModel.screenTitleOf(screen)} data-screen={screen.screen}>
      <ScreenContent facts={facts} screen={screen} boardStore={boardStore} followTranscript={followTranscript} clock={clock} />
    </section>
  );
}
