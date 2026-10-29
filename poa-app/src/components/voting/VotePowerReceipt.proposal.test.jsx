import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const live = vi.hoisted(() => ({}));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra());
vi.mock('@chakra-ui/icons', () => ({ ChevronRightIcon: () => null, ChevronDownIcon: () => null,
  ChevronUpIcon: () => null, CheckIcon: () => null, CloseIcon: () => null }));
vi.mock('@/hooks/useVotingPower', () => ({ useVotingPower: () => live.power }));
vi.mock('@/hooks/useRoleNames', () => ({ useRoleNames: () => ({ getRoleNamesString: () => 'Stewards' }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ hasMemberRole: true, isAccountReady: true, userData: { hatIds: ['7'] } }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ poMembers: 11 }) }));
vi.mock('@/components/voting/GlassBack', () => ({ default: () => null }));
import { VotePowerReceipt } from '@/components/voting/VotePowerReceipt';

beforeEach(() => {
  live.power = { votingType: 'Hybrid', totalSharePct: 11.5, percentOfTotal: 11.5, breakdownStatus: 'ready',
    classBreakdown: [{ classIndex: 0, strategy: 'DIRECT', slicePct: 80, contributionToTotalPct: 80 / 11,
      eligible: true, _holders: 11, roleNames: [] },
    { classIndex: 1, strategy: 'ERC20_BAL', slicePct: 20, contributionToTotalPct: 11.5 - 80 / 11,
      eligible: true, userRawPower: 5, roleNames: [], shareKnown: true }] };
});
const render = props => renderToStaticMarkup(<VotePowerReceipt variant="compact" {...props} />);

describe('proposal-specific voting voice display', () => {
  it('shows 1 of 11 equal voices for a DD poll inside an 80/20 blended organization', () => {
    const html = render({ votingType: 'Direct Democracy', eligibleCount: 11 });
    expect(html).toContain('Equal voice: 1 of 11 members = 9.1%');
    expect(html).not.toContain('11.5%');
  });

  it('uses the poll eligible denominator for a restricted DD poll and shows no blended fallback while it is unavailable', () => {
    expect(render({ votingType: 'Direct Democracy', eligibleCount: 2, restrictedHatIds: ['7'] })).toContain('1 of 2 members = 50.0%');
    const unknown = render({ votingType: 'Direct Democracy', eligibleCount: 0 });
    expect(unknown).toContain('Equal voice — one person, one vote');
    expect(unknown).not.toContain('11.5%'); expect(unknown).not.toContain('9.1%');
  });

  it('retains blended voice for Hybrid proposals and organization-level receipt callers', () => {
    expect(render({ votingType: 'Hybrid', eligibleCount: 11 })).toContain('11.5%');
    expect(render({})).toContain('11.5%');
    live.power.votingType = 'Direct Democracy';
    expect(render({})).toContain('1 of 11 members = 9.1%');
  });

  it('does not substitute the organization population when a proposal denominator is missing', () => {
    for (const eligibleCount of [undefined, null]) {
      const html = render({ votingType: 'Direct Democracy', eligibleCount, restrictedHatIds: ['7'] });
      expect(html).toContain('Equal voice — one person, one vote');
      expect(html).not.toContain('9.1%'); expect(html).not.toContain('11.5%');
    }
  });

  it('preserves an approximate electorate label instead of presenting an estimate as exact', () => {
    expect(render({ votingType: 'Direct Democracy', eligibleCount: 11, approximate: true })).toContain('1 of about 11 members = ~9.1%');
  });
});
