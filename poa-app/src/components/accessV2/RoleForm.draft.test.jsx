import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountedHostDocument, mountedNodes } from '@/test/mountedHost';
const display = vi.hoisted(() => ({ tokenLabel: undefined }));

// Keep React hooks, the controlled form, its validation, and installed core lint
// adapter real. Only visual primitives and the external user search are replaced.
vi.mock('@chakra-ui/react', async () => {
  const { createElement, forwardRef } = await import('react');
  const components = {};
  for (const name of ['Accordion', 'AccordionButton', 'AccordionIcon', 'AccordionItem', 'AccordionPanel',
    'Alert', 'AlertIcon', 'Badge', 'Box', 'Button', 'Checkbox', 'CheckboxGroup', 'Divider', 'FormControl',
    'FormLabel', 'HStack', 'IconButton', 'Input', 'NumberInput', 'NumberInputField', 'Progress',
    'Radio', 'RadioGroup', 'Select', 'SimpleGrid', 'Stack', 'Switch', 'Tag', 'TagCloseButton',
    'TagLabel', 'Text', 'Textarea', 'VStack', 'Wrap', 'WrapItem']) {
    components[name] = forwardRef(function Primitive({ children, onClick, onChange, isDisabled, value, ...props }, ref) {
      const tag = ['Button', 'IconButton', 'AccordionButton'].includes(name) ? 'button'
        : name === 'Input' || name === 'NumberInputField' ? 'input'
          : name === 'Select' ? 'select' : name === 'Textarea' ? 'textarea' : 'div';
      return createElement(tag, { 'data-testid': props['data-testid'], 'aria-label': props['aria-label'], 'data-primitive': name,
        'data-transform': props.textTransform,
        ...(tag === 'button' ? { disabled: Boolean(isDisabled) } : {}),
        ...(['input', 'select', 'textarea'].includes(tag) ? { value, readOnly: true } : {}),
        ref: node => {
          if (typeof ref === 'function') ref(node); else if (ref) ref.current = node;
          if (!node) return;
          node.press = () => { if (!isDisabled) return onClick?.(); };
          node.edit = next => { if (!isDisabled) return onChange?.({ target: { value: next, checked: next } }); };
          node.choose = next => onChange?.(next);
        },
      }, children);
    });
  }
  return components;
});
vi.mock('@/components/common/UserSearchInput', () => ({ default: () => null }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => display }));

import RoleForm from '@/components/accessV2/RoleForm';
import { buildRoleFormBatch, defaultRoleForm } from '@/lib/accessV2/roleFormBatch';
import { LINT_COPY } from '@/lib/accessV2/vouch';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

let root, container, context, latest, initial, status, updateValue;
function ControlledForm() {
  const [value, onChange] = useState(initial);
  useEffect(() => { latest = value; updateValue = onChange; }, [value, onChange]);
  return <RoleForm value={value} onChange={onChange} ctx={context} onStatus={status} />;
}
const byId = id => mountedNodes(container).find(node => node.attributes['data-testid'] === id);
const render = () => act(() => root.render(<ControlledForm />));
const next = () => act(() => byId('role-form-next').press());
const edit = (id, value) => act(() => byId(id).edit(value));
async function joining() {
  await render();
  await edit('role-form-name', 'Reviewers');
  await next(); await next(); await next();
  expect(container.textContent).toContain('Step 4 of 6 — Joining');
}
beforeEach(() => {
  initial = defaultRoleForm(); latest = null; status = vi.fn();
  display.tokenLabel = undefined;
  context = { authority: `0x${'11'.repeat(20)}`, roles: [], groups: [],
    reviewRoleConfiguration: vi.fn().mockResolvedValue({ summaries: ['Create the configured subject.'], warnings: [], submittable: { ok: true } }),
    createRole: vi.fn(), createGroup: vi.fn(), grant: vi.fn(), submit: vi.fn() };
  const doc = mountedHostDocument(); container = doc.createElement('main');
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { document: doc, HTMLIFrameElement: class {}, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  expect(fetch).not.toHaveBeenCalled();
  for (const name of ['createRole', 'createGroup', 'grant', 'submit']) expect(context[name]).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('mounted role/group draft with the real core lint adapter', () => {
  it.each([
    [undefined, 'Shares'], [{ symbol: 'pOa' }, 'Shares'], [{ useTokenSymbol: false, symbol: 'pOa' }, 'Shares'],
    [{ useTokenSymbol: true, symbol: 'pOa' }, 'pOa'], [{ useTokenSymbol: true, symbol: '' }, 'Shares'],
    [{ useTokenSymbol: true }, 'Shares'],
  ])('uses %j labels in permission controls, inherited grants, class choices and ballot review', async (setting, expected) => {
    display.tokenLabel = setting === undefined ? undefined : resolveTokenLabel(setting);
    initial = { ...initial, groupIds: ['group'], bindingVote: true, bindingClassIdx: 1, perms: { PT_APPROVE: true } };
    context.groups = [{ subjectId: 'group', name: 'Shared ownership', permEffective: key => [PERM_KEYS.PT_MEMBER, PERM_KEYS.PT_APPROVE].includes(key) ? 1 : 0 }];
    context.votingClasses = [{ classIndex: 1, strategy: 'PARTICIPATION', slicePct: 100 }];
    context.reviewRoleConfiguration = vi.fn(async form => buildRoleFormBatch({ form, tokenLabel: display.tokenLabel, votingClasses: context.votingClasses,
      operation: { status: 'ready', data: { mode: 'existing', subjectId: '19', preview: { callCount: 3, createsSubject: false },
        currentEffects: [{ field: 'permissions' }, { field: 'bindingClassIndex' }], deferredEffects: [] } } }));
    await render(); await edit('role-form-name', 'Builders'); await next(); await next();
    expect(byId('role-form-perm-PT_MEMBER').textContent).toContain(`Hold ${expected}`);
    expect(byId('role-form-perm-PT_APPROVE').textContent).toContain(`Approve ${expected} requests`);
    expect(container.textContent).toContain(`Hold ${expected} · Approve ${expected} requests`);
    const heading = mountedNodes(container).find(node => node.textContent === expected && node.attributes['data-primitive'] === 'Text');
    expect(heading).toBeDefined(); expect(heading.attributes['data-transform']).not.toBe('uppercase');
    expect(byId('role-form-class-select').textContent).toContain(`weighted by ${expected}`);
    expect(container.textContent).not.toMatch(/participation.tokens|Hold tokens|Approve token requests/i);
    await next(); await next(); await next();
    expect(container.textContent).toContain('Step 6 of 6 — Review');
    expect(container.textContent).toContain(`weighted by ${expected}`);
    expect(container.textContent).toContain(`${expected} requests`);
    if (expected === 'pOa') { expect(container.textContent).not.toContain('POA'); expect(container.textContent).not.toContain('poa'); }
  });

  it('loads blank-form capabilities once through edits and cancels only when the source or lifetime changes', async () => {
    let finish;
    context.refreshRoleCreation = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    await render();
    const source = context.refreshRoleCreation;
    const signal = source.mock.calls[0][1].signal;
    expect(source.mock.calls[0][0]).toBeUndefined();
    await edit('role-form-name', 'B');
    await edit('role-form-name', 'Builders');
    await act(() => updateValue(value => ({ ...value, description: 'Some details', sponsorship: { ...value.sponsorship, capNative: '0.1' } })));
    expect(source).toHaveBeenCalledOnce(); expect(signal.aborted).toBe(false);
    await act(() => finish());
    context = { ...context, refreshRoleCreation: vi.fn(async () => {}) };
    await render();
    expect(signal.aborted).toBe(true);
    expect(context.refreshRoleCreation).toHaveBeenCalledOnce();
    const nextSignal = context.refreshRoleCreation.mock.calls[0][1].signal;
    await act(() => root.render(null));
    expect(nextSignal.aborted).toBe(true);
  });

  it('keeps explicit email choices in the controlled draft and clears hidden budget consent when its parent is removed', async () => {
    initial = { ...defaultRoleForm(), sponsorship: { ...defaultRoleForm().sponsorship,
      includeConfiguredEmailRules: true, initializeClaimBudget: true } };
    context.sponsorshipConfig = { ready: true, canConfigure: true, claimBudgetMissing: true, claimBudgetReady: true, nativeSymbol: 'xDAI' };
    context.emailConfig = { ready: true, enabled: true, authorityMatches: true };
    await render(); await edit('role-form-name', 'Builders'); await next(); await next();
    expect(byId('role-form-sponsorship-claim-budget')).toBeDefined();
    await edit('role-form-sponsorship-email-rules', false);
    expect(latest.sponsorship).toMatchObject({ includeConfiguredEmailRules: false, initializeClaimBudget: false });
    expect(byId('role-form-sponsorship-claim-budget')).toBeUndefined();
    await edit('role-form-sponsorship-email-rules', true);
    expect(latest.sponsorship.initializeClaimBudget).toBe(false);
    await edit('role-form-sponsorship-claim-budget', true);
    expect(latest.sponsorship.initializeClaimBudget).toBe(true);
    await edit('role-form-sponsorship-passkeys', false);
    expect(latest.sponsorship).toMatchObject({ includeConfiguredEmailRules: false, initializeClaimBudget: false });
    await edit('role-form-sponsorship-passkeys', true);
    expect(latest.sponsorship).toMatchObject({ includeConfiguredEmailRules: false, initializeClaimBudget: false });
    await edit('role-form-sponsorship-email-rules', true);
    await edit('role-form-sponsorship-claim-budget', true);
    await edit('role-form-sponsorship-enabled', false);
    expect(latest.sponsorship).toMatchObject({ enabled: false, includeConfiguredEmailRules: false, initializeClaimBudget: false });
  });

  it('keeps default passkeys without email consent when email joining is unavailable and explains a known missing budget before consent', async () => {
    context.sponsorshipConfig = { ready: true, canConfigure: true, claimBudgetMissing: true, claimBudgetReady: true, nativeSymbol: 'xDAI' };
    context.emailConfig = { ready: true, enabled: false, authorityMatches: true, error: 'Email joining is unavailable.' };
    await render(); await edit('role-form-name', 'Builders'); await next(); await next();
    expect(container.textContent).toContain('Email joining is unavailable.');
    await edit('role-form-sponsorship-email-rules', true);
    expect(latest.sponsorship).toMatchObject({ supportPasskeys: true, includeConfiguredEmailRules: false, initializeClaimBudget: false });
    expect(byId('role-form-sponsorship-claim-budget')).toBeUndefined();
    context = { ...context, emailConfig: { ready: true, enabled: true, authorityMatches: true } };
    await render(); await edit('role-form-sponsorship-email-rules', true);
    expect(latest.sponsorship.initializeClaimBudget).toBe(false);
    expect(container.textContent).toContain('0.25 xDAI every 30 days');
    expect(container.textContent).toContain('organization share this budget');
    await edit('role-form-sponsorship-claim-budget', true);
    expect(latest.sponsorship.initializeClaimBudget).toBe(true);
  });

  it('does not repeat an in-flight review for an equivalent controlled draft and aborts on close', async () => {
    initial = { ...defaultRoleForm(), name: 'Reviewers' };
    let finish;
    context.reviewRoleConfiguration = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    await render();
    const signal = context.reviewRoleConfiguration.mock.calls[0][1].signal;
    await act(() => updateValue(value => structuredClone(value)));
    await render();
    expect(context.reviewRoleConfiguration).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(false);
    await act(() => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(() => finish({ summaries: ['Late review'], warnings: [], submittable: { ok: true } }));
    expect(container.textContent).toBe('');
    expect(status).toHaveBeenLastCalledWith({ atReview: false, blocked: null });
  });

  it('cancels the previous form review and never shows its late result after editing', async () => {
    initial = { ...defaultRoleForm(), name: 'First draft' };
    const finishes = [];
    context.reviewRoleConfiguration = vi.fn(() => new Promise(resolve => finishes.push(resolve)));
    await render();
    const oldSignal = context.reviewRoleConfiguration.mock.calls[0][1].signal;
    await act(() => updateValue(value => ({ ...value, name: 'Second draft' })));
    expect(oldSignal.aborted).toBe(true);
    expect(context.reviewRoleConfiguration).toHaveBeenCalledTimes(2);
    await act(() => finishes[0]({ summaries: ['Wrong old summary'], warnings: [], submittable: { ok: true } }));
    expect(container.textContent).not.toContain('Wrong old summary');
    await act(() => finishes[1]({ summaries: ['Current summary'], warnings: [], submittable: { ok: true } }));
    expect(container.textContent).toContain('Current summary');
    expect(status).toHaveBeenLastCalledWith({ atReview: true, blocked: null });
  });

  it('opens an untouched blank form and retains the required name gate', async () => {
    await render();
    expect(container.textContent).toContain('Step 1 of 6 — Details');
    expect(byId('role-form-next').disabled).toBe(true);
    expect(context.reviewRoleConfiguration).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith({ atReview: false, blocked: null });
  });

  it('keeps an empty voucher selection blocked and warns only while self-vouching is enabled', async () => {
    await joining();
    await edit('role-form-vouching', true);
    expect(byId('role-form-next').disabled).toBe(true);
    expect(container.textContent).toContain('Pick the role whose members can vouch');
    expect(container.textContent).not.toContain(LINT_COPY.SelfVoucher);
    await edit('role-form-voucher', 'self');
    expect(latest.vouching).toMatchObject({ selfVouch: true, voucherSubjectId: '' });
    expect(container.textContent).toContain(LINT_COPY.SelfVoucher);
    expect(byId('role-form-next').disabled).toBe(false);
    await edit('role-form-vouching', false);
    expect(container.textContent).not.toContain(LINT_COPY.SelfVoucher);
    await edit('role-form-vouching', true);
    expect(container.textContent).toContain(LINT_COPY.SelfVoucher);
    await next(); await next();
    expect(container.textContent).toContain('Step 6 of 6 — Review');
    expect(context.reviewRoleConfiguration).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith({ atReview: true, blocked: null });
  });

  it.each(['1', '2', ((1n << 256n) - 1n).toString(), '0x123456789abcdef123456789abcdef'])('preserves external voucher %s without a self-vouch warning', async subjectId => {
    context.roles = [{ subjectId, name: 'Existing reviewers' }];
    await joining();
    await edit('role-form-vouching', true);
    await edit('role-form-voucher', 'self');
    expect(container.textContent).toContain(LINT_COPY.SelfVoucher);
    await edit('role-form-voucher', subjectId);
    expect(latest.vouching).toMatchObject({ selfVouch: false, voucherSubjectId: subjectId });
    expect(container.textContent).not.toContain(LINT_COPY.SelfVoucher);
    expect(byId('role-form-next').disabled).toBe(false);
    await next(); await next();
    expect(status).toHaveBeenLastCalledWith({ atReview: true, blocked: null });
    expect(context.reviewRoleConfiguration.mock.calls[0][0].vouching.voucherSubjectId).toBe(subjectId);
  });

  it('keeps other core lint semantics in the mounted joining screen', async () => {
    initial = { ...initial, limitSeats: true, maxMembers: 3 };
    await joining();
    await edit('role-form-open-role', true);
    await edit('role-form-vouching', true);
    await edit('role-form-voucher', 'self');
    for (const code of ['SelfVoucher', 'QuorumNoOp', 'VouchWithMaxMembers']) expect(container.textContent).toContain(LINT_COPY[code]);
  });

  it('switches an untouched draft to a group and reaches its four-step review without a write', async () => {
    await render();
    const radio = mountedNodes(container).find(node => node.attributes['data-primitive'] === 'RadioGroup');
    expect(radio).toBeDefined();
    await act(() => radio.choose('group'));
    expect(container.textContent).toContain('Step 1 of 4 — Details');
    await edit('role-form-name', 'Review team');
    await next(); await next(); await next();
    expect(container.textContent).toContain('Step 4 of 4 — Review');
    expect(container.textContent).not.toContain(LINT_COPY.SelfVoucher);
    expect(context.reviewRoleConfiguration).toHaveBeenCalledOnce();
    expect(context.reviewRoleConfiguration.mock.calls[0][0].kind).toBe('group');
    expect(status).toHaveBeenLastCalledWith({ atReview: true, blocked: null });
  });
});
