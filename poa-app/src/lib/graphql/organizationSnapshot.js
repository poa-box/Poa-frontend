import { Kind, parse, print, visit } from 'graphql';
import { addTypenameToDocument } from '@apollo/client/utilities';

const responseKey = (field) => field.alias?.value || field.name.value;
const fieldSignature = (field) => print({ ...field, alias: undefined, selectionSet: undefined, loc: undefined });

// Merge matching selections once. Different arguments retain separate aliases:
// the 100-project statistics window must not become the 50-project task feed.
function mergeSelections(target, source) {
  const projection = [];
  for (const field of source.selections) {
    if (field.kind !== Kind.FIELD) throw new Error('Snapshot sections must use field selections');
    const signature = fieldSignature(field);
    let merged = target.selections.find((item) => fieldSignature(item) === signature);
    if (!merged) {
      const key = responseKey(field);
      const occupied = new Set(target.selections.map(responseKey));
      let alias = key;
      for (let n = 1; occupied.has(alias); n++) alias = `snapshot_${key}_${n}`;
      merged = {
        ...field,
        ...(alias !== field.name.value ? { alias: { kind: Kind.NAME, value: alias } } : { alias: undefined }),
        ...(field.selectionSet ? { selectionSet: { kind: Kind.SELECTION_SET, selections: [] } } : {}),
      };
      target.selections.push(merged);
    }
    projection.push({
      key: responseKey(field),
      source: responseKey(merged),
      children: field.selectionSet ? mergeSelections(merged.selectionSet, field.selectionSet) : null,
    });
  }
  return projection;
}

function projectResult(value, projection) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((entry) => projectResult(entry, projection));
  return Object.fromEntries(projection
    .filter(({ source }) => Object.prototype.hasOwnProperty.call(value, source))
    .map(({ key, source, children }) => [key, children ? projectResult(value[source], children) : value[source]]));
}

/** Compose the existing domain documents; no second, drifting list of fields. */
export function createOrganizationSnapshot(sections) {
  const document = parse('query FindOrgSnapshot($name: String!) { organizations(where: { name: $name }, first: 1) { id name } }');
  const operation = document.definitions[0];
  const root = operation.selectionSet.selections[0];
  const variables = {};
  const definitions = new Map();
  const parts = sections.map(({ query, variables: values = {} }) => {
    const normalized = addTypenameToDocument(query);
    const original = normalized.definitions.find((def) => def.kind === Kind.OPERATION_DEFINITION);
    if (normalized.definitions.length !== 1 || original?.operation !== 'query'
      || original.selectionSet.selections.length !== 1
      || original.selectionSet.selections[0].name.value !== 'organization'
      || original.selectionSet.selections[0].alias
      || original.selectionSet.selections[0].directives?.length) {
      throw new Error('Snapshot section must select one organization');
    }
    const selectionSet = original.selectionSet.selections[0].selectionSet;
    const used = new Set();
    visit(selectionSet, { Variable(node) { used.add(node.name.value); } });
    for (const definition of original.variableDefinitions || []) {
      const name = definition.variable.name.value;
      if (!used.has(name)) continue; // orgId is replaced by the name lookup.
      if (name === 'name') throw new Error('Snapshot variable name is reserved');
      if (definitions.has(name) && (print(definitions.get(name)) !== print(definition)
        || JSON.stringify(variables[name]) !== JSON.stringify(values[name]))) {
        throw new Error(`Conflicting snapshot variable: ${name}`);
      }
      definitions.set(name, definition);
      if (Object.prototype.hasOwnProperty.call(values, name)) variables[name] = values[name];
    }
    return { query, variables: values, projection: mergeSelections(root.selectionSet, selectionSet) };
  });
  operation.variableDefinitions.push(...definitions.values());
  return {
    query: print(document),
    variables,
    entries(organization) {
      return parts.map(({ query, variables: values, projection }) => ({
        query,
        variables: { ...values, orgId: organization.id },
        data: { organization: projectResult(organization, projection) },
      }));
    },
  };
}
