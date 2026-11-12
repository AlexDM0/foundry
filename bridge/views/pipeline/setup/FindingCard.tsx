/**
 * One topic of the research as a card: its title after a done check, the source paths its findings came from, and its findings: the stack
 * as chips that pop in as they come, every other topic as lines with their own source paths. A finding to recheck carries an amber tag.
 */
import { Tag } from '../../../design-system/Tag.tsx';

import type { FindingItem, FindingSection } from './ResearchStepModel.ts';

const RECHECK_TEXT = 'recheck';

function RecheckTag({ item }: { readonly item: FindingItem }) {
  return item.recheck ? <Tag text={RECHECK_TEXT} tone="neutral" change="changed" /> : null;
}

function StackChips({ items }: { readonly items: readonly FindingItem[] }) {
  return (
    <ul className="bridge-pipeline-research-chips">
      {items.map((item) => (
        <li key={item.findingId} className="bridge-pipeline-research-chip">
          <Tag text={item.value === null ? item.label : `${item.label} · ${item.value}`} tone="neutral" pops title={item.sourcePaths.join(', ')} />
          <RecheckTag item={item} />
        </li>
      ))}
    </ul>
  );
}

function FindingLines({ items }: { readonly items: readonly FindingItem[] }) {
  return (
    <ul className="bridge-pipeline-research-lines">
      {items.map((item) => (
        <li key={item.findingId} className="bridge-pipeline-research-line">
          <b className="bridge-pipeline-research-label">{item.label}</b>
          {item.value === null ? null : <span className="bridge-pipeline-research-value">{item.value}</span>}
          {item.sourcePaths.length === 0 ? null : <span className="bridge-pipeline-research-paths">{item.sourcePaths.join(', ')}</span>}
          <RecheckTag item={item} />
        </li>
      ))}
    </ul>
  );
}

export function FindingCard({ section }: { readonly section: FindingSection }) {
  return (
    <section className="bridge-pipeline-research-card" aria-label={section.title} data-topic={section.topic}>
      <h3 className="bridge-pipeline-research-card-head">
        <svg className="bridge-pipeline-research-check" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.5L5 9l5-6" />
        </svg>
        <span className="bridge-pipeline-research-card-title">{section.title}</span>
        {section.sourcePaths.length === 0 ? null : <span className="bridge-pipeline-research-source">{section.sourcePaths.join(', ')}</span>}
      </h3>
      {section.topic === 'stack' ? <StackChips items={section.items} /> : <FindingLines items={section.items} />}
    </section>
  );
}
