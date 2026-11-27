/**
 * What an option touches, trades off and does to the Acceptance, under the option. `table` gives each fact a row, each path a mono chip;
 * `lines` one short muted line each, led by the recommendation's mark, for a card too narrow for a mark column or a fact table.
 */
import { ChoiceMark, FactList } from '../../lib/design-system/DesignSystemInterface.ts';

import { OptionConsequencesUtil, type OptionConsequences, type OptionFact } from './OptionConsequencesUtil.ts';

export type OptionFactsLayout = 'table' | 'lines';

const FACT_LABEL: Readonly<Record<OptionFact, string>> = { touches: 'Touches', tradeOff: 'Trade-off', acceptanceEffect: 'Acceptance' };

function OptionFactTable({ consequences }: { readonly consequences: OptionConsequences }) {
  const facts = OptionConsequencesUtil.factLinesOf(consequences).map((line) => ({
    label: FACT_LABEL[line.fact],
    value: 'paths' in line
      ? line.paths.map((path, position) => (
        <span key={path}>
          {position === 0 ? null : ' '}
          <span className="board-path">{path}</span>
        </span>
      ))
      : line.text,
  }));
  return <FactList facts={facts} layout="table" />;
}

function OptionFactLines({ consequences, recommended }: { readonly consequences: OptionConsequences | null; readonly recommended: boolean }) {
  return (
    <span className="board-option-fact-lines">
      {recommended ? <ChoiceMark mark="recommended" text="Recommended" /> : null}
      {(consequences === null ? [] : OptionConsequencesUtil.factLinesOf(consequences)).map((line) => {
        switch (line.fact) {
          case 'touches':
            return (
              <span key={line.fact}>
                {'Touches '}
                {line.paths.map((path, position) => (
                  <span key={path}>
                    {position === 0 ? null : ', '}
                    <span className="board-option-fact-path">{path}</span>
                  </span>
                ))}
              </span>
            );
          case 'tradeOff':
            return <span key={line.fact}>{`Trade-off: ${line.text}`}</span>;
          case 'acceptanceEffect':
            return <span key={line.fact}>{line.text}</span>;
        }
      })}
    </span>
  );
}

export interface OptionConsequenceFactsProps {
  readonly consequences: OptionConsequences | null;
  readonly layout:       OptionFactsLayout;
  /** Lines lead with the recommendation's mark; a table leaves it to the option's mark column. */
  readonly recommended:  boolean;
}

export function OptionConsequenceFacts({ consequences, layout, recommended }: OptionConsequenceFactsProps) {
  if (layout === 'lines') return <OptionFactLines consequences={consequences} recommended={recommended} />;
  return consequences === null ? null : <OptionFactTable consequences={consequences} />;
}
