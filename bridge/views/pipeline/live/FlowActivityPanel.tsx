/**
 * The live flow's panel (A5Live): the "On the flow" tab lists what runs now, one row per ticket or draft on the flow linking to its detail,
 * then the newest pipeline records; the Pipeline agent tab says that no agent runs until one is asked. On the smallest pipeline, the About
 * tab comes first. The head names the selected tab, with how many work and the builds at a time on the flow tab. Under every tab, Ask the
 * pipeline agent sends `pipeline-agent-advise` and turns to the agent's tab; the advise session it opens then shows as an edit of the
 * pipeline.
 */

import { ActivityRow }              from 'design-system/ActivityRow';
import { MicroCapsLabel }           from 'design-system/MicroCapsLabel';
import { ModelEffortMeter }         from 'design-system/ModelEffortMeter';
import { Tabs, type TabItem }       from 'design-system/Tabs';
import { Text }                     from 'design-system/Text';
import { useState, type ReactNode } from 'react';

import { useTickingNow, type BridgeClock } from '../../../shell/BridgeClock.ts';
import { CommandButton }                   from '../../../shell/CommandButton.tsx';
import {
  PipelinePanel,
  PipelinePanelBody,
  PipelinePanelFoot,
  type PanelStatus
} from '../PipelinePanel.tsx';
import type { PipelineViewFacts } from '../PipelineViewModel.ts';
import {
  FlowActivityPanelModel,
  type ActivityRowView,
  type HistoryLineView,
  type StampFormat
} from './FlowActivityPanelModel.ts';
import { LivePipelineModel }                       from './LivePipelineModel.ts';
import { ABOUT_PANEL_TITLE, MinimalPipelineAbout } from './MinimalPipelineNote.tsx';
import { MinimalPipelineNoteModel }                from './MinimalPipelineNoteModel.ts';

type ActivityTab = 'about' | 'flow' | 'agent';

const AGENT_NOT_RUNNING: PanelStatus = { tone: 'idle', text: 'Not running' };

export interface FlowActivityPanelProps {
  readonly facts:       PipelineViewFacts;
  readonly stampFormat: StampFormat | null;
  readonly clock:       BridgeClock;
}

function NowRows({ rows }: { readonly rows: readonly ActivityRowView[] }) {
  if (rows.length === 0) return <Text element="p" muted>Nothing is on the flow now.</Text>;
  return (
    <ul className="bridge-pipeline-activity-rows">
      {rows.map((row) => (
        <li key={row.key}>
          <ActivityRow
            href={row.href}
            status={row.status}
            idText={row.idText}
            stepText={row.stepText}
            elapsed={row.elapsed}
            {...(row.meter === null
              ? {}
              : {
                meter: (
                  <ModelEffortMeter
                    model={row.meter.model}
                    effort={row.meter.effort}
                    level={row.meter.level}
                    levelCount={row.meter.levelCount}
                    accessibleName={row.meter.accessibleName}
                    size="node"
                  />
                ),
              })}
          />
        </li>
      ))}
    </ul>
  );
}

function EarlierLines({ lines }: { readonly lines: readonly HistoryLineView[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      <MicroCapsLabel text="Earlier" element="h4" />
      <ul className="bridge-pipeline-activity-history">
        {lines.map((line) => (
          <li key={line.key} className="bridge-pipeline-activity-history-line">
            {line.clock === null ? null : <span className="bridge-pipeline-activity-history-clock">{line.clock}</span>}
            {line.text}
          </li>
        ))}
      </ul>
    </>
  );
}

export function FlowActivityPanel({ facts, stampFormat, clock }: FlowActivityPanelProps) {
  const flow = facts.pipelineFlow ?? null;
  const showsAbout = flow !== null && MinimalPipelineNoteModel.noteIsShownFor(flow);
  const [activityTab, setActivityTab] = useState<ActivityTab>(showsAbout ? 'about' : 'flow');
  const occupantCount = flow?.occupants.length ?? 0;
  const now = useTickingNow(clock, occupantCount > 0);
  const rows = flow === null ? [] : FlowActivityPanelModel.activityRowsOf(flow, facts.pipelineChoices?.efforts ?? [], now);
  const historyLines = FlowActivityPanelModel.historyLinesOf(facts.pipelineHistory ?? [], stampFormat);
  const concurrencyLimit = facts.concurrency?.limit ?? null;
  const tabItems: TabItem<ActivityTab>[] = [
    ...(showsAbout ? [{ key: 'about' as const, label: 'About' }] : []),
    { key: 'flow', label: 'On the flow' },
    { key: 'agent', label: 'Pipeline agent' },
  ];
  const tabParts: Readonly<Record<ActivityTab, { title: string; status: PanelStatus | null; headEnd: ReactNode; body: ReactNode }>> = {
    about: {
      title: ABOUT_PANEL_TITLE, status: null, headEnd: null, body: flow === null ? null : <MinimalPipelineAbout flow={flow} />
    },
    flow: {
      title:   'On the flow',
      status:  FlowActivityPanelModel.flowStatusOf(rows.length),
      headEnd: concurrencyLimit === null ? null : <Text typeRole="small" subtle>{FlowActivityPanelModel.buildsAtATimeTextOf(concurrencyLimit)}</Text>,
      body:    (
        <>
          <MicroCapsLabel text={FlowActivityPanelModel.nowHeadingOf(rows.length)} element="h4" />
          <NowRows rows={rows} />
          <EarlierLines lines={historyLines} />
        </>
      ),
    },
    agent: {
      title:   'Pipeline agent',
      status:  AGENT_NOT_RUNNING,
      headEnd: null,
      body:    (
        <Text element="p" muted>
          No pipeline agent runs now. Ask it to read the pipeline and the gate history: it proposes changes as an edit to apply.
        </Text>
      ),
    },
  };
  const selected = tabParts[activityTab];
  return (
    <PipelinePanel
      label="Activity"
      title={selected.title}
      status={selected.status}
      headEnd={selected.headEnd}
      tabs={<Tabs label="Activity and the pipeline agent" mode="switch" size="section" selectedKey={activityTab} onSelect={setActivityTab} items={tabItems} />}
      tabPanelLabel={tabItems.find((item) => item.key === activityTab)?.label ?? ''}
    >
      <PipelinePanelBody>{selected.body}</PipelinePanelBody>
      <PipelinePanelFoot>
        <CommandButton label="Ask the pipeline agent" command={LivePipelineModel.adviseCommand} onApplied={() => setActivityTab('agent')} />
      </PipelinePanelFoot>
    </PipelinePanel>
  );
}
