/**
 * The Activity view (artboard A3): what happened across the fleet, newest first, filtered by kind and by forge, beside today's landings and
 * tokens per forge and the usage line. `ActivityView` keeps the filters and whether the forge menu is open; `ActivityLayout` takes no hooks
 * and lays the view out from the model's content alone.
 */
import { FillMeter }        from 'design-system/FillMeter';
import { SegmentedControl } from 'design-system/SegmentedControl';
import type { StateTone }   from 'design-system/StateTone';
import { Text }             from 'design-system/Text';
import {
  type FocusEvent,
  type KeyboardEvent,
  useMemo,
  useState
} from 'react';

import { LIMITS }                          from '../../../src/shared/constants/Limits.ts';
import type { FleetDocument }              from '../../@types/FleetDocument.ts';
import { DataTable, type DataTableColumn } from '../../design-system/DataTable.tsx';
import { RoleDot }                         from '../../design-system/RoleDot.tsx';
import {
  type ActivityContent,
  type ActivityFilters,
  type ActivityKindFilter,
  ActivityModel,
  type ActivityRow,
  EVERY_ENTRY,
  type ForgeChoices,
  KIND_FILTER_LABELS,
  KIND_FILTERS,
  type TodayList,
} from './ActivityModel.ts';

export const ACTIVITY_STATUS_LINE = `the newest ${LIMITS.activityEntriesShownPerForge} entries of each forge, as each forge words them`;

type ActivityColumn = 'at' | 'forge' | 'kind' | 'text';

const COLUMNS: readonly DataTableColumn<ActivityColumn>[] = [
  { key: 'at', label: 'At' },
  { key: 'forge', label: 'Forge' },
  { key: 'kind', label: 'Kind' },
  { key: 'text', label: 'What happened' },
];

const COLUMN_WIDTHS = 'var(--activity-at-width) var(--activity-forge-width) var(--activity-kind-width) minmax(0, 1fr)';

const KIND_OPTIONS = KIND_FILTERS.map((kind) => ({ value: kind, label: KIND_FILTER_LABELS[kind] }));

/** A tracker id is never empty, so the empty value stands for every forge. */
const EVERY_FORGE_VALUE = '';

const FORGE_MENU_ID = 'gaia-activity-forge-menu';
const KIND_LABEL_ID = 'gaia-activity-kind-label';
const FORGE_LABEL_ID = 'gaia-activity-forge-label';

const FOOTNOTE = 'A dormant forge shows its entries up to its stop. Older entries are in each forge\'s own log.';

const NOTHING_REPORTED_SENTENCE = 'No forge reports it.';

export interface ActivityLayoutProps {
  readonly content:       ActivityContent;
  readonly kindFilter:    ActivityKindFilter;
  readonly menuIsOpen:    boolean;
  readonly onKindFilter:  (kind: ActivityKindFilter) => void;
  /** `null` for every forge. */
  readonly onForgeChoice: (trackerId: string | null) => void;
  readonly onMenuToggle:  () => void;
  readonly onMenuClose:   () => void;
}

function KindCell({ row }: { readonly row: ActivityRow }) {
  return (
    <span className="gaia-activity-kind">
      {row.dotRole === null ? <span className="gaia-activity-dot-space" aria-hidden="true" /> : <RoleDot role={row.dotRole} />}
      {row.categoryWord}
    </span>
  );
}

function TextCell({ row }: { readonly row: ActivityRow }) {
  if (row.href === null) return <span className="gaia-activity-text" title={row.text}>{row.text}</span>;
  return <a className="gaia-activity-text" href={row.href} title={row.text}>{row.text}</a>;
}

function tableRowsOf(rows: readonly ActivityRow[]) {
  return rows.map((row) => ({
    key:   row.key,
    cells: {
      at:    <time className="gaia-activity-at" dateTime={row.at}>{row.clockTime}</time>,
      forge: <span className="gaia-activity-forge">{row.project}</span>,
      kind:  <KindCell row={row} />,
      text:  <TextCell row={row} />,
    },
  }));
}

interface ForgeMenuProps {
  readonly choices:       ForgeChoices;
  readonly menuIsOpen:    boolean;
  readonly onForgeChoice: (trackerId: string) => void;
  readonly onMenuToggle:  () => void;
  readonly onMenuClose:   () => void;
}

/** The forges past the first three, behind one more segment that names the chosen one when it is among them. */
function ForgeMenu({
  choices, menuIsOpen, onForgeChoice, onMenuToggle, onMenuClose
}: ForgeMenuProps) {
  if (choices.inMenu.length === 0) return null;
  const chosenInMenu = choices.inMenu.find((choice) => choice.trackerId === choices.chosen) ?? null;
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onMenuClose();
  };
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLElement>) => {
    if (event.relatedTarget === null || !event.currentTarget.contains(event.relatedTarget)) onMenuClose();
  };
  return (
    <span className="gaia-activity-more-forges" onKeyDown={closeOnEscape} onBlur={closeWhenFocusLeaves}>
      <button
        type="button"
        className="gaia-activity-more-forges-button"
        aria-pressed={chosenInMenu !== null}
        aria-expanded={menuIsOpen}
        aria-controls={menuIsOpen ? FORGE_MENU_ID : undefined}
        onClick={onMenuToggle}
      >
        {chosenInMenu === null ? `${choices.inMenu.length} more` : chosenInMenu.project}
        <span className="gaia-activity-menu-mark" aria-hidden="true">▾</span>
      </button>
      {menuIsOpen ? (
        <span className="gaia-activity-forge-menu" id={FORGE_MENU_ID} role="group" aria-label="More forges">
          {choices.inMenu.map((choice) => (
            <button
              key={choice.trackerId}
              type="button"
              className="gaia-activity-forge-menu-item"
              aria-pressed={choice.trackerId === choices.chosen}
              onClick={() => onForgeChoice(choice.trackerId)}
            >
              {choice.project}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

interface TodaySectionProps {
  readonly head: string;
  readonly list: TodayList;
  readonly tone: StateTone;
}

function TodaySection({ head, list, tone }: TodaySectionProps) {
  return (
    <section className="gaia-activity-side-section">
      <Text typeRole="micro" element="h2">{list.totalText === null ? head : `${head} · ${list.totalText}`}</Text>
      {list.rows.length === 0 ? <p className="gaia-activity-side-empty">{NOTHING_REPORTED_SENTENCE}</p> : (
        <ul className="gaia-activity-today-list">
          {list.rows.map((row) => (
            <li key={row.trackerId} className="gaia-activity-today-row">
              <span className="gaia-activity-today-project">{row.project}</span>
              <span className="gaia-activity-today-value">{row.valueText}</span>
              {row.meter === null ? null : (
                <span className="gaia-activity-today-meter">
                  <FillMeter label={row.meter.label} used={row.meter.used} limit={row.meter.whole} near={false} tone={tone} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UsageSection({ lines }: { readonly lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="gaia-activity-usage">
      <Text typeRole="micro" element="h2">Usage</Text>
      {lines.map((line) => <p key={line} className="gaia-activity-usage-line">{line}</p>)}
    </section>
  );
}

export function ActivityLayout({
  content, kindFilter, menuIsOpen, onKindFilter, onForgeChoice, onMenuToggle, onMenuClose
}: ActivityLayoutProps) {
  const { forgeChoices } = content;
  const forgeOptions = [
    { value: EVERY_FORGE_VALUE, label: 'All forges' },
    ...forgeChoices.segments.map((choice) => ({ value: choice.trackerId, label: choice.project })),
  ];
  return (
    <div className="gaia-activity">
      <section className="gaia-activity-entries" aria-label="Entries">
        <div className="gaia-activity-filters">
          <span className="gaia-visually-hidden" id={KIND_LABEL_ID}>Kind</span>
          <SegmentedControl<ActivityKindFilter> labelledBy={KIND_LABEL_ID} options={KIND_OPTIONS} selected={kindFilter} onSelect={onKindFilter} />
          <span className="gaia-activity-forge-filter">
            <span className="gaia-visually-hidden" id={FORGE_LABEL_ID}>Forge</span>
            <SegmentedControl
              labelledBy={FORGE_LABEL_ID}
              options={forgeOptions}
              selected={forgeChoices.chosen ?? EVERY_FORGE_VALUE}
              onSelect={(value) => onForgeChoice(value === EVERY_FORGE_VALUE ? null : value)}
            />
            <ForgeMenu choices={forgeChoices} menuIsOpen={menuIsOpen} onForgeChoice={onForgeChoice} onMenuToggle={onMenuToggle} onMenuClose={onMenuClose} />
          </span>
        </div>
        {content.emptySentence === null
          ? <DataTable label="Activity" columns={COLUMNS} columnWidths={COLUMN_WIDTHS} rows={tableRowsOf(content.rows)} />
          : <p className="gaia-activity-empty">{content.emptySentence}</p>}
        <p className="gaia-activity-footnote">{FOOTNOTE}</p>
      </section>
      <aside className="gaia-activity-side" aria-label="Today">
        <TodaySection head="Landed today" list={content.landedToday} tone="success" />
        <TodaySection head="Tokens today" list={content.tokensToday} tone="neutral" />
        <UsageSection lines={content.usageLines} />
      </aside>
    </div>
  );
}

export interface ActivityViewProps {
  readonly fleetDocument: FleetDocument;
  /** The time zone clock times are shown in; the page's own when absent. */
  readonly timeZone?:     string;
}

export function ActivityView({ fleetDocument, timeZone }: ActivityViewProps) {
  const [filters, setFilters] = useState<ActivityFilters>(EVERY_ENTRY);
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const content = useMemo(() => ActivityModel.activityContentOf(fleetDocument, filters, timeZone), [fleetDocument, filters, timeZone]);
  return (
    <ActivityLayout
      content={content}
      kindFilter={filters.kind}
      menuIsOpen={menuIsOpen}
      onKindFilter={(kind) => setFilters((current) => ({ ...current, kind }))}
      onForgeChoice={(trackerId) => {
        setFilters((current) => ({ ...current, trackerId }));
        setMenuIsOpen(false);
      }}
      onMenuToggle={() => setMenuIsOpen((isOpen) => !isOpen)}
      onMenuClose={() => setMenuIsOpen(false)}
    />
  );
}
