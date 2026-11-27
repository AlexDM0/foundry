/**
 * The page of every pipeline stage that draws the flow (the proposal, live, editing and the smallest pipeline), in the Focus layout of
 * `PipelinePage`: the page's title row over the phase stepper and the one open phase, the stage's panel in the right column, the stage's
 * footer bar under both; and the dialog a step, a gate row or an add choice opens. With no flow yet, the title row, the panel and the footer still stand.
 * In monorepo mode the level rail stands left of the page and the level's breadcrumb over the title; single mode passes neither. An
 * entity's level draws its three phases, and the forge's level draws its own page in place of the phases.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { PageHead }                          from '../../../lib/design-system/DesignSystemInterface.ts';

import { PipelinePage }                      from './PipelinePage.tsx';
import type { PipelineViewFacts }            from './PipelineViewModel.ts';
import { useProfileLogFollower }             from './ProfileLogFollowerContext.ts';
import { PipelineAgentPanelModel }           from './agent-panel/PipelineAgentPanelModel.ts';
import { PipelineDialogs }                   from './dialogs/PipelineDialogs.tsx';
import { useMonorepoLevelScope }             from './entities/MonorepoLevelContext.ts';
import type { FlowSelection, FlowShownItem } from './flow/FlowSelection.ts';
import { OpenPhase }                         from './flow/OpenPhase.tsx';
import { PhaseStepper }                      from './flow/PhaseStepper.tsx';
import { ENTITY_PHASES, PipelinePhaseModel } from './flow/PipelinePhaseModel.ts';
import { MinimalPipelineNoteModel }          from './live/MinimalPipelineNoteModel.ts';

export interface FlowWorkspaceProps {
  readonly facts:       PipelineViewFacts;
  readonly selection:   FlowSelection;
  readonly title:       string;
  readonly lead:        string;
  /** A line over the phases, such as the agent still designing. */
  readonly notice?:     ReactNode;
  /** The right column: the stage's panel. */
  readonly aside:       ReactNode;
  /** The full-width bar under the phase and the panel. */
  readonly footer:      ReactNode;
  /** Monorepo mode's level rail, left of the page. */
  readonly rail?:       ReactNode;
  /** Monorepo mode's level, over the title. */
  readonly breadcrumb?: ReactNode;
  /** The forge level's page, drawn in place of the phase stepper and the open phase. */
  readonly levelPage?:  ReactNode;
}

/** The element that stands for a shown item: a step card, a gate row or the open phase's gates table. */
function elementOf(layout: HTMLElement | null, item: FlowShownItem): HTMLElement | null {
  if (layout === null) return null;
  if (item.kind === 'gates') return layout.querySelector<HTMLElement>('[data-gates-table]');
  const [selector, matches] = item.kind === 'step'
    ? ['[data-step-node-id]', (element: HTMLElement) => element.dataset['stepNodeId'] === item.nodeId] as const
    : ['[data-gate-row-key]', (element: HTMLElement) => element.dataset['gateRowKey'] === item.rowKey] as const;
  return [...layout.querySelectorAll<HTMLElement>(selector)].find(matches) ?? null;
}

export function FlowWorkspace({
  facts, selection, title, lead, notice = null, aside, footer, rail = null, breadcrumb = null, levelPage = null
}: FlowWorkspaceProps) {
  const scope = useMonorepoLevelScope();
  const followProfileLog = useProfileLogFollower();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const { scrollRequest } = selection;
  useEffect(() => {
    if (scrollRequest === null) return;
    elementOf(layoutRef.current, scrollRequest.item)?.scrollIntoView({ block: 'nearest' });
  }, [scrollRequest]);
  const flow = facts.pipeline.flow ?? null;
  const record = facts.pipeline.setup?.record ?? null;
  const main = (
    <>
      {breadcrumb}
      <PageHead titleElement="h2" title={title} lead={lead} />
      {notice}
      {levelPage ?? (flow === null
        ? null
        : (
          <>
            <PhaseStepper
              tabs={PipelinePhaseModel.tabViewsOf(flow, {
                stage:           flow.toolbarStage,
                minimal:         MinimalPipelineNoteModel.noteIsShownFor(flow),
                openQuestionIds: PipelineAgentPanelModel.openQuestionIdsOf(record?.questions ?? []),
                ...(scope?.level.kind === 'entity' ? { phases: ENTITY_PHASES } : {}),
              })}
              openPhase={selection.openPhase}
              onOpen={selection.openPhaseOf}
            />
            <OpenPhase facts={facts} flow={flow} selection={selection} />
          </>
        ))}
    </>
  );
  return (
    <>
      <PipelinePage ref={layoutRef} main={main} panel={aside} footer={footer} rail={rail} />
      <PipelineDialogs
        facts={facts}
        request={selection.openRequest}
        onClose={selection.close}
        {...(followProfileLog === null ? {} : { followLog: followProfileLog })}
      />
    </>
  );
}
