import { describe, it, expect } from 'vitest';
import {
  FOLDERS_SCHEMA_VERSION,
  makeEmptyFolderDoc,
  validateFolderDoc, serializeFolderDoc,
} from './schema';

function folder(overrides = {}) {
  return {
    id: 'f-a',
    name: 'A',
    parentId: null,
    sortOrder: 0,
    projectIds: [],
    ...overrides,
  };
}

describe('makeEmptyFolderDoc', () => {
  it('returns a valid v1 doc', () => {
    const doc = makeEmptyFolderDoc();
    expect(doc).toEqual({ schemaVersion: FOLDERS_SCHEMA_VERSION, folders: [] });
    expect(validateFolderDoc(doc).valid).toBe(true);
  });
});

describe('validateFolderDoc', () => {
  it('accepts a minimal valid doc', () => {
    const doc = { schemaVersion: 1, folders: [folder()] };
    expect(validateFolderDoc(doc)).toEqual({ valid: true, errors: [] });
  });

  it('rejects non-object input', () => {
    expect(validateFolderDoc(null).valid).toBe(false);
    expect(validateFolderDoc(undefined).valid).toBe(false);
    expect(validateFolderDoc('not a doc').valid).toBe(false);
  });

  it('flags missing schemaVersion', () => {
    const { valid, errors } = validateFolderDoc({ folders: [] });
    expect(valid).toBe(false);
    expect(errors.some((e) => /schemaVersion/i.test(e))).toBe(true);
  });

  it('refuses forward-incompatible newer schemaVersions per spec', () => {
    const { valid, errors } = validateFolderDoc({ schemaVersion: 2, folders: [] });
    expect(valid).toBe(false);
    expect(errors.some((e) => /unsupported|newer/i.test(e))).toBe(true);
  });

  it('rejects non-array folders', () => {
    const { valid } = validateFolderDoc({ schemaVersion: 1, folders: {} });
    expect(valid).toBe(false);
  });

  it('detects duplicate folder ids', () => {
    const doc = {
      schemaVersion: 1,
      folders: [folder({ id: 'dup' }), folder({ id: 'dup', name: 'B' })],
    };
    const { valid, errors } = validateFolderDoc(doc);
    expect(valid).toBe(false);
    expect(errors.some((e) => /Duplicate folder id/i.test(e))).toBe(true);
  });

  it('detects a project assigned to two folders', () => {
    const doc = {
      schemaVersion: 1,
      folders: [
        folder({ id: 'a', projectIds: [`0x${'01'.repeat(32)}`] }),
        folder({ id: 'b', projectIds: [`0x${'01'.repeat(32)}`] }),
      ],
    };
    const { valid, errors } = validateFolderDoc(doc);
    expect(valid).toBe(false);
    expect(errors.some((e) => /duplicate project|multiple folders/i.test(e))).toBe(true);
  });

  it('detects unknown parentId references', () => {
    const doc = {
      schemaVersion: 1,
      folders: [folder({ id: 'a', parentId: 'ghost' })],
    };
    const { valid, errors } = validateFolderDoc(doc);
    expect(valid).toBe(false);
    expect(errors.some((e) => /unknown parent/i.test(e))).toBe(true);
  });

  it('detects a self-cycle (A -> A)', () => {
    const doc = {
      schemaVersion: 1,
      folders: [folder({ id: 'a', parentId: 'a' })],
    };
    expect(validateFolderDoc(doc).valid).toBe(false);
  });

  it('detects a two-node cycle (A -> B -> A)', () => {
    const doc = {
      schemaVersion: 1,
      folders: [
        folder({ id: 'a', parentId: 'b' }),
        folder({ id: 'b', parentId: 'a' }),
      ],
    };
    const { valid, errors } = validateFolderDoc(doc);
    expect(valid).toBe(false);
    expect(errors.some((e) => /cycle/i.test(e))).toBe(true);
  });

  it('detects a three-node cycle (A -> B -> C -> A)', () => {
    const doc = {
      schemaVersion: 1,
      folders: [
        folder({ id: 'a', parentId: 'c' }),
        folder({ id: 'b', parentId: 'a' }),
        folder({ id: 'c', parentId: 'b' }),
      ],
    };
    expect(validateFolderDoc(doc).valid).toBe(false);
  });

  it('flags non-object folder records', () => {
    const doc = { schemaVersion: 1, folders: ['not-a-folder'] };
    const { valid } = validateFolderDoc(doc);
    expect(valid).toBe(false);
  });

  it('flags missing folder id', () => {
    const doc = { schemaVersion: 1, folders: [{ name: 'A', parentId: null, sortOrder: 0, projectIds: [] }] };
    expect(validateFolderDoc(doc).valid).toBe(false);
  });

  it('flags wrong field types', () => {
    const doc = {
      schemaVersion: 1,
      folders: [folder({ name: 123, sortOrder: 'zero', parentId: 5, projectIds: `0x${'01'.repeat(32)}` })],
    };
    expect(validateFolderDoc(doc).valid).toBe(false);
  });

  it('accepts a deep tree with no issues', () => {
    const doc = {
      schemaVersion: 1,
      folders: [
        folder({ id: 'root', name: 'Root' }),
        folder({ id: 'a', name: 'A', parentId: 'root', sortOrder: 100 }),
        folder({ id: 'b', name: 'B', parentId: 'a', sortOrder: 200, projectIds: [`0x${'01'.repeat(32)}`, `0x${'02'.repeat(32)}`] }),
        folder({ id: 'c', name: 'C', parentId: 'a', sortOrder: 300, projectIds: [`0x${'03'.repeat(32)}`] }),
      ],
    };
    expect(validateFolderDoc(doc)).toEqual({ valid: true, errors: [] });
  });
});


describe('canonical folder serialization', () => {
  it('retains document/record extensions and project IDs beyond safe integers', () => {
    const doc = { schemaVersion: 1, extension: { shared: true }, folders: [folder({
      projectIds: ['0x' + '12'.repeat(20) + '-9007199254740993'], badge: 'MiXeD',
    })] };
    expect(JSON.parse(serializeFolderDoc(doc))).toEqual(doc);
  });

  it('rejects duplicate assignment expressed as decimal and bytes32 entity IDs', () => {
    const address = '0x' + '12'.repeat(20);
    const doc = { schemaVersion: 1, folders: [folder({ projectIds: [
      address + '-9007199254740993', address + '-0x' + BigInt('9007199254740993').toString(16).padStart(64, '0'),
    ] })] };
    expect(validateFolderDoc(doc).valid).toBe(false);
  });

  it('rejects nonfinite order, malformed IDs and null records without throwing', () => {
    for (const record of [null, folder({ sortOrder: Infinity }), folder({ projectIds: ['not-a-project'] })]) {
      expect(validateFolderDoc({ schemaVersion: 1, folders: [record] }).valid).toBe(false);
    }
  });
});
