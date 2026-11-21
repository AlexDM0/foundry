/**
 * One topic of the research as a card: its title after a done check, how many it found and the source paths its findings came from, and
 * its findings: the stack as chips that pop in as they come, every other topic as lines with their own source paths. A finding to recheck
 * carries its tag.
 */
import { Tag } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { FlowGlyph }                        from '../flow/FlowGlyph.tsx';
import type { FindingItem, FindingSection } from './ResearchStepModel.ts';

const RECHECK_TEXT = 'recheck';

function RecheckTag({ item }: { readonly item: FindingItem }) {
  return item.recheck ? <Tag text={RECHECK_TEXT} tone="neutral" change="changed" /> : null;
}

function StackChips({ items }: { readonly items: readonly FindingItem[] }) {
  return (
    <ul className="board-pipeline-research-chips">
      {items.map((item) => (
        <li key={item.findingId} className="board-pipeline-research-chip">
          <Tag text={item.value === null ? item.label : `${item.label} · ${item.value}`} tone="neutral" pops title={item.sourcePaths.join(', ')} />
          <RecheckTag item={item} />
        </li>
      ))}
    </ul>
  );
}

function FindingLines({ items }: { readonly items: readonly FindingItem[] }) {
  return (
    <ul className="board-pipeline-research-lines">
      {items.map((item) => (
        <li key={item.findingId} className="board-pipeline-research-line">
          <b className="board-pipeline-research-label">{item.label}</b>
          {item.value === null ? null : <span className="board-pipeline-research-value">{item.value}</span>}
          {item.sourcePaths.length === 0 ? null : <span className="board-pipeline-research-paths">{item.sourcePaths.join(', ')}</span>}
          <RecheckTag item={item} />
        </li>
      ))}
    </ul>
  );
}

export function FindingCard({ section }: { readonly section: FindingSection }) {
  return (
    <section className="board-pipeline-research-card" aria-label={section.title} data-topic={section.topic}>
      <h3 className="board-pipeline-research-card-head">
        <span className="board-pipeline-research-check"><FlowGlyph glyph="check" /></span>
        <span className="board-pipeline-research-card-title">{section.title}</span>
        <span className="board-pipeline-research-count">{`${section.items.length} found`}</span>
        {section.sourcePaths.length === 0 ? null : <span className="board-pipeline-research-source">{section.sourcePaths.join(' · ')}</span>}
      </h3>
      {section.topic === 'stack' ? <StackChips items={section.items} /> : <FindingLines items={section.items} />}
    </section>
  );
}
