/**
 * What every form of the detail panel draws with: the note line, the facts line, and a link that opens another detail over the tab the
 * panel is on.
 */
import { Fragment } from 'react';

import { EpicChips }                                               from '../../chips/EpicChips.tsx';
import { FactList }                                                from '../../design-system/FactList.tsx';
import { Stamp }                                                   from '../../design-system/Stamp.tsx';
import { DetailRoute }                                             from '../../shell/DetailRoute.ts';
import { useDetailRouting }                                        from '../../shell/DetailRouting.ts';
import { HashRouter }                                              from '../../shell/HashRouter.ts';
import type { DetailFactModel, DetailLinkModel, IntegrationModel } from './DetailFactsModel.ts';

export function DetailNote({ text }: { readonly text: string }) {
  return <p className="bridge-detail-note">{text}</p>;
}

export function DetailLinks({ links }: { readonly links: readonly DetailLinkModel[] }) {
  const { tab } = useDetailRouting();
  return (
    <>
      {links.map((link, position) => (
        <Fragment key={link.text}>
          {position === 0 ? null : ', '}
          <a href={HashRouter.fragmentOf({ tab, item: DetailRoute.itemTextOf(link.item) })}>{link.text}</a>
        </Fragment>
      ))}
    </>
  );
}

function Integration({ integration }: { readonly integration: IntegrationModel }) {
  return (
    <span className="bridge-integration">
      {integration.lead}
      <span className="bridge-integration-branch">{integration.branch}</span>
      {integration.between}
      <DetailLinks links={integration.links} />
    </span>
  );
}

function FactValue({ fact }: { readonly fact: DetailFactModel }) {
  switch (fact.kind) {
    case 'stamp':
      return <Stamp shortText={fact.stamp.shortText} fullText={fact.stamp.fullText} />;
    case 'links':
      return <DetailLinks links={fact.links} />;
    case 'epics':
      return <EpicChips epics={fact.epics} />;
    case 'integration':
      return <Integration integration={fact.integration} />;
    default:
      return fact.title === undefined ? <>{fact.text}</> : <span title={fact.title}>{fact.text}</span>;
  }
}

export function DetailFacts({ facts }: { readonly facts: readonly DetailFactModel[] }) {
  return <FactList facts={facts.map((fact) => ({ label: fact.label, value: <FactValue fact={fact} /> }))} layout="inline" />;
}
