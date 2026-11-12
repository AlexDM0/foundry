/**
 * A3bConstitution, the constitution step: the agent's state and the free markdown document, in Edit or in a sandboxed Preview, beside an
 * aside with who reads it, the SOURCES the agent drafts from and the agent panel with its questions stacked. The footer counts the
 * sections and rules of the draft. In setup it goes Back to research or Continue to pipeline design; editing an applied pipeline's
 * constitution, it goes Back to the flow.
 */
import { useId, useState } from 'react';

import type { PipelineSetupFacts }                   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }                   from '../../../conversation/TranscriptLog.tsx';
import { ActionBar }                                 from '../../../design-system/ActionBar.tsx';
import { Button }                                    from '../../../design-system/Button.tsx';
import { MicroCapsLabel }                            from '../../../design-system/MicroCapsLabel.tsx';
import { ModelEffortMeter }                          from '../../../design-system/ModelEffortMeter.tsx';
import { SegmentedControl }                          from '../../../design-system/SegmentedControl.tsx';
import { Tag }                                       from '../../../design-system/Tag.tsx';
import { SandboxedHtmlFrame }                        from '../../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { useTickingNow, type BridgeClock }           from '../../../shell/BridgeClock.ts';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { HashRouter }                                from '../../../shell/HashRouter.ts';
import { TimeUtil }                                  from '../../../utils/TimeUtil.ts';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { PipelineAgentPanel }                        from '../agent-panel/PipelineAgentPanel.tsx';
import { BillingStepModel }                          from './BillingStepModel.ts';
import { ConstitutionEditor }                        from './ConstitutionEditor.tsx';
import { ConstitutionStepModel }                     from './ConstitutionStepModel.ts';
import { SourceChoices }                             from './SourceChoices.tsx';

type ConstitutionView = 'edit' | 'preview';

const VIEW_OPTIONS = [{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Preview' }] as const;

export interface ConstitutionStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            PipelineSetupFacts;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

export function ConstitutionStep({
  facts, setup, followTranscript, clock
}: ConstitutionStepProps) {
  const viewLabelId = useId();
  const [view, setView] = useState<ConstitutionView>('edit');
  const { record } = setup;
  const mode = ConstitutionStepModel.stepModeOf(record.mode);
  const agentState = ConstitutionStepModel.agentStateOf(setup);
  const now = useTickingNow(clock, false);
  const meter = BillingStepModel.pipelineAgentMeterOf(record, facts.pipelineChoices);
  const outlineText = ConstitutionStepModel.outlineTextOf(setup.constitutionOutline);
  return (
    <div className="bridge-pipeline-constitution" data-mode={mode} data-state={agentState}>
      <div className="bridge-pipeline-constitution-body">
        <section className="bridge-pipeline-constitution-main" aria-label="The constitution">
          <div className="bridge-pipeline-constitution-hero">
            <div className="bridge-pipeline-constitution-hero-text">
              <span className="bridge-pipeline-constitution-status" data-state={agentState}>
                <span className="bridge-pipeline-constitution-status-dot" aria-hidden="true" />
                {ConstitutionStepModel.statusLineOf(setup)}
              </span>
              <h2 className="bridge-pipeline-setup-heading">The constitution</h2>
              <p className="bridge-pipeline-setup-lead">
                What every builder and reviewer reads first, before its own brief. Edit it here or ask the agent; Apply commits it to main as
                {' '}
                <code>CONSTITUTION.md</code>
                .
              </p>
            </div>
            <span id={viewLabelId} className="bridge-visually-hidden">Show the constitution as</span>
            <SegmentedControl labelledBy={viewLabelId} options={VIEW_OPTIONS} selected={view} onSelect={setView} size="standard" />
          </div>
          <article className="bridge-pipeline-constitution-article" data-view={view}>
            {view === 'edit'
              ? (
                <ConstitutionEditor
                  key={record.setupId}
                  setupId={record.setupId}
                  version={ConstitutionStepModel.versionOf(record.constitution)}
                  annotations={setup.annotations}
                  drafting={agentState === 'drafting'}
                />
              )
              : setup.constitutionHtml === null
                ? <p className="bridge-pipeline-constitution-empty">The agent has not drafted the constitution yet.</p>
                : <SandboxedHtmlFrame title="Constitution preview" html={setup.constitutionHtml} placement="constitution" />}
          </article>
        </section>

        <aside className="bridge-pipeline-constitution-aside" aria-label="Constitution details">
          <div className="bridge-pipeline-constitution-aside-head">
            <span className="bridge-pipeline-constitution-status-dot" data-state={agentState} aria-hidden="true" />
            <b className="bridge-pipeline-constitution-aside-title">Pipeline agent</b>
            <ModelEffortMeter
              model={meter.model}
              effort={meter.effort}
              level={meter.level}
              levelCount={meter.levelCount}
              accessibleName={meter.accessibleName}
              size="node"
            />
          </div>
          <div className="bridge-pipeline-constitution-aside-body">
            <section className="bridge-pipeline-constitution-readers" aria-label="Read by">
              <MicroCapsLabel text="Read by" element="h3" />
              <ul className="bridge-pipeline-constitution-reader-list">
                {ConstitutionStepModel.readerLabelsOf(setup.readByRoles).map((label) => (
                  <li key={label} className="bridge-pipeline-constitution-reader">{label}</li>
                ))}
              </ul>
              <p className="bridge-pipeline-constitution-readers-note">
                Conflicts and red gates go to the last of them that worked on the code, so no other agent reads it.
              </p>
            </section>
            <SourceChoices setup={setup} />
            <PipelineAgentPanel
              setup={setup}
              step="constitution"
              variant="aside"
              followTranscript={followTranscript}
              todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
              composerPlaceholder="For example: we prefer small commits, one subject line each"
            />
          </div>
        </aside>
      </div>

      <ActionBar
        label="Constitution actions"
        start={(
          <>
            <Tag text="Draft" tone="warn" pops />
            {outlineText === null ? null : <span className="bridge-pipeline-constitution-outline">{outlineText}</span>}
            <span className="bridge-pipeline-constitution-footer-note">{ConstitutionStepModel.footerNoteOf(mode)}</span>
          </>
        )}
        end={mode === 'setup'
          ? (
            <>
              <Button label="Back to research" href={PipelineViewModel.setupStepFragmentOf('research')} />
              <CommandButton
                label="Continue to pipeline design"
                command={ConstitutionStepModel.continueCommandOf(setup)}
                primary
                attention={ConstitutionStepModel.continueHasAttention(setup)}
                onApplied={() => HashRouter.navigateTo(PipelineViewModel.setupStepRouteOf('design'))}
              />
            </>
          )
          : <Button label="Back to the flow" href={HashRouter.fragmentOf({ tab: 'pipeline', item: null })} />}
      />
    </div>
  );
}
