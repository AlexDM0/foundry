/** What an option touches, trades off and does to the Acceptance, under the option: one row a fact, each path a mono chip. */
import { FactList }                                        from '../design-system/FactList.tsx';
import { OptionConsequencesUtil, type OptionConsequences } from './OptionConsequencesUtil.ts';

export function OptionConsequenceFacts({ consequences }: { readonly consequences: OptionConsequences }) {
  const facts = OptionConsequencesUtil.factLinesOf(consequences).map((line) => ({
    label: line.label,
    value: 'paths' in line
      ? line.paths.map((path, position) => (
        <span key={path}>
          {position === 0 ? null : ' '}
          <span className="bridge-path">{path}</span>
        </span>
      ))
      : line.text,
  }));
  return <FactList facts={facts} layout="table" />;
}
