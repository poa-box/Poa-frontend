import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ directory: {}, retry: vi.fn(), buttons: [] }));
vi.mock('@chakra-ui/react', async () => { const { mockChakra } = await import('@/test/mockChakra'); return mockChakra(fixture.buttons); });
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children }) => children }));
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ isConnected: false }), useConnectModal: () => ({ openConnectModal: vi.fn() }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ isAuthHydrated: true }) }));
vi.mock('@/hooks/useGlobalAccount', () => ({ useGlobalAccount: () => ({ hasAccount: false }) }));
vi.mock('@/context/profileHubContext', () => ({ useProfileHubContext: () => fixture.directory }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({}) }));
vi.mock('@/features/tour', () => ({ useTour: () => ({ startTour: vi.fn() }) }));
vi.mock('@/components/landing/Navbar', () => ({ default: () => null }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
import ExplorePage from '@/components/explore/ExplorePage';
const org = { id: 'Known Community', orgId: 'community', chainId: 100, taskCounts: null, totalMembers: null, aboutInfo: { description: 'Together' } };
function render() { fixture.buttons.length = 0; return renderToStaticMarkup(<ExplorePage />); }
beforeEach(() => {
  vi.clearAllMocks(); fixture.directory = { perpetualOrganizations: [], isLoading: false, isComplete: false, unavailableChains: [100], refetch: fixture.retry };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('explore directory coverage', () => {
  it.each([0, 1, 105])('renders a verified current member total %s rather than historical rows', count => {
    fixture.directory.perpetualOrganizations = [{ ...org, totalMembers: count }];
    const html = render();
    expect(html).toContain(`>${count} member${count === 1 ? '' : 's'}</div>`);
  });
  it('renders a failed empty source as unavailable with a working retry, never a known empty directory', async () => {
    const html = render(); expect(html).toContain('Organizations unavailable'); expect(html).toContain('Gnosis');
    expect(html).not.toContain('No organizations yet');
    await fixture.buttons.find(button => button.children === 'Try again').onClick(); expect(fixture.retry).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves known cards and honest partial count while an unavailable chain retries', () => {
    fixture.directory.perpetualOrganizations = [org]; let html = render();
    expect(html).toContain('Known Community'); expect(html).toContain('1 available'); expect(html).toContain('Some organizations are unavailable');
    expect(html).toContain('Members unavailable');
    fixture.directory.isLoading = true; html = render();
    expect(html).toContain('Known Community'); expect(html).toContain('Together');
  });
  it('shows the empty message only after complete enumeration and clears the outage notice on recovery', () => {
    fixture.directory.isComplete = true; fixture.directory.unavailableChains = [];
    let html = render(); expect(html).toContain('No organizations yet'); expect(html).not.toContain('Some organizations are unavailable');
    fixture.directory.perpetualOrganizations = [org]; html = render();
    expect(html).toContain('Known Community'); expect(html).not.toContain('1 available'); expect(html).not.toContain('No organizations yet');
  });
});
