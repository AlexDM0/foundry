/**
 * The forge level's entities as a table: each row names the entity in mono with its kind, its home folders, its gates, its constitution and
 * its open questions, and the entity's name links to its level.
 */
import type { ReactNode } from 'react';
import {
  DataTable,
  MonoId,
  Tag,
  Text
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CountTextUtil }                                      from '../../../../shared/utils/CountTextUtil.ts';
import { EntityOverviewTableModel, type EntityOverviewFacts } from './EntityOverviewTableModel.ts';

type EntityOverviewColumn = 'entity' | 'home' | 'gates' | 'constitution';

export interface EntityOverviewTableProps {
  readonly facts:  EntityOverviewFacts;
  /** Where an entity's level opens. */
  readonly hrefOf: (entityKey: string) => string;
}

const COLUMNS = [
  { key: 'entity', label: 'Entity' },
  { key: 'home', label: 'Home' },
  { key: 'gates', label: 'Gates' },
  { key: 'constitution', label: 'Constitution' },
] as const;

const COLUMN_WIDTHS = 'minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 0.8fr) minmax(0, 1fr)';

export function EntityOverviewTable({ facts, hrefOf }: EntityOverviewTableProps) {
  const rows = EntityOverviewTableModel.rowsOf(facts).map((row) => ({
    key:         row.entityKey,
    interactive: true,
    cells:       {
      entity: (
        <span className="board-entity-overview-name">
          <a className="board-entity-overview-link" href={hrefOf(row.entityKey)} aria-label={`Open ${row.entityKey}`}>
            <MonoId text={row.entityKey} tone="link" weight="medium" />
          </a>
          <Text typeRole="small" subtle>{row.kindText}</Text>
          {row.openQuestionCount === 0
            ? null
            : <Tag text={CountTextUtil.countedPhrase(row.openQuestionCount, 'question', 'questions')} tone="warn" />}
        </span>
      ),
      home:         <Text typeRole="small" mono muted>{row.homeText}</Text>,
      gates:        <Text muted={!row.hasGates}>{row.gatesText}</Text>,
      constitution: <Text muted={row.constitutionState === 'default' || row.constitutionState === 'kept-for-a-person'}>{row.constitutionText}</Text>,
    } satisfies Record<EntityOverviewColumn, ReactNode>,
  }));
  return <DataTable label="Entities" columns={COLUMNS} columnWidths={COLUMN_WIDTHS} rows={rows} />;
}
