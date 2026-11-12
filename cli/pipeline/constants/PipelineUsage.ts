/**
 * The usage line of each `pipeline` verb, which its refusals print and the set's own usage joins. The pipeline agent's verbs are relayed
 * under its job, where they name no setup record; help does not list them, its prompt does.
 */
import { PRODUCT_NAMES } from '../../../src/shared/constants/ProductNames.ts';

const { PROGRAM } = PRODUCT_NAMES;

export const PIPELINE_USAGE = {
  setup:        `${PROGRAM} pipeline setup [--billing subscription|api] [--max-budget-usd <n>] [--replace-unreadable] [--json]`,
  billing:      `${PROGRAM} pipeline billing <S> subscription|api [--max-budget-usd <n>] [--json]`,
  continue:     `${PROGRAM} pipeline continue <S> billing|research|constitution|design [--json]`,
  'start-over': `${PROGRAM} pipeline start-over <S> [--json]`,
  answer:       `${PROGRAM} pipeline answer <S> <Q> <letters>... | -- <text> [--json]`,
  constitution: `${PROGRAM} pipeline constitution <S> --revision <n> [--file <path>|-] [--sources <source>,…|none] [--json]`,
  update:       `${PROGRAM} pipeline update [--json]`,
  edit:         `${PROGRAM} pipeline edit <S> --revision <n> --set <field>=<JSON value>... [--json]`,
  undo:         `${PROGRAM} pipeline undo <S> <E> [--json]`,
  discard:      `${PROGRAM} pipeline discard <S> [--json]`,
} as const;

export const PIPELINE_AGENT_USAGE = {
  'finding':            `${PROGRAM} pipeline finding [<S>] (-- <json> | --file <path>|-) [--json]`,
  'ask':                `${PROGRAM} pipeline ask [<S>] (-- <json> | --file <path>|-) [--json]`,
  'draft-constitution': `${PROGRAM} pipeline draft-constitution [<S>] (-- <json> | --file <path>|-) [--json]`,
  'propose':            `${PROGRAM} pipeline propose [<S>] (-- <json> | --file <path>|-) [--json]`,
  'ready':              `${PROGRAM} pipeline ready [<S>] research|constitution|design [--json]`,
} as const;
