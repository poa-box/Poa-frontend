import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import OrganizationProviders from '@/components/providers/OrganizationProviders';

const state = vi.hoisted(() => ({ org: {}, authority: {} }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra());
vi.mock('next/router', () => ({ useRouter: () => ({ reload: vi.fn(), push: vi.fn() }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => state.org }));
vi.mock('@/hooks/accessV2/useOrgAuthority', () => ({ useOrgAuthority: () => state.authority }));
vi.mock('@/context/Web3ServicesContext', () => ({ Web3ServicesProvider: ({ children }) => children }));
vi.mock('@/context/UserContext', () => ({ UserProvider: ({ children }) => children }));
vi.mock('@/context/VotingContext', () => ({ VotingProvider: ({ children }) => children }));
vi.mock('@/context/web3Context', () => ({ Web3Provider: ({ children }) => children }));
vi.mock('@/features/tour/TourContext', () => ({ TourProvider: ({ children }) => children, useTour: () => ({ isActive: false }) }));
vi.mock('@/components/NetworkModalControl', () => ({ default: () => null }));
vi.mock('@/components/providers/DeferredTourPrompt', () => ({ default: () => null }));
vi.mock('@/components/providers/AccountRuntimeHost', () => ({ default: () => <span>Independent account runtime</span> }));
vi.mock('@/components/shared/CommunityLoadingState', () => ({ default: ({ label }) => <div>{label}</div> }));

describe('authority boundary within the stable application providers', () => {
  beforeEach(() => {
    state.org = { orgName: 'Test6', orgId: 'test6', orgStatus: 'ready', loading: false, error: null };
    state.authority = { enabled: true, loading: false };
  });
  const render = () => renderToStaticMarkup(<OrganizationProviders><button>Organization action</button></OrganizationProviders>);

  it('renders supported organization controls alongside the independent account runtime', () => {
    const html = render();
    expect(html).toContain('Organization action');
    expect(html).toContain('Independent account runtime');
  });

  it.each(['loading', 'disabled', 'error'])('withholds unverified controls while keeping account startup mounted: %s', kind => {
    state.authority.enabled = kind === 'error';
    state.authority.loading = kind === 'loading';
    if (kind === 'error') state.org.error = new Error('Organization unavailable');
    const html = render();
    expect(html).not.toContain('Organization action');
    expect(html).toContain('Independent account runtime');
  });

  it('keeps unscoped application pages available without granting organization access', () => {
    state.org = { orgName: null, orgId: null, orgStatus: 'missing' };
    state.authority.enabled = false;
    expect(render()).toContain('Organization action');
  });
});
