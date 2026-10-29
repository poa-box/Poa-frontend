import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ data: {}, actions: [], rendered: {}, slots: [], cursor: 0 }));
vi.mock('react', async original => ({ ...await original(),
  useState: initial => { const index = fixture.cursor++; fixture.slots[index] ||= { value: initial };
    return [fixture.slots[index].value, value => { fixture.slots[index].value = value; }]; },
  useRef: initial => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: initial }; },
}));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(fixture.actions));
vi.mock('@/hooks/useProtocolData', () => ({ useProtocolData: () => fixture.data }));
vi.mock('@/components/landing/Navbar', () => ({ default: () => null }));
vi.mock('@/components/landing/Footer', () => ({ default: () => null }));
vi.mock('@/components/protocol/HeroSection', () => ({ default: () => null }));
vi.mock('@/components/protocol/StatsSection', () => ({ default: props => {
  fixture.rendered = props;
  return React.createElement('div', null, `Known organizations: ${props.chains[100]?.orgStats.totalOrgs}; Total: ${props.aggregated.totalOrgs ?? '—'}`);
} }));
vi.mock('@/components/protocol/InfrastructureSection', () => ({ default: () => null }));
vi.mock('@/components/protocol/SolidaritySection', () => ({ default: () => null }));
vi.mock('@/components/protocol/SponsorshipSection', () => ({ default: () => null }));
vi.mock('@/components/protocol/BeaconSection', () => ({ default: () => null }));
vi.mock('@/components/protocol/GasUsageSection', () => ({ default: () => null }));
import ProtocolPage from '@/components/protocol/ProtocolPage';
function render() { fixture.cursor = 0; fixture.actions.length = 0; return renderToStaticMarkup(React.createElement(ProtocolPage)); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => {
  fixture.slots = []; fixture.cursor = 0; fixture.rendered = {};
  fixture.data = { isLoading: false, unavailableChains: [42161], chains: { 100: { orgStats: { totalOrgs: '7' } } },
    aggregated: { totalOrgs: null, isComplete: false }, refetch: vi.fn().mockResolvedValue() };
});
describe('actual protocol page unavailable-source retry control', () => {
  it('runs the existing refetch, retains known rows and unknown totals, and disables duplicate retries while pending', async () => {
    const pending = deferred(); fixture.data.refetch.mockReturnValue(pending.promise);
    const html = render(); expect(html).toContain('Try again'); expect(html).toContain('Known organizations: 7; Total: —');
    const retry = fixture.actions.find(action => action.children === 'Try again');
    const first = retry.onClick(); await retry.onClick();
    expect(fixture.data.refetch).toHaveBeenCalledExactlyOnceWith();
    const whilePending = render();
    expect(fixture.actions.find(action => action.children === 'Try again').isDisabled).toBe(true);
    expect(whilePending).toContain('Known organizations: 7; Total: —');
    expect(fixture.rendered.chains).toBe(fixture.data.chains); expect(fixture.rendered.aggregated).toBe(fixture.data.aggregated);
    pending.resolve(); await first; render();
    expect(fixture.actions.find(action => action.children === 'Try again').isDisabled).toBe(false);
    fixture.data.unavailableChains = []; expect(render()).not.toContain('Try again');
  });
  it('offers retry after a first-load failure without inventing known rows or totals', () => {
    fixture.data.chains = {};
    expect(render()).toContain('Totals will appear when every source responds.');
    expect(fixture.data.aggregated.totalOrgs).toBeNull();
  });
});
