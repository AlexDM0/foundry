/**
 * What every form of the detail panel draws with, as the static panel draws it: a stamp short with the full stamp on hover, a section
 * under its small-capitals title, the facts line, and a link that opens another detail over the tab the panel is on.
 */
import { Fragment, type ReactNode } from 'react';

import { EpicChips }        from '../../chips/EpicChips.tsx';
import { DetailRoute }      from '../../shell/DetailRoute.ts';
import { useDetailRouting } from '../../shell/DetailRouting.ts';
import { HashRouter }       from '../../shell/HashRouter.ts';
import type {
  DetailFactModel,
  DetailLinkModel,
  IntegrationModel,
  StampModel
} from './DetailFactsModel.ts';

export function Stamp({ stamp, element = 'span' }: { readonly stamp: StampModel; readonly element?: 'span' | 'time' }) {
  return element === 'time'
    ? <time title={stamp.fullText}>{stamp.shortText}</time>
    : <span title={stamp.fullText}>{stamp.shortText}</span>;
}

export function DetailSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="bridge-detail-section" aria-label={title}>
      <h3 className="bridge-detail-section-title">{title}</h3>
      {children}
    </section>
  );
}

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
      return <Stamp stamp={fact.stamp} />;
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
  if (facts.length === 0) return null;
  return (
    <dl className="bridge-detail-facts">
      {facts.map((fact) => (
        <div key={fact.label} className="bridge-detail-fact">
          <dt>{fact.label}</dt>
          <dd><FactValue fact={fact} /></dd>
        </div>
      ))}
    </dl>
  );
}
