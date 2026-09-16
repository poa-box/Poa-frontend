import { describe, expect, it } from 'vitest';
import { buildSchema, graphql, parse } from 'graphql';
import { InMemoryCache } from '@apollo/client';
import { createOrganizationSnapshot } from '@/lib/graphql/organizationSnapshot';

const schema = buildSchema(`
 input Filter { name: String! }
 type Query { organizations(where: Filter!, first: Int!): [Organization!]! }
 type Authority { id: ID!, isRouterBound: Boolean!, cutoverAt: String! }
 type Organization { membershipAuthority: Authority, id: ID!, name: String!, projects(first: Int!, order: String): [Project!]!, votes(first: Int!, before: Int!): [Vote!]! }
 type Project { id: ID!, title: String!, tasks(first: Int!, order: String): [Task!]! }
 type Task { id: ID!, status: String! }
 type Vote { id: ID! }
`);
const stats = parse(`query Stats($orgId: ID!) { organization(id: $orgId) { id name projects(first: 100) { id tasks(first: 1000) { id status } } } }`);
const feed = parse(`query Feed($orgId: ID!, $first: Int!, $before: Int!) { organization(id: $orgId) { id projects(first: 50, order: "desc") { id title tasks(first: 1000, order: "desc") { id status } } votes(first: $first, before: $before) { id } } }`);
const sections = () => [{ query: stats }, { query: feed, variables: { first: 50, before: 900 } }];
async function execute(plan) {
 const calls = [];
 const result = await graphql({ schema, source: plan.query, variableValues: { ...plan.variables, name: 'Sandbox' }, rootValue: {
  organizations(args) {
   calls.push(['organizations', args]);
   return [{ id: 'org1', name: 'Sandbox', membershipAuthority: { id: '0x' + '1'.repeat(40), isRouterBound: true, cutoverAt: '1750000000' }, projects(args) {
    calls.push(['projects', args]);
    return [{ id: 'project1', title: 'Work', tasks(args) {
     calls.push(['tasks', args]); return [{ id: args.order ? 'task2' : 'task1', status: 'Open' }];
    } }];
   }, votes(args) { calls.push(['votes', args]); return [{ id: 'vote1' }]; } }];
  },
 } });
 expect(result.errors).toBeUndefined();
 return { calls, org: result.data.organizations[0] };
}

describe('organization snapshot', () => {
 it('executes conflicting arguments and variables and restores original result shapes', async () => {
  const plan = createOrganizationSnapshot(sections());
  const { calls, org } = await execute(plan);
  for (const expected of [
   ['organizations', { where: { name: 'Sandbox' }, first: 100 }],
   ['projects', { first: 100 }], ['projects', { first: 50, order: 'desc' }],
   ['tasks', { first: 1000 }], ['tasks', { first: 1000, order: 'desc' }],
   ['votes', { first: 50, before: 900 }],
  ]) expect(calls).toContainEqual(expected);
  expect(org.membershipAuthority).toMatchObject({ isRouterBound: true, cutoverAt: '1750000000' });
  const entries = plan.entries(org);
  expect(entries[0].data.organization.projects[0].tasks[0].id).toBe('task1');
  expect(entries[1].data.organization.projects[0].tasks[0].id).toBe('task2');
  expect(entries[1].variables).toEqual({ orgId: 'org1', first: 50, before: 900 });
  expect(entries[0].data.organization.projects[0]).not.toHaveProperty('title');
 });
 it('populates complete original-query Apollo cache reads without mixing windows', async () => {
  const plan = createOrganizationSnapshot(sections());
  const { org } = await execute(plan);
  const cache = new InMemoryCache();
  expect(org.membershipAuthority).toMatchObject({ isRouterBound: true, cutoverAt: '1750000000' });
  const entries = plan.entries(org);
  entries.forEach(entry => cache.writeQuery(entry));
  for (const entry of entries) {
   const diff = cache.diff({ query: entry.query, variables: entry.variables, returnPartialData: false });
   expect(diff.complete).toBe(true);
   expect(diff.result).toEqual(entry.data);
  }
 });
 it('merges identical fields while restoring distinct original aliases', async () => {
  const aliases = parse(`query Aliases($orgId: ID!) { organization(id: $orgId) { id label: name items: projects(first: 100) { id tasks(first: 1000) { id } } } }`);
  const plan = createOrganizationSnapshot([{ query: stats }, { query: aliases }]);
  const { calls, org } = await execute(plan);
  expect(calls.filter(([name]) => name === 'projects')).toHaveLength(1);
  expect(calls.filter(([name]) => name === 'tasks')).toHaveLength(1);
  expect(plan.entries(org)[1].data.organization.label).toBe('Sandbox');
  expect(plan.entries(org)[1].data.organization.items[0].tasks[0].id).toBe('task1');
 });
 it('rejects unsupported roots and conflicting variables before any request', () => {
  expect(() => createOrganizationSnapshot([{ query: parse('query { users { id } }') }])).toThrow('one organization');
  expect(() => createOrganizationSnapshot([{ query: parse('mutation { organization { id } }') }])).toThrow('one organization');
  expect(() => createOrganizationSnapshot([
   { query: feed, variables: { first: 50, before: 900 } },
   { query: feed, variables: { first: 20, before: 900 } },
  ])).toThrow('Conflicting snapshot variable: first');
 });
});
