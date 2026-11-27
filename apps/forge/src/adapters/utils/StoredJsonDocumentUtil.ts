/**
 * The first steps of every versioned JSON format forge stores for itself: the text, a JSON object, its version. A format's ingestion class
 * validates and maps what is left. Before 1.0 a document of another version, or of none, is unreadable: nothing migrates. A lock or slot
 * record is no stored data but a holding by the process it names, so its version is not consulted: its fields decide.
 */
import { JsonRecordUtil }   from '../../lib/json-record/JsonRecordUtil.ts';
import { storedFileTextOf } from '../StoredFileText.ts';
import { StoredValueUtil }  from './StoredValueUtil.ts';

export type StoredJsonDocument =
  | { verdict: 'readable'; document: Readonly<Record<string, unknown>> }
  | { verdict: 'unreadable'; reason: string };

export type StoredJsonFileDocument = StoredJsonDocument | { verdict: 'absent' };

export const STORED_VERSION_KEY = 'version';

/** A lock or slot record's text as a JSON object, whatever version it was written with. */
function holdingDocumentOfText(text: string): StoredJsonDocument {
  const parsedJson = StoredValueUtil.parsedJsonOf(text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'unreadable', reason: parsedJson.problem };
  if (!JsonRecordUtil.valueIsAPlainObject(parsedJson.value)) return { verdict: 'unreadable', reason: 'it is not a JSON object' };
  return { verdict: 'readable', document: parsedJson.value };
}

/** A stored text as a JSON object of `version`, its version under `versionKey`. */
function documentOfText(text: string, version: number, versionKey = STORED_VERSION_KEY): StoredJsonDocument {
  const parsedDocument = holdingDocumentOfText(text);
  if (parsedDocument.verdict === 'unreadable') return parsedDocument;
  if (parsedDocument.document[versionKey] !== version) return { verdict: 'unreadable', reason: `its ${versionKey} is not ${version}` };
  return parsedDocument;
}

/** Never throws: a file that exists but cannot be read whole is `unreadable`, never `absent`. */
function documentAt(filePath: string, version: number, versionKey = STORED_VERSION_KEY): StoredJsonFileDocument {
  const storedText = storedFileTextOf(filePath);
  if (storedText.verdict !== 'readable') return storedText;
  return documentOfText(storedText.text, version, versionKey);
}

/** Never throws, as `documentAt`. */
function holdingDocumentAt(filePath: string): StoredJsonFileDocument {
  const storedText = storedFileTextOf(filePath);
  if (storedText.verdict !== 'readable') return storedText;
  return holdingDocumentOfText(storedText.text);
}

export const StoredJsonDocumentUtil = {
  documentOfText, documentAt, holdingDocumentOfText, holdingDocumentAt
} as const;
