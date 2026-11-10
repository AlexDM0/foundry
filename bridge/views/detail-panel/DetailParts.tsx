/**
 * What every form of the detail panel draws with: the note line, the facts (one wrapping line, or the ticket form's grid with second lines),
 * a link that opens another detail over the tab the panel is on, worded parts, and the log lines.
 */
import { Fragment, type ReactNode } from 'react';

import { EpicChips }        from '../../chips/EpicChips.tsx';
import { FactList }         from '../../design-system/FactList.tsx';
import { Stamp }            from '../../design-system/Stamp.tsx';
import { DetailRoute }      from '../../shell/DetailRoute.ts';
import { useDetailRouting } from '../../shell/DetailRouting.ts';
import { HashRouter }       from '../../shell/HashRouter.ts';
import type {
  DetailFactModel,
  DetailLinkModel,
  IntegrationModel,
  LogLineModel
} from './DetailFactsModel.ts';
import type { TextPartModel } from './TicketOverviewModel.ts';

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

/** The row form's one line: `lands together on group-x, released with #N`, `…, no release ticket yet`, or `releases group-x with #A, #B`. */
function InlineIntegration({ integration }: { readonly integration: IntegrationModel }) {
  const { branch, relation, links } = integration;
  let between = ', no release ticket yet';
  if (relation === 'releases') between = ' with ';
  else if (links.length > 0) between = ', released with ';
  return (
    <span className="bridge-integration">
      {relation === 'releases' ? 'releases ' : 'lands together on '}
      <span className="bridge-integration-branch">{branch}</span>
      {between}
      <DetailLinks links={links} />
    </span>
  );
}

/** The grid's second line under the branch: `lands together, no release ticket yet`, `lands together, released with #N` or `releases it with #A, #B`. */
function IntegrationRelation({ integration }: { readonly integration: IntegrationModel }) {
  const { relation, links } = integration;
  if (relation === 'releases') return <>releases it with <DetailLinks links={links} /></>;
  if (links.length === 0) return <>lands together, no release ticket yet</>;
  return <>lands together, released with <DetailLinks links={links} /></>;
}

type FactLayout = 'inline' | 'grid';

function FactValue({ fact, layout }: { readonly fact: DetailFactModel; readonly layout: FactLayout }) {
  switch (fact.kind) {
    case 'stamp':
      return <Stamp shortText={fact.stamp.shortText} fullText={fact.stamp.fullText} />;
    case 'links':
      return layout === 'grid' ? <span className="bridge-detail-figure"><DetailLinks links={fact.links} /></span> : <DetailLinks links={fact.links} />;
    case 'epics':
      return <EpicChips epics={fact.epics} />;
    case 'integration':
      return layout === 'grid' ? <span className="bridge-detail-figure">{fact.integration.branch}</span> : <InlineIntegration integration={fact.integration} />;
    default:
      if (layout === 'grid' && fact.figure === true) return <span className="bridge-detail-figure" title={fact.title}>{fact.text}</span>;
      return fact.title === undefined ? <>{fact.text}</> : <span title={fact.title}>{fact.text}</span>;
  }
}

function secondaryOf(fact: DetailFactModel): ReactNode {
  if (fact.kind === 'integration') return <IntegrationRelation integration={fact.integration} />;
  return fact.secondaryText;
}

/** `inline` the row and draft forms' wrapping line; `grid` the ticket form's two columns, each value with its second line under it. */
export function DetailFacts({ facts, layout = 'inline' }: { readonly facts: readonly DetailFactModel[]; readonly layout?: FactLayout }) {
  return (
    <FactList
      facts={facts.map((fact) => {
        const sub = layout === 'grid' ? secondaryOf(fact) : undefined;
        return { label: fact.label, value: <FactValue fact={fact} layout={layout} />, ...(sub === undefined ? {} : { sub }) };
      })}
      layout={layout}
    />
  );
}

/** Text with its figures in the mono face, its ticket id in bold and its ticket links opening their ticket form over the same tab. */
export function TextParts({ parts }: { readonly parts: readonly TextPartModel[] }) {
  return (
    <>
      {parts.map((part, index) => {
        const key = String(index);
        switch (part.kind) {
          case 'figure':
            return <span key={key} className="bridge-detail-figure">{part.text}</span>;
          case 'emphasis':
            return <b key={key} className="bridge-detail-figure">{part.text}</b>;
          case 'link':
            return <DetailLinks key={key} links={[part.link]} />;
          default:
            return <Fragment key={key}>{part.text}</Fragment>;
        }
      })}
    </>
  );
}

/** Log lines newest first, each its short stamp (full on hover) and its text; with none, the note saying so. */
export function LogLines({ lines, emptyNote }: { readonly lines: readonly LogLineModel[]; readonly emptyNote: string }) {
  if (lines.length === 0) return <DetailNote text={emptyNote} />;
  return (
    <ul className="bridge-detail-log">
      {lines.map((line) => (
        <li key={line.key}>
          <Stamp shortText={line.stamp.shortText} fullText={line.stamp.fullText} element="time" />
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
