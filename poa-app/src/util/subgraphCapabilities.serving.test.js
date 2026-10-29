import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildClientSchema, validate } from 'graphql';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_V2_REQUIREMENTS, CAPABILITY, hasCapability, satisfies } from '@/util/subgraphCapabilities';
import * as documents from '@/util/queriesAccessV2';
import { FETCH_ORG_STRUCTURE_DATA } from '@/util/queries';

// Full cached serving schemas only; never issue a network request in this suite.
const directory = process.env.POA_CORE_SERVING_SCHEMAS;
describe.skipIf(!directory)('authority capabilities against cached serving schemas', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  for (const chainId of [100, 42161]) {
    it(`imports and validates actual selected fields and metadata on chain ${chainId}`, async () => {
      const envelope = JSON.parse(readFileSync(join(directory, `review-introspection-${chainId}.json`), 'utf8'));
      const schema = buildClientSchema(envelope.data);
      const types = new Map(envelope.data.__schema.types.map(type => [type.name,
        new Set((type.fields || []).map(field => field.name))]));
      expect(satisfies(types, ACCESS_V2_REQUIREMENTS)).toBe(true);
      const failures = Object.values(documents).filter(document => document?.kind === 'Document')
        .flatMap(document => validate(schema, document).map(error => error.message));
      expect(failures).toEqual([]);
      expect(validate(schema, FETCH_ORG_STRUCTURE_DATA)).toEqual([]);
      const fetch = vi.fn(async (_url, options) => {
        const data = {};
        for (const match of JSON.parse(options.body).query.matchAll(/(t\d+): __type\(name: "([^"]+)"\)/g)) {
          data[match[1]] = { name: match[2], fields: [...types.get(match[2])].map(name => ({ name })) };
        }
        return { ok: true, json: async () => ({ data }) };
      });
      vi.stubGlobal('fetch', fetch);
      await expect(hasCapability(`https://cached-schema.example/${chainId}`, CAPABILITY.ACCESS_V2)).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      types.get('_Block_').delete('hash');
      await expect(hasCapability(`https://cached-schema.example/${chainId}/missing-hash`, CAPABILITY.ACCESS_V2)).resolves.toBe(false);
    });
  }
});
