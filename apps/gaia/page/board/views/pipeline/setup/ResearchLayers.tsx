/**
 * The research as one card of layers in research order, each collapsed to its marker, name and progress: a dashed ring while not reached, a
 * pulsing dot while read, a check once found. A layer with findings opens on demand to its lines, or the scripts' table; source paths show
 * on hover only.
 */
import { Tag } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { FlowGlyph }                                  from '../flow/FlowGlyph.tsx';
import type { FindingItem, ResearchLayer, ScriptRow } from './ResearchStepModel.ts';
import { ScriptRows }                                 from './ScriptRows.tsx';

const RECHECK_TEXT = 'recheck';

function RecheckTag({ recheck }: { readonly recheck: boolean }) {
  return recheck ? <Tag text={RECHECK_TEXT} tone="neutral" change="changed" /> : null;
}

function FindingLines({ items }: { readonly items: readonly FindingItem[] }) {
  return (
    <ul className="board-pipeline-research-lines">
      {items.map((item) => (
        <li key={item.findingId} className="board-pipeline-research-line" title={item.sourcePaths.join(', ')}>
          <b className="board-pipeline-research-label">{item.label}</b>
          {item.value === null ? null : <span className="board-pipeline-research-value">{item.value}</span>}
          <RecheckTag recheck={item.recheck} />
        </li>
      ))}
    </ul>
  );
}

function LayerMarker({ layer }: { readonly layer: ResearchLayer }) {
  return (
    <span className="board-pipeline-research-layer-marker" aria-hidden="true">
      {layer.progress === 'found' ? <FlowGlyph glyph="check" /> : <span className="board-pipeline-research-layer-mark" />}
    </span>
  );
}

function LayerHeadContent({ layer }: { readonly layer: ResearchLayer }) {
  return (
    <>
      <LayerMarker layer={layer} />
      <h3 className="board-pipeline-research-layer-title">{layer.title}</h3>
      <span className="board-pipeline-research-layer-progress">{layer.progressText}</span>
    </>
  );
}

function LayerBody({ layer, scriptRows }: { readonly layer: ResearchLayer; readonly scriptRows: readonly ScriptRow[] }) {
  return (
    <div className="board-pipeline-research-layer-body">
      {layer.topic === 'scripts' ? <ScriptRows rows={scriptRows} /> : <FindingLines items={layer.items} />}
    </div>
  );
}

function hasFindings(layer: ResearchLayer, scriptRows: readonly ScriptRow[]): boolean {
  return layer.topic === 'scripts' ? scriptRows.length > 0 : layer.items.length > 0;
}

function LayerRow({ layer, scriptRows }: { readonly layer: ResearchLayer; readonly scriptRows: readonly ScriptRow[] }) {
  return (
    <section className="board-pipeline-research-layer" aria-label={layer.title} data-topic={layer.topic} data-progress={layer.progress}>
      {hasFindings(layer, scriptRows)
        ? (
          <details className="board-pipeline-research-layer-fold">
            <summary className="board-pipeline-research-layer-head" title={layer.sourcePaths.join(' · ')}>
              <LayerHeadContent layer={layer} />
              <span className="board-pipeline-research-layer-chevron" aria-hidden="true"><FlowGlyph glyph="chevron" /></span>
            </summary>
            <LayerBody layer={layer} scriptRows={scriptRows} />
          </details>
        )
        : <div className="board-pipeline-research-layer-head"><LayerHeadContent layer={layer} /></div>}
    </section>
  );
}

export function ResearchLayers({ layers, scriptRows }: { readonly layers: readonly ResearchLayer[]; readonly scriptRows: readonly ScriptRow[] }) {
  return (
    <ol className="board-pipeline-research-layers" aria-label="Research layers">
      {layers.map((layer) => <li key={layer.topic}><LayerRow layer={layer} scriptRows={scriptRows} /></li>)}
    </ol>
  );
}
