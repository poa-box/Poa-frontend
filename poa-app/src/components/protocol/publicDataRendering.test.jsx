import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SponsorshipSection from '@/components/protocol/SponsorshipSection';
import GasUsageSection from '@/components/protocol/GasUsageSection';
import BeaconSection from '@/components/protocol/BeaconSection';
const chain = { chainId: 100, name: 'Fixture', nativeCurrency: 'XDAI' };
describe('public indexed-data rendering', () => {
  it('distinguishes unknown sponsorship configuration from explicitly disabled/zero settings', () => {
    const unknown = renderToStaticMarkup(<SponsorshipSection chains={{ 100: { ...chain, onboarding: null, orgDeploy: null } }} />);
    expect(unknown).toContain('Configuration unavailable'); expect(unknown).not.toContain('Disabled');
    const disabled = renderToStaticMarkup(<SponsorshipSection chains={{ 100: { ...chain,
      onboarding: { enabled: false, maxGasPerCreation: '0.0000', dailyCreationLimit: '0' },
      orgDeploy: { enabled: false, maxGasPerDeploy: '0.0000', dailyDeployLimit: '0', maxDeploysPerAccount: '0' },
    } }} />);
    expect(disabled).toContain('Disabled'); expect(disabled).toContain('0.0000 XDAI');
  });
  it('keeps an incomplete gas source visible as unavailable and renders large counters exactly', () => {
    const gas = { totalSpent: null, totalDeposited: null, currentBalance: null, totalGasSponsored: null, totalUserOps: null, orgCount: null };
    const unknown = renderToStaticMarkup(<GasUsageSection chains={{ 100: { ...chain, gasUsage: gas } }} />);
    expect(unknown).toContain('Transactions Sponsored'); expect(unknown).toContain('— XDAI'); expect(unknown).not.toContain('NaN');
    const known = renderToStaticMarkup(<GasUsageSection chains={{ 100: { ...chain, gasUsage: { ...gas, totalUserOps: '9007199254740993' } } }} />);
    expect(known).toContain('9,007,199,254,740,993');
  });
  it('reports failed history rather than claiming no indexed upgrades', () => {
    const html = renderToStaticMarkup(<BeaconSection chains={{ 100: { ...chain, beaconUpgrades: [], historyCoverage: { beacon: { status: 'unavailable' } } } }} />);
    expect(html).toContain('Upgrade history is unavailable'); expect(html).not.toContain('No upgrade history indexed yet');
  });
});
