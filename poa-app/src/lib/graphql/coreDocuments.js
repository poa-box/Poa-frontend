import { gql } from '@apollo/client';
import { Kind, parse, print } from 'graphql';

// Apollo owns these documents and their cache lifetimes. Only host variable names,
// pagination windows and presentation extensions are adapted here.
const operationOf = (document) => document.definitions.find((node) => node.kind === Kind.OPERATION_DEFINITION);
const selectionOf = (document, path) => {
  const parsed = typeof document === 'string' ? parse(document) : document;
  let node = operationOf(parsed) || parsed.definitions.find((definition) => definition.kind === Kind.FRAGMENT_DEFINITION);
  for (const name of path ? path.split('.') : []) {
    node = node?.selectionSet?.selections.find((field) => field.name?.value === name);
  }
  if (!node?.selectionSet) throw new Error(`Core document has no selection: ${path}`);
  return node.selectionSet;
};

/** Reuse canonical fields under an existing host response shape. */
export function coreFields(document, path, { omit = [], only } = {}) {
  const selection = selectionOf(document, path);
  const missing = (only || []).filter((name) => !selection.selections.some((field) => field.name?.value === name));
  if (missing.length) throw new Error(`Core selection ${path} lacks fields: ${missing.join(', ')}`);
  return print({
    ...selection,
    selections: selection.selections.filter((field) => !omit.includes(field.name.value)
      && (!only || only.includes(field.name.value))),
  }).slice(1, -1);
}

/** Small AST adapter: never rewrite scalar names or filters by textual substitution. */
export function coreDocument(document, { name, variables, fields = {} } = {}) {
  const parsed = parse(document);
  const operation = operationOf(parsed);
  if (name) operation.name = { kind: Kind.NAME, value: name };
  if (variables !== undefined) operation.variableDefinitions = operationOf(parse(`query Adapter${variables ? `(${variables})` : ''} { __typename }`)).variableDefinitions;
  const walk = (selection, prefix = '') => {
    selection.selections = selection.selections.flatMap((field) => {
      const path = `${prefix}${field.name.value}`;
      const patch = fields[path];
      if (patch === false) return [];
      if (patch?.args !== undefined) {
        field.arguments = operationOf(parse(`{ field${patch.args ? `(${patch.args})` : ''} }`)).selectionSet.selections[0].arguments;
      }
      if (field.selectionSet) walk(field.selectionSet, `${path}.`);
      if (patch?.add) {
        const extra = operationOf(parse(`{ ${patch.add} }`)).selectionSet.selections;
        field.selectionSet ||= { kind: Kind.SELECTION_SET, selections: [] };
        field.selectionSet.selections.push(...extra);
      }
      return [field];
    });
  };
  walk(operation.selectionSet);
  return gql(print(parsed));
}
