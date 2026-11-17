/**
 * The live flow's panel (A5Live): the "On the flow" tab lists what runs now, one row per ticket or draft on the flow linking to its detail,
 * then the newest pipeline records; the Pipeline agent tab says that no agent runs until one is asked. On the smallest pipeline, the About
 * tab comes first. The head names the selected tab, with how many work and the builds at a time on the flow tab. Under every tab, Ask the
 * pipeline agent sends `pipeline-agent-advise` and turns to the agent's tab; the advise session it opens then shows as an edit of the
 * pipeline. On a forge over entities (MonoLive) the flow tab lists every entity's work, each row naming its entity or the forge and a
 * package stage the crossing it runs, then every entity's gate profiles under way, and the agent's tab and Ask name the level shown,
 * whose entity the advise command carries.
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
import { PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';
import { EntityWorkModel }                        from './EntityWorkModel.ts';
import {
  FlowActivityPanelModel,
  type ActivityRowView,
  type HistoryLineView,
  type OccupantCrossingNamer,
  type OccupantLevelNamer,
  type StampFormat
} from './FlowActivityPanelModel.ts';
import { LivePipelineModel, type LivePipelineFacts } from './LivePipelineModel.ts';
import { ABOUT_PANEL_TITLE, MinimalPipelineAbout }   from './MinimalPipelineNote.tsx';
import { MinimalPipelineNoteModel }                  from './MinimalPipelineNoteModel.ts';

type ActivityTab = 'about' | 'flow' | 'agent';

const AGENT_NOT_RUNNING: PanelStatus = { tone: 'idle', text: 'Not running' };

export interface FlowActivityPanelProps {
  readonly facts:       LivePipelineFacts;
  readonly stampFormat: StampFormat | null;
  readonly clock:       BridgeClock;
  /** The level shown on a forge over entities; absent in single mode. */
  readonly level?:      PipelineLevel | null;
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

export function FlowActivityPanel({
  facts, stampFormat, clock, level = null
}: FlowActivityPanelProps) {
  const flow = facts.pipelineFlow ?? null;
  // The forge's own flow of a monorepo holds no review or gates by design: it is no smallest pipeline to explain.
  const showsAbout = level === null && flow !== null && MinimalPipelineNoteModel.noteIsShownFor(flow);
  const [activityTab, setActivityTab] = useState<ActivityTab>(showsAbout ? 'about' : 'flow');
  const occupantCount = flow?.occupants.length ?? 0;
  const now = useTickingNow(clock, occupantCount > 0);
  const jobs = facts.jobs ?? [];
  const levelNameOf: OccupantLevelNamer | null = level === null
    ? null
    : (occupant, node) => {
      const occupantLevel = LivePipelineModel.occupantLevelOf(occupant, node, jobs);
      return occupantLevel === null ? null : PipelineLevelModel.levelNameOf(occupantLevel);
    };
  const crossingTextOf: OccupantCrossingNamer | null = level === null
    ? null
    : (occupant) => (occupant.occupantKind === 'ticket' ? EntityWorkModel.crossingActivityTextOf(occupant.occupantId, facts) : null);
  const occupantRows = flow === null ? [] : FlowActivityPanelModel.activityRowsOf(flow, facts.pipelineChoices?.efforts ?? [], now, levelNameOf, crossingTextOf);
  const rows = level === null ? occupantRows : [...occupantRows, ...FlowActivityPanelModel.profileActivityRowsOf(facts.profileRuns ?? [])];
  const historyLines = FlowActivityPanelModel.historyLinesOf(facts.pipelineHistory ?? [], stampFormat);
  const concurrencyLimit = facts.concurrency?.limit ?? null;
  const tabItems: TabItem<ActivityTab>[] = [
    ...(showsAbout ? [{ key: 'about' as const, label: 'About' }] : []),
    { key: 'flow', label: 'On the flow' },
    { key: 'agent', label: LivePipelineModel.agentTabLabelOf(level) },
  ];
  const flowHeadText = level === null
    ? (concurrencyLimit === null ? null : FlowActivityPanelModel.buildsAtATimeTextOf(concurrencyLimit))
    : FlowActivityPanelModel.everyEntityHeadTextOf(concurrencyLimit);
  const tabParts: Readonly<Record<ActivityTab, { title: string; status: PanelStatus | null; headEnd: ReactNode; body: ReactNode }>> = {
    about: {
      title: ABOUT_PANEL_TITLE, status: null, headEnd: null, body: flow === null ? null : <MinimalPipelineAbout flow={flow} />
    },
    flow: {
      title:   'On the flow',
      status:  FlowActivityPanelModel.flowStatusOf(rows.length),
      headEnd: flowHeadText === null ? null : <Text typeRole="small" subtle>{flowHeadText}</Text>,
      body:    (
        <>
          <MicroCapsLabel text={FlowActivityPanelModel.nowHeadingOf(rows.length)} element="h4" />
          <NowRows rows={rows} />
          <EarlierLines lines={historyLines} />
        </>
      ),
    },
    agent: {
      title:   LivePipelineModel.agentTabLabelOf(level),
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
        <CommandButton
          label={LivePipelineModel.askLabelOf(level)}
          command={level === null ? LivePipelineModel.adviseCommand : LivePipelineModel.adviseCommandOf(level)}
          onApplied={() => setActivityTab('agent')}
        />
      </PipelinePanelFoot>
    </PipelinePanel>
  );
}
