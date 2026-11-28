/**
 * `constitution-sources.json` beside `pipeline.json`: the pipeline agent's sources of the constitution main holds, keyed by that text's
 * blob id, so a record takes them only for that very text. Read, validated and mapped here, and written through the hold. A file the read cannot
 * map whole is `malformed` with the problem, never a throw. Keys this build does not know are kept at the top level, after its own, in
 * their stored order, so a read and a write leave the file byte-identical.
 */
import type { ConstitutionSourcesReading, SourceAnnotation, StoredConstitutionSources } from '../../domain/tracker-model/@types/PipelineSetup.ts';
import type { ConstitutionSourcesProblem }                                              from '../../domain/tracker-model/@types/PipelineSetupProblem.ts';
import { JsonRecordUtil }                                                               from '../../lib/json-record/JsonRecordUtil.ts';
import { JsonTextUtil }                                                                 from '../../shared/utils/JsonTextUtil.ts';
import { storedFileTextOf }                                                             from '../StoredFileText.ts';
import { StoredValueUtil }                                                              from '../utils/StoredValueUtil.ts';
import { PipelineSetupFile }                                                            from './PipelineSetupFile.ts';

const SOURCES_FORMAT_VERSION = 1;

const OWNED_KEYS: readonly string[] = ['formatVersion', 'blob', 'annotations'];

function annotationsOf(value: unknown): { annotations: SourceAnnotation[] } | { problem: ConstitutionSourcesProblem } {
  if (!Array.isArray(value)) return { problem: { code: 'not-a-list', field: 'annotations' } };
  const annotations: SourceAnnotation[] = [];
  for (const [index, item] of value.entries()) {
    const mapped = PipelineSetupFile.annotationOf(item, `annotations[${index}]`);
    if ('problem' in mapped) return mapped;
    annotations.push(mapped.value);
  }
  return { annotations };
}

function documentReadingOf(document: unknown): ConstitutionSourcesReading {
  if (!JsonRecordUtil.valueIsAPlainObject(document)) return { verdict: 'malformed', problem: { code: 'not-a-json-object' } };
  const { formatVersion, blob } = document;
  if (formatVersion !== SOURCES_FORMAT_VERSION) {
    return {
      verdict: 'malformed',
      problem: {
        code: 'format-version-not-read', field: 'formatVersion', storedValue: formatVersion, readVersion: SOURCES_FORMAT_VERSION
      }
    };
  }
  if (typeof blob !== 'string' || blob === '') return { verdict: 'malformed', problem: { code: 'not-a-blob-id', field: 'blob' } };
  const mapped = annotationsOf(document['annotations']);
  if ('problem' in mapped) return { verdict: 'malformed', problem: mapped.problem };
  const extra = Object.entries(document).filter(([key]) => !OWNED_KEYS.includes(key));
  return {
    verdict: 'readable',
    sources: {
      formatVersion: SOURCES_FORMAT_VERSION, blob, annotations: mapped.annotations, extra
    },
  };
}

function read(sourcesFilePath: string): ConstitutionSourcesReading {
  const storedText = storedFileTextOf(sourcesFilePath);
  if (storedText.verdict === 'absent') return storedText;
  if (storedText.verdict === 'unreadable') return { verdict: 'malformed', problem: storedText.problem };
  const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', problem: parsedJson.problem };
  return documentReadingOf(parsedJson.value);
}

/** The owned keys, each annotation's four keys in the order the setup record writes them, then every key this build does not know. */
function contentsOf(sources: Readonly<StoredConstitutionSources>): string {
  // `fromEntries` makes every stored key an own property, so a stored `__proto__` stays data instead of setting the prototype.
  return JsonTextUtil.storedFileTextOf(Object.fromEntries([
    ['formatVersion', SOURCES_FORMAT_VERSION],
    ['blob', sources.blob],
    ['annotations', sources.annotations.map((annotation) => ({
      lineText: annotation.lineText, occurrence: annotation.occurrence, kind: annotation.kind, path: annotation.path
    }))],
    ...sources.extra,
  ]));
}

export const ConstitutionSourcesFile = Object.freeze({ read, contentsOf });
