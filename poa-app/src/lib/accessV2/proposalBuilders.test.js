import { describe, it, expect } from 'vitest';
import { buildPermRows, buildEditPermsBatch, buildRoleRemovalBatch, projectCtx } from '@/lib/accessV2/proposalBuilders';
import { authorityInterface } from '@/lib/accessV2/txBuilders';
import { PERM_KEYS, GLOBAL_CTX, decodePermWord, maskPermWord, boolPermWord } from '@/lib/accessV2/permKeys';
import { AUTHORITY_ADDRESS as A, ALICE, MEMBERS_ID, EXECS_ID } from '@/lib/accessV2/fixtures';
const decodeBatch = batch => batch.map(call => authorityInterface.parseTransaction({ data: call.data }));

describe('buildPermRows', () => {
  it('turns bool checkboxes into exists+1 words', () => {
    const rows = buildPermRows({ DD_VOTE: true, HV_CREATE: false });
    expect(rows).toHaveLength(1);
    expect(rows[0].permKey).toBe(PERM_KEYS.DD_VOTE);
    expect(rows[0].ctx).toBe(GLOBAL_CTX);
    expect(decodePermWord(rows[0].word).enabled).toBe(true);
  });

  it('turns a task mask into an OR-mask word', () => {
    const rows = buildPermRows({ TM_PERMS: 6 });
    expect(decodePermWord(rows[0].word).value).toBe('6');
  });

  it('drops a zero mask rather than writing a deny-all row', () => {
    // In v1 a stored project mask of ZERO fell back to global; in v2 a zero-valued
    // inherit=false row would mean deny-all, which v1 cannot even express.
    expect(buildPermRows({ TM_PERMS: 0 })).toEqual([]);
  });

  it('ignores unknown permission names', () => {
    expect(buildPermRows({ NOT_A_KEY: true })).toEqual([]);
  });

  it('defaults NEW project rows to inherit=true — the un-shadowing default', () => {
    const [row] = buildPermRows({}, [{ projectId: '0x01', mask: 2 }]);
    expect(decodePermWord(row.word).inheritGlobal).toBe(true);
    // ctx carries the W4 +1 offset: project 1 is read at bytes32(2).
    expect(row.ctx).toBe(`0x${'0'.repeat(62)}02`);
  });

  it('honours a deliberate exclusion (inherit=false)', () => {
    const [row] = buildPermRows({}, [{ projectId: '0x01', mask: 2, inheritGlobal: false }]);
    expect(decodePermWord(row.word).inheritGlobal).toBe(false);
  });

  // TaskManager project ids start at 0, so a falsy id test drops every rule about an org's very
  // first project — and quietly, because the batch still builds and the vote still passes.
  it('keeps project 0, which is a real project', () => {
    const rows = buildPermRows({}, [
      { projectId: 0, mask: 2 },
      { projectId: '0', mask: 4 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].ctx).toBe(`0x${'0'.repeat(62)}01`);
    expect(rows[1].ctx).toBe(`0x${'0'.repeat(62)}01`);
  });

  it('drops a row with no project named', () => {
    expect(buildPermRows({}, [{ projectId: null, mask: 2 }, { projectId: '', mask: 2 }])).toEqual([]);
  });
});

/**
 * THE +1 OFFSET (spec freeze amendment W4).
 *
 * `TaskManager._permMask` reads `hasPerm(user, TM_PERMS, bytes32(uint256(pid) + 1))`, because TM
 * project ids start at 0 and ctx 0 is the authority's GLOBAL context. Writing the un-offset id is
 * SILENT: the setPerm succeeds, the subgraph indexes the row, the UI renders it — and project N's
 * permissions govern project N-1 while project 0's quietly become a global grant.
 */
describe('projectCtx — the W4 +1 offset', () => {
  it('is bytes32(0) only for "no project"', () => {
    expect(projectCtx(null)).toBe(GLOBAL_CTX);
    expect(projectCtx(undefined)).toBe(GLOBAL_CTX);
    expect(projectCtx('')).toBe(GLOBAL_CTX);
    expect(projectCtx('   ')).toBe(GLOBAL_CTX);
  });

  it('offsets project 0 to bytes32(1), never to the global ctx', () => {
    expect(projectCtx(0)).toBe(`0x${'0'.repeat(62)}01`);
    expect(projectCtx('0')).toBe(`0x${'0'.repeat(62)}01`);
    expect(projectCtx('0x00')).toBe(`0x${'0'.repeat(62)}01`);
    expect(projectCtx(0)).not.toBe(GLOBAL_CTX);
  });

  it('offsets hex and decimal ids alike', () => {
    expect(projectCtx('0xabc')).toBe(`0x${'0'.repeat(61)}abd`);
    expect(projectCtx('1')).toBe(`0x${'0'.repeat(62)}02`);
    expect(projectCtx(9)).toBe(`0x${'0'.repeat(62)}0a`);
    expect(projectCtx(`0x${'0'.repeat(62)}0f`)).toBe(`0x${'0'.repeat(62)}10`);
  });

  it('accepts the composite subgraph id every project picker hands around', () => {
    const tm = `0x${'cc'.repeat(20)}`;
    expect(projectCtx(`${tm}-5`)).toBe(`0x${'0'.repeat(62)}06`);
    expect(projectCtx(`${tm}-${`0x${'0'.repeat(63)}5`}`)).toBe(`0x${'0'.repeat(62)}06`);
    // …and agrees with the plain form of the same project.
    expect(projectCtx(`${tm}-5`)).toBe(projectCtx('5'));
  });

  it('always returns a full bytes32 — a short hex string is an INVALID_ARGUMENT to ethers', () => {
    for (const id of [0, '1', '0xabc', `0x${'cc'.repeat(20)}-7`]) {
      expect(projectCtx(id), String(id)).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('refuses a value that is not a project id, rather than writing a row at a junk ctx', () => {
    expect(() => projectCtx('not-an-id')).toThrow(/not a project id/);
  });
});

describe('buildEditPermsBatch — diffs, so an untouched permission is not rewritten', () => {
  const current = [
    { permKey: PERM_KEYS.DD_VOTE, ctx: GLOBAL_CTX, word: boolPermWord(true) },
    { permKey: PERM_KEYS.TM_PERMS, ctx: GLOBAL_CTX, word: maskPermWord(2, { inheritGlobal: false }) },
  ];

  it('emits nothing when nothing changed', () => {
    const { batch } = buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: current });
    expect(batch).toEqual([]);
  });

  it('setPerm for a changed value', () => {
    const next = [current[0], { ...current[1], word: maskPermWord(6, { inheritGlobal: false }) }];
    const calls = decodeBatch(buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: next }).batch);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('setPerm');
    expect(decodePermWord(calls[0].args[3].toString()).value).toBe('6');
  });

  it('clearPerm for a removed row', () => {
    const calls = decodeBatch(
      buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: [current[0]] }).batch
    );
    expect(calls.map((c) => c.name)).toEqual(['clearPerm']);
    expect(calls[0].args[1]).toBe(PERM_KEYS.TM_PERMS);
  });

  it('setPerm for a brand-new row', () => {
    const next = [...current, { permKey: PERM_KEYS.PAY_CREATE, ctx: GLOBAL_CTX, word: boolPermWord(true) }];
    const calls = decodeBatch(buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: next }).batch);
    expect(calls.map((c) => c.name)).toEqual(['setPerm']);
  });

  it('treats a per-project row as distinct from the global one', () => {
    const next = [...current, { permKey: PERM_KEYS.TM_PERMS, ctx: projectCtx('0x01'), word: maskPermWord(4) }];
    const { batch } = buildEditPermsBatch({ authority: A, subjectId: EXECS_ID, currentRows: current, nextRows: next });
    expect(batch).toHaveLength(1);
  });
});


it('requires scoped preflights even for a formerly live-reconciled removal', () => {
  expect(() => buildRoleRemovalBatch({ authority: A, subjectId: MEMBERS_ID, members: [{ address: ALICE }],
    liveReconciled: true })).toThrow('review these removals');
});
