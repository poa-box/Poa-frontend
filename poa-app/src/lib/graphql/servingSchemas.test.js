import { boardDocument } from '@/lib/tasks/projectReads';
import { FETCH_TASK_APPLICATIONS_PAGE, FETCH_PROJECTS_PAGE, FETCH_TASKS_PAGE, FETCH_TASKS_PAGE_LEGACY } from '@poa-box/core/graph/documents/task';
import { FETCH_HYBRID_PROPOSAL_BALLOTS_PAGE, FETCH_DD_PROPOSAL_BALLOTS_PAGE } from '@poa-box/core/graph/documents/voting-classes';
import { FETCH_MODULES_PAGE, FETCH_COMPLETIONS_PAGE } from '@poa-box/core/graph/documents/education';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildClientSchema, parse, print, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import * as shared from '@/util/queries';
import * as passkey from '@/util/passkeyQueries';
import * as account from '@/util/accountQueries';
import * as inflows from '@/util/landingInflowQueries';
import * as protocol from '@/lib/graphql/protocolData';
import { FETCH_PROTOCOL_OVERVIEW, FETCH_PROTOCOL_ORGS_PAGE, FETCH_BEACON_EVENTS_PAGE, FETCH_SOLIDARITY_EVENTS_PAGE } from '@poa-box/core/graph/documents/protocol';
import { ORGANIZATION_DIRECTORY_QUERY } from '@/util/orgDirectory';

// The integration gate points at immutable, full cached introspection envelopes.
// Ordinary offline unit runs need not carry another repository's large schemas.
const schemaDirectory = process.env.POA_CORE_SERVING_SCHEMAS;
const documents = Object.entries({ FETCH_TASK_APPLICATIONS_PAGE, FETCH_HYBRID_PROPOSAL_BALLOTS_PAGE, FETCH_DD_PROPOSAL_BALLOTS_PAGE, FETCH_MODULES_PAGE, FETCH_COMPLETIONS_PAGE, ...shared, ...passkey, ...account, ...inflows, ...protocol, FETCH_PROTOCOL_OVERVIEW, FETCH_PROTOCOL_ORGS_PAGE, FETCH_BEACON_EVENTS_PAGE, FETCH_SOLIDARITY_EVENTS_PAGE, ORGANIZATION_DIRECTORY_QUERY })
  .filter(([, value]) => value?.kind === 'Document' || typeof value === 'string' && /^\s*(query\b|\{)/.test(value))
  .map(([name, value]) => [name, typeof value === 'string' ? parse(value) : value]);

for (const [i, document] of [FETCH_PROJECTS_PAGE, FETCH_TASKS_PAGE, FETCH_TASKS_PAGE_LEGACY].entries()) {
  for (const releases of [true, false]) documents.push([`MountedBoard_${i}_${releases}`, boardDocument(document, releases)]);
}

describe.skipIf(!schemaDirectory)('composed documents against full cached serving schemas', () => {
  for (const chainId of [100, 42161]) {
    it(`validates every composed document and exact variable scalar on chain ${chainId}`, () => {
      const raw = JSON.parse(readFileSync(join(schemaDirectory, `review-introspection-${chainId}.json`), 'utf8'));
      const schema = buildClientSchema(raw.data);
      expect(Object.keys(schema.getTypeMap()).length).toBeGreaterThan(200);
      const failures = documents.flatMap(([name, document]) => validate(schema, typeof document === 'string' ? parse(document) : document).map(error => `${name}: ${error.message}`));
      expect(failures).toEqual([]);
      // A parse-only check would miss this wrong scalar at the actual filter.
      const wrongScalar = parse(print(shared.FETCH_USER_MEMBERSHIPS).replace('$user: Bytes!', '$user: String!'));
      expect(validate(schema, wrongScalar).map(error => error.message)).toContain('Variable "$user" of type "String!" used in position expecting type "Bytes".');
    });
  }
});
