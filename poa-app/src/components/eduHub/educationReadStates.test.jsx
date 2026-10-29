import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ po: {}, user: {}, actions: [] }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(fixture.actions));
vi.mock('@/context/POContext', () => ({ usePOContext: () => fixture.po }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => fixture.user }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/shared/CommunityLoadingState', () => ({ default: () => null }));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/hooks/useOrgTheme', () => ({ useOrgTheme: () => ({ pageBackground: () => 'black' }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useEducationCreateGate', () => ({ useEducationCreateGate: () => ({ canCreateModule: true }) }));
vi.mock('@/features/tour', () => ({ useTour: () => ({ isActive: false }) }));
vi.mock('@/components/eduHub/CreateModuleModal', () => ({ default: () => null }));
vi.mock('@/components/eduHub/QuizModal', () => ({ default: () => React.createElement('span', null, 'Take quiz') }));
vi.mock('next/router', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
import EducationHub from '@/components/eduHub/EducationHub';
const render = () => renderToStaticMarkup(React.createElement(EducationHub));
beforeEach(() => {
  fixture.actions.length = 0;
  fixture.po = { orgStatus: 'ready', educationHubEnabled: true, poContextLoading: false, educationModules: [],
    educationModulesRead: { complete: true, loading: false, error: null, refetch: vi.fn() } };
  fixture.user = { completedModules: [], isAccountReady: true, userDataLoading: false,
    completedModulesRead: { complete: true, loading: false, error: null, refetch: vi.fn() } };
});
describe('actual education library completeness and retry presentation', () => {
  it('shows the empty invitation only for a complete known-empty library', () => {
    expect(render()).toContain('Room for something worth sharing');
    fixture.po.educationModulesRead = { ...fixture.po.educationModulesRead, complete: false, error: 'Unavailable' };
    const failed = render();
    expect(failed).toContain('The learning library is unavailable'); expect(failed).toContain('Try again');
    expect(failed).not.toContain('Room for something worth sharing'); expect(failed).not.toContain('of 0 completed');
    fixture.po.educationModulesRead = { ...fixture.po.educationModulesRead, loading: true, error: null };
    expect(render()).toContain('Loading the learning library');
  });
  it('keeps known cards/rewards and quiz access while progress is unknown on a partial learner refresh', () => {
    fixture.po.educationModules = [{ id: 'raw-module-id', moduleId: '9007199254740993', name: 'Historic lesson',
      payoutRaw: '1', payout: '0', description: 'Shared knowledge', answers: [] }];
    fixture.user.completedModulesRead = { ...fixture.user.completedModulesRead, complete: false, error: 'Incomplete' };
    const html = render();
    expect(html).toContain('Historic lesson'); expect(html).toContain('0.000000000000000001');
    expect(html).toContain('Progress pending'); expect(html).not.toContain('of 1 completed'); expect(html).toContain('Take quiz');
    fixture.actions.find(action => action.children === 'Try again').onClick();
    expect(fixture.po.educationModulesRead.refetch).toHaveBeenCalledOnce(); expect(fixture.user.completedModulesRead.refetch).toHaveBeenCalledOnce();
    fixture.po.educationModulesRead.loading = true; render();
    expect(fixture.actions.findLast(action => action.children === 'Try again').isDisabled).toBe(true);
  });
  it('keeps signed-out quiz reading available and explains why personal progress is unavailable', () => {
    fixture.po.educationModules = [{ id: 'module', moduleId: '1', name: 'A shared lesson', payoutRaw: '1' }];
    fixture.user.address = null; fixture.user.completedModulesRead.complete = false;
    const html = render();
    expect(html).toContain('Sign in to see progress'); expect(html).toContain('Take quiz'); expect(html).not.toContain('of 1 completed');
  });
  it('matches exact raw module IDs against the complete learner history and includes modules beyond the old 50-row cap', () => {
    fixture.po.educationModules = Array.from({ length: 51 }, (_, n) => ({ id: `hub-${9007199254740993n + BigInt(n)}`,
      moduleId: (9007199254740993n + BigInt(n)).toString(), name: `Historic lesson ${n}`, payoutRaw: '9007199254740993123456789012345678' }));
    fixture.user.completedModules = [{ id: 'completion', moduleId: fixture.po.educationModules.at(-1).moduleId }];
    const html = render(); expect(html).toContain('Historic lesson 50'); expect(html).toContain('of 51 completed');
    expect(html).toContain('9007199254740993.123456789012345678');
    expect(html).not.toContain('Progress pending');
  });
});
