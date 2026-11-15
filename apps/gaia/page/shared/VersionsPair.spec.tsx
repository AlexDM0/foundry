/**
 * The versions pair and the text around a version. What matters: the pair names the forge, then this Gaia, then the verdict above its rule
 * with its mark, word and reason; every version number stands in mono in ink, or in the colour of its line where the line asks for it; and
 * the words around a number read on as one sentence.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree }                        from '../testing/ReactElementTree.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_READINGS } from '../testing/fixtures/fleet-versions.ts';
import { VersionsPair }                            from './VersionsPair.tsx';
import { VersionsLine, VersionsText }              from './VersionsText.tsx';
import { ForgeVersionsTextUtil }                   from './utils/ForgeVersionsTextUtil.ts';

const BILLING = FLEET_VERSIONS_READINGS.exampleBilling;

function pairOfBilling() {
  if (BILLING.versions === null) throw new Error('The fixture reads Example Billing without its versions.');
  return ForgeVersionsTextUtil.pairTextOf({ project: BILLING.project, versions: BILLING.versions }, FLEET_VERSIONS.gaia.versions);
}

describe('the versions pair', () => {
  test('names the forge, this Gaia and the verdict, each beside its line', () => {
    const nodes = ReactElementTree.unfolded(<VersionsPair pair={pairOfBilling()} />);
    const names = ReactElementTree.hostElementsIn(nodes, ReactElementTree.withClass('gaia-versions-pair-name'));
    const values = ReactElementTree.hostElementsIn(nodes, ReactElementTree.withClass('gaia-versions-pair-value'));
    expect(names.map((name) => [name.tag, ReactElementTree.textOf([name])])).toEqual([['dt', 'Example Billing'], ['dt', 'This Gaia'], ['dt', 'Verdict']]);
    expect(values.map((value) => ReactElementTree.textOf([value]))).toEqual([
      'forge 1.8 · serves clients built for forge 1.0 and later',
      'version 1.4 · built for forge 3.1',
      'Older than this Gaia · 1.8 is below 3.1, the forge this Gaia is built for',
    ]);
  });

  test('sets the verdict row above its rule, with the verdict\'s own label', () => {
    const nodes = ReactElementTree.unfolded(<VersionsPair pair={pairOfBilling()} />);
    const verdictRow = ReactElementTree.hostElementsIn(nodes, (element) => element.props['data-verdict-row'] === '');
    expect(verdictRow.map((element) => element.tag)).toEqual(['dt', 'dd']);
    expect(ReactElementTree.onlyWithClass(nodes, 'gaia-versions-verdict').props['data-verdict']).toBe('older');
  });
});

describe('a text about versions', () => {
  test('sets each version number apart in mono and in ink, and the words around it as they are', () => {
    const nodes = ReactElementTree.unfolded(<VersionsLine text={pairOfBilling().gaiaText} />);
    const numbers = ReactElementTree.hostElementsIn(nodes, ReactElementTree.withClass('gaia-version-number'));
    expect(numbers.map((number) => [ReactElementTree.textOf([number]), number.props['data-ink']])).toEqual([['1.4', undefined], ['3.1', undefined]]);
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(nodes, 'gaia-versions-line')])).toBe('version 1.4 · built for forge 3.1');
  });

  test('sets a number in the colour of its line where the line asks for it', () => {
    const nodes = ReactElementTree.unfolded(<VersionsText text={pairOfBilling().forgeText} numberInk="inherit" />);
    expect(ReactElementTree.hostElementsIn(nodes, ReactElementTree.withClass('gaia-version-number')).map((number) => number.props['data-ink'])).toEqual(['inherit', 'inherit']);
  });
});
