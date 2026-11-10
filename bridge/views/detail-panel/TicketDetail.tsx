/**
 * The ticket form a Kanban card or wave card opens: the head, then the section tabs (Overview, Timeline, Activity, Description), each a link
 * to its own route over the same board tab; only the section shown is mounted, so the body's frame measures itself once it is visible.
 */
import { useEffect, useRef } from 'react';

import { PriorityMark, TypeMark }          from '../../chips/TicketMarks.tsx';
import { StatePill }                       from '../../design-system/StatePill.tsx';
import { Tabs, type TabItem }              from '../../design-system/Tabs.tsx';
import { SandboxedHtmlFrame }              from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { DetailRoute, type TicketSection } from '../../shell/DetailRoute.ts';
import { useDetailRouting }                from '../../shell/DetailRouting.ts';
import { HashRouter }                      from '../../shell/HashRouter.ts';
import { LogLines }                        from './DetailParts.tsx';
import type { TicketDetailModel }          from './TicketDetailModel.ts';
import { TicketOverview }                  from './TicketOverview.tsx';
import { TicketTimeline }                  from './TicketTimeline.tsx';

export const NO_TICKET_LOG_LINES_NOTE = 'No log line names this ticket or its row.';

const PANEL_SCROLL_SELECTOR = '.bridge-side-panel-scroll';

function TicketHead({ model }: { readonly model: TicketDetailModel }) {
  return (
    <div className="bridge-detail-head" data-state={model.stateToken}>
      <span className="bridge-detail-id">{model.idText}</span>
      <h2 className="bridge-detail-title">{model.title}</h2>
      <StatePill label={model.stateLabel} />
      {model.reviewedTitle === null
        ? null
        : <span className="bridge-detail-reviewed-mark" data-state="reviewed" title={model.reviewedTitle} role="img" aria-label="reviewed">✓</span>}
      <PriorityMark priority={model.priority} />
      <TypeMark type={model.ticketType} />
    </div>
  );
}

function logLinesText(count: number): string {
  return count === 1 ? '1 log line' : `${String(count)} log lines`;
}

function SectionTabs({ model }: { readonly model: TicketDetailModel }) {
  const { tab } = useDetailRouting();
  const routeOf = (section: TicketSection) => DetailRoute.sectionRouteOf(tab, model.ticketId, section);
  const items = model.tabs.map((sectionTab): TabItem<TicketSection> => ({
    key:   sectionTab.section,
    label: sectionTab.label,
    href:  HashRouter.fragmentOf(routeOf(sectionTab.section)),
    ...(sectionTab.count === null
      ? {}
      : { count: { count: sectionTab.count, tone: 'neutral' }, accessibleName: `${sectionTab.label}, ${logLinesText(sectionTab.count)}` }),
  }));
  return (
    <Tabs
      label="Ticket sections"
      mode="links"
      size="section"
      items={items}
      selectedKey={model.section}
      onSelect={(section) => HashRouter.navigateTo(routeOf(section))}
    />
  );
}

function ShownSection({ model }: { readonly model: TicketDetailModel }) {
  switch (model.section) {
    case 'timeline':
      return <TicketTimeline model={model.timeline} />;
    case 'activity':
      return <LogLines lines={model.activity} emptyNote={NO_TICKET_LOG_LINES_NOTE} />;
    case 'description':
      return <SandboxedHtmlFrame title={`Description of ${model.title}`} html={model.bodyHtml} placement="ticket-body" />;
    default:
      return <TicketOverview ticketId={model.ticketId} model={model.overview} />;
  }
}

export function TicketDetail({ model }: { readonly model: TicketDetailModel }) {
  const tabBar = useRef<HTMLDivElement>(null);
  // A new section starts at the panel's top, so the tabs and the section's start show; the focus stays on the tab that opened it.
  useEffect(() => {
    const scroller = tabBar.current?.closest(PANEL_SCROLL_SELECTOR) ?? null;
    if (scroller !== null) scroller.scrollTop = 0;
  }, [model.section]);
  return (
    <>
      <TicketHead model={model} />
      <div ref={tabBar} className="bridge-detail-tab-bar">
        <SectionTabs model={model} />
      </div>
      <ShownSection model={model} />
    </>
  );
}
