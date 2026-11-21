/** What an option touches, trades off and does to the Acceptance, under the option: one row a fact, each path a mono chip. */
import { FactList } from 'design-system/FactList';

import { OptionConsequencesUtil, type OptionConsequences, type OptionFact } from './OptionConsequencesUtil.ts';

const FACT_LABEL: Readonly<Record<OptionFact, string>> = { touches: 'Touches', tradeOff: 'Trade-off', acceptanceEffect: 'Acceptance' };

export function OptionConsequenceFacts({ consequences }: { readonly consequences: OptionConsequences }) {
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
