/**
 * A3bConstitution, the constitution step, as FlowConstitution draws it: the agent's state over the page's title row with Edit or Preview,
 * and the free markdown document in its card, in Edit or in a sandboxed Preview; beside it the pipeline agent's panel with who reads the
 * constitution, the SOURCES the agent drafts from, the chat with its questions as decision cards, Flint drafting and the composer. The
 * footer counts the sections and rules of the draft. In setup it goes Back to research or Continue to pipeline design; editing an applied
 * pipeline's constitution, it goes Back to the flow.
 */
import { ActionBar }        from 'design-system/ActionBar';
import { Button }           from 'design-system/Button';
import { Row }              from 'design-system/Row';
import { SegmentedControl } from 'design-system/SegmentedControl';
import { Tag }              from 'design-system/Tag';
import { Text }             from 'design-system/Text';
import { View }             from 'design-system/View';
import { useId, useState }  from 'react';

import type { PipelineSetupFacts }                   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }                   from '../../../conversation/TranscriptLog.tsx';
import { SandboxedHtmlFrame }                        from '../../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { useTickingNow, type BridgeClock }           from '../../../shell/BridgeClock.ts';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { HashRouter }                                from '../../../shell/HashRouter.ts';
import { TimeUtil }                                  from '../../../utils/TimeUtil.ts';
import { ViewTitle }                                 from '../../ViewTitle.tsx';
import { PipelinePage }                              from '../PipelinePage.tsx';
import { PipelinePanel }                             from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { AgentMeter }                                from '../agent-panel/AgentMeter.tsx';
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

/** Who reads the constitution, as pills, and who gets the conflicts and red gates. */
function ReadBy({ setup }: { readonly setup: PipelineSetupFacts }) {
  return (
    <section className="bridge-pipeline-constitution-readers" aria-label="Read by">
      <Text typeRole="small" subtle element="h4">Read by</Text>
      <ul className="bridge-pipeline-constitution-reader-list">
        {ConstitutionStepModel.readerLabelsOf(setup.readByRoles).map((label) => (
          <li key={label} className="bridge-pipeline-constitution-reader">{label}</li>
        ))}
      </ul>
      <Text typeRole="tab" muted element="p">Conflicts and red gates go to the last of them that worked on the code, so no other agent reads it.</Text>
    </section>
  );
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
  const outlineText = ConstitutionStepModel.outlineTextOf(setup.constitutionOutline);
  const main = (
    <>
      <Row between gap="sixteen">
        <View gap="two">
          <span className="bridge-pipeline-constitution-status" data-state={agentState}>
            <span className="bridge-pipeline-constitution-status-dot" data-state={agentState} aria-hidden="true" />
            {ConstitutionStepModel.statusLineOf(setup)}
          </span>
          <ViewTitle
            title="The constitution"
            lead={(
              <>
                What every builder and reviewer reads first, before its own brief. Edit it here or ask the agent; Apply commits it to main as
                {' '}
                <code>CONSTITUTION.md</code>
                .
              </>
            )}
          />
        </View>
        <span id={viewLabelId} className="bridge-visually-hidden">Show the constitution as</span>
        <Row paddingBottom="twelve">
          <SegmentedControl labelledBy={viewLabelId} options={VIEW_OPTIONS} selected={view} onSelect={setView} size="standard" />
        </Row>
      </Row>
      <article className="bridge-pipeline-constitution-article" data-view={view} aria-label="Constitution">
        <div className="bridge-pipeline-constitution-article-head">
          <Text typeRole="small" mono muted>CONSTITUTION.md</Text>
          <Text typeRole="small" subtle>The pill beside a rule names its source</Text>
        </div>
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
            ? <Text element="p" muted>The agent has not drafted the constitution yet.</Text>
            : <SandboxedHtmlFrame title="Constitution preview" html={setup.constitutionHtml} placement="constitution" />}
      </article>
    </>
  );
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title="Pipeline agent"
      status={ConstitutionStepModel.panelStatusOf(setup)}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
    >
      <PipelineAgentPanel
        setup={setup}
        step="constitution"
        followTranscript={followTranscript}
        todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
        composerPlaceholder="For example: small commits, one subject line each"
        beforeChat={(
          <>
            <ReadBy setup={setup} />
            <SourceChoices setup={setup} />
          </>
        )}
        showsAgentStrip
      />
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Constitution actions"
      start={(
        <>
          <Tag text="Draft" tone="neutral" />
          {outlineText === null ? null : <Text bold>{outlineText}</Text>}
          <Text muted>{ConstitutionStepModel.footerNoteOf(mode)}</Text>
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
  );
  return (
    <div className="bridge-pipeline-constitution" data-mode={mode} data-state={agentState}>
      <PipelinePage main={main} panel={panel} footer={footer} />
    </div>
  );
}
