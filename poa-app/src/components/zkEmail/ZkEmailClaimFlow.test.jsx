import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ enrollment: {}, summary: {}, auth: {},
  check: vi.fn(), restart: vi.fn(), claim: vi.fn(), finish: vi.fn(), create: vi.fn(), discard: vi.fn(),
  activate: vi.fn(), query: vi.fn(), prefetch: vi.fn(), emit: vi.fn(), join: vi.fn() }));

// Keep React, the actual flow, and the actual recovery notice mounted. Replace only
// UI primitives and external data/transport boundaries; no fake notice or hook dispatcher.
vi.mock('@chakra-ui/react', async () => {
  const { createElement, forwardRef } = await import('react');
  const components = { useDisclosure: () => ({ isOpen: false, onOpen() {}, onClose() {} }),
    useClipboard: () => ({ hasCopied: false, onCopy() {} }) };
  for (const name of ['Accordion', 'AccordionButton', 'AccordionIcon', 'AccordionItem', 'AccordionPanel',
    'Alert', 'AlertIcon', 'Badge', 'Box', 'Button', 'Code', 'Heading', 'HStack', 'Input', 'Link',
    'Progress', 'SlideFade', 'Spinner', 'Text', 'VStack', 'Wrap', 'WrapItem']) {
    components[name] = forwardRef(function Primitive({ children, onClick, onChange, isDisabled, isLoading,
      value, placeholder, role, ...props }, ref) {
      const tag = name === 'Button' ? 'button' : name === 'Input' ? 'input' : 'div';
      return createElement(tag, { role, 'aria-label': props['aria-label'],
        ...(tag === 'button' ? { disabled: Boolean(isDisabled || isLoading) } : {}),
        ...(tag === 'input' ? { value, placeholder, onChange } : {}),
        ref: node => {
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
          if (!node) return;
          node.press = () => { if (!node.disabled) return onClick?.(); };
          node.edit = next => onChange?.({ target: { value: next } });
        },
      }, children);
    });
  }
  return components;
});
vi.mock('@/hooks/useClaimZkEmailRole', () => ({ useClaimZkEmailRole: () => fixture.enrollment,
  ZK_CLAIM_STEPS: { IDLE: 'idle', CHECKING: 'checking', PROVING: 'proving', SIGNING: 'signing', SUBMITTING: 'submitting', DONE: 'done', ERROR: 'error' } }));
vi.mock('@/hooks/useZkEmailInviteSummary', () => ({ useZkEmailInviteSummary: () => fixture.summary, hatKey: value => value }));
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/context/WalletContext', () => ({ useWalletUI: () => ({}) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgId: 'test-org', subgraphUrl: 'https://indexed.test', roleNames: {} }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ optimisticJoin: fixture.join }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshEmit: () => ({ emit: fixture.emit }), RefreshEvent: { ROLE_CLAIMED: 'role:claimed' } }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test organization' }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => ({ query: fixture.query }) }));
vi.mock('@/lib/zkemail/prover', () => ({ buildCommand: address => `Claim role for ${address}`, buildMailto: () => 'mailto:member@example.test', prefetchCircuitArtifacts: fixture.prefetch }));
vi.mock('@/components/common/WalletActionButton', () => ({ default: () => null }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));

import ZkEmailClaimFlow from '@/components/zkEmail/ZkEmailClaimFlow';

// Minimal host nodes for ReactDOM's actual mount/update/unmount in Vitest's node
// environment. Events below enter through mocked primitive refs, not React internals.
class HostNode {
  constructor(nodeType, name, ownerDocument) {
    Object.assign(this, { nodeType, nodeName: name.toUpperCase(), tagName: name.toUpperCase(),
      ownerDocument, namespaceURI: 'http://www.w3.org/1999/xhtml', childNodes: [], attributes: {},
      style: {}, parentNode: null, disabled: false, value: '', text: '' });
  }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); this.childNodes.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; return child; }
  insertBefore(child, before) { if (child.parentNode) child.parentNode.removeChild(child); this.childNodes.splice(this.childNodes.indexOf(before), 0, child); child.parentNode = this; return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'disabled') this.disabled = true; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'disabled') this.disabled = false; }
  addEventListener() {}
  removeEventListener() {}
  get firstChild() { return this.childNodes[0] || null; }
  get textContent() { return this.text + this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = String(value); this.childNodes.forEach(child => { child.parentNode = null; }); this.childNodes = []; }
}
function hostDocument() {
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {},
    createElement: name => new HostNode(1, name, doc),
    createElementNS: (namespace, name) => new HostNode(1, name, doc),
    createTextNode: text => { const node = new HostNode(3, '#text', doc); node.textContent = text; return node; } };
  doc.body = doc.createElement('body'); doc.documentElement = doc.createElement('html');
  return doc;
}
const ACCOUNT = `0x${'11'.repeat(20)}`;
const HASH = `0x${'aa'.repeat(32)}`;
const pending = Object.freeze({ provenance: 'unverified', credential: Object.freeze({ accountAddress: ACCOUNT }) });
let root, container;
const render = () => act(() => root.render(<ZkEmailClaimFlow />));
function nodes(node = container) { return [node, ...node.childNodes.flatMap(child => nodes(child))]; }
const button = label => nodes().find(node => node.tagName === 'BUTTON' && node.textContent === label);
const referenceInput = () => nodes().find(node => node.attributes['aria-label'] === 'Original account setup transaction reference (optional)');
function expectNoEnrollmentSideEffects() {
  for (const action of [fixture.activate, fixture.create, fixture.discard, fixture.claim, fixture.finish, fixture.query, fixture.emit, fixture.join]) expect(action).not.toHaveBeenCalled();
  expect(fixture.enrollment.pendingEnrollment).toBe(pending);
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.auth = { isAuthenticated: true, isAuthHydrated: true, accountAddress: ACCOUNT, activatePasskey: fixture.activate };
  fixture.enrollment = { claim: fixture.claim, finishClaim: fixture.finish, prepareNewPasskey: fixture.create,
    discardPendingPasskey: fixture.discard, reset: vi.fn(), step: 'idle', ready: false, newAccountReady: true,
    hasPendingEnrollment: true, pendingEnrollment: pending, pendingAccount: pending.credential,
    checkPendingEnrollment: fixture.check, isChecking: false, recoveryStatus: 'reauthenticate',
    canRestart: true, restartExistingAccount: fixture.restart, claimerAddress: ACCOUNT };
  fixture.summary = { status: 'active', domains: [], emailCount: 0, refresh: vi.fn() };
  const doc = hostDocument(); container = doc.createElement('main');
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { document: doc, HTMLIFrameElement: class {}, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('actual email claim flow mounts recovery controls', () => {
  it.each(['active', 'dormant', 'degraded', 'unknown'])('forwards an optional exact original hash and explicit restart with %s invites', async status => {
    fixture.summary.status = status;
    await render();
    expect(container.textContent).toContain('Sign in with your existing passkey');
    expect(referenceInput()).toBeDefined();
    expect(button('Use signed-in account')).toBeDefined();
    expect(fixture.check).not.toHaveBeenCalled(); expect(fixture.restart).not.toHaveBeenCalled();
    expectNoEnrollmentSideEffects();

    await act(() => button('Check account setup').press());
    expect(fixture.check).toHaveBeenCalledExactlyOnceWith('');
    await act(() => referenceInput().edit(`  ${HASH}  `));
    expect(referenceInput().value).toBe(HASH);
    await act(() => button('Check account setup').press());
    expect(fixture.check).toHaveBeenLastCalledWith(HASH);
    expect(fixture.restart).not.toHaveBeenCalled();
    await act(() => button('Use signed-in account').press());
    expect(fixture.restart).toHaveBeenCalledExactlyOnceWith();
    expectNoEnrollmentSideEffects();
  });

  it('disables both mounted actions while checking and retains the entered hash across updates', async () => {
    await render();
    await act(() => referenceInput().edit(HASH));
    fixture.enrollment = { ...fixture.enrollment, isChecking: true };
    await render();
    expect(button('Check account setup').disabled).toBe(true);
    expect(button('Use signed-in account').disabled).toBe(true);
    await act(() => { button('Check account setup').press(); button('Use signed-in account').press(); });
    expect(fixture.check).not.toHaveBeenCalled(); expect(fixture.restart).not.toHaveBeenCalled();
    expect(referenceInput().value).toBe(HASH);
    fixture.enrollment = { ...fixture.enrollment, isChecking: false, recoveryStatus: 'restart-ready' };
    await render();
    expect(container.textContent).toContain('Send a new verification email');
    expect(button('Use signed-in account').disabled).toBe(false);
    await act(() => button('Check account setup').press());
    expect(fixture.check).toHaveBeenCalledExactlyOnceWith(HASH);
    expectNoEnrollmentSideEffects();
  });

  it('uses hook eligibility and pending state instead of inventing restart or recovery controls', async () => {
    fixture.enrollment = { ...fixture.enrollment, canRestart: false };
    await render();
    expect(referenceInput()).toBeUndefined(); expect(button('Use signed-in account')).toBeUndefined();
    expect(button('Check account setup')).toBeDefined();
    fixture.enrollment = { ...fixture.enrollment, hasPendingEnrollment: false };
    await render();
    expect(button('Check account setup')).toBeUndefined();
    expect(fixture.check).not.toHaveBeenCalled(); expect(fixture.restart).not.toHaveBeenCalled();
    expectNoEnrollmentSideEffects();
  });
});
