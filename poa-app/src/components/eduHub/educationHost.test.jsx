import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { hasValidModuleReward, prepareModuleForm, moduleRewardLabel } from '@/lib/tasks/educationForm';
import { EducationService } from '@/services/web3/domain/EducationService';
import CreateModuleModal from '@/components/eduHub/CreateModuleModal';
import QuizModal from '@/components/eduHub/QuizModal';
import EducationHub from '@/components/eduHub/EducationHub';

const state = vi.hoisted(() => ({ label: undefined }));
vi.mock('@chakra-ui/react', async () => {
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.useDisclosure = () => ({ isOpen: true, onOpen() {}, onClose() {} });
  return chakra;
});
vi.mock('@chakra-ui/icons', () => ({ ArrowForwardIcon: () => null, CheckIcon: () => null }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ tokenLabel: state.label,
  orgStatus: 'ready', educationHubEnabled: true, poContextLoading: false,
  educationModules: [{ id: '1', moduleId: '1', name: 'Shared learning', payout: '1.000000000000000001',
    question: 'How?', answers: [{ index: 0, answer: 'Together' }] }] }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ isPasskeyUser: true, isAuthHydrated: true, accountAddress: `0x${'34'.repeat(20)}` }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ completedModules: [], isAccountReady: true }) }));
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ chain: { id: 100 } }), useSwitchChain: () => ({ switchChainAsync: vi.fn() }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({ education: null, executeWithNotification: vi.fn() }) }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/shared/CommunityLoadingState', () => ({ default: () => null }));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/hooks/useOrgTheme', () => ({ useOrgTheme: () => ({ pageBackground: () => 'black' }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useEducationCreateGate', () => ({ useEducationCreateGate: () => ({ canCreateModule: true }) }));
vi.mock('@/features/tour', () => ({ useTour: () => ({ isActive: false }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const HUB = `0x${'12'.repeat(20)}`;
beforeEach(() => { state.label = undefined; });
describe('actual learning UI labels and exact form rewards', () => {
  it.each([
    [{}, 'Shares'], [{ useTokenSymbol: false, symbol: 'MiXeD' }, 'Shares'],
    [{ useTokenSymbol: true, symbol: 'MiXeD' }, 'MiXeD'], [{ useTokenSymbol: true, symbol: '' }, 'Shares'],
    [{ useTokenSymbol: true }, 'Shares'],
  ])('keeps configured labels in create forms, quiz dialogs and the library: %s', (config, expected) => {
    state.label = resolveTokenLabel(config);
    const create = renderToStaticMarkup(React.createElement(CreateModuleModal, { isOpen: true, onClose() {} }));
    const quiz = renderToStaticMarkup(React.createElement(QuizModal, { module: { id: '1', name: 'Lesson', payout: '0.000000000000000001', answers: [] } }));
    const library = renderToStaticMarkup(React.createElement(EducationHub));
    expect(create).toContain(`>${expected}<`);
    expect(quiz).toContain(`0.000000000000000001 ${expected}`);
    expect(library).toContain(`earn ${expected} along the way.`);
    expect(library).toContain('1.000000000000000001');
  });
  it.each(['0.000000000000000001', '1.000000000000000001', '9007199254740993.123456789012345678'])('passes %s from the form to the canonical builder without Number conversion', async payout => {
    const form = prepareModuleForm({ title: ' Shared knowledge ', description: ' A resource ', link: '', question: ' How? ',
      answers: [' Together ', ' Alone '], correctAnswerIndex: 0, payout });
    const execute = vi.fn().mockResolvedValue({ success: true });
    const service = new EducationService({ createWritable: (address, abi) => ({ address, abi }) }, { execute });
    await service.createModule(HUB, form);
    expect(form.payout).toBe(payout);
    expect(execute.mock.calls[0][2][2].toString()).toBe((BigInt(payout.split('.')[0]) * 10n ** 18n
      + BigInt((payout.split('.')[1] || '').padEnd(18, '0'))).toString());
    expect(form.answers).toEqual([['Together', 'Alone']]);
  });
  it.each(['0', '-1', '1e3', ' 1', '1.0000000000000000001', 'NaN'])('rejects malformed reward %s before storage or execution', value => {
    expect(hasValidModuleReward(value)).toBe(false);
  });
  it('checks scope after pinning and never sends an old-scope module', async () => {
    let current = true;
    const assertCurrent = () => { if (!current) throw new Error('Your account changed.'); };
    const execute = vi.fn();
    const pin = vi.fn(async () => { current = false; return { path: 'QmZtnFaddFtzGNT8BxdHVbQrhSFdq1pWxud5z4fA4kxfDt' }; });
    const service = new EducationService({ createWritable: vi.fn() }, { execute }, { addToIpfs: pin });
    await expect(service.createModule(HUB, { name: 'Lesson', payout: '1', correctAnswers: [0] }, { assertCurrent })).rejects.toThrow(/changed/);
    expect(execute).not.toHaveBeenCalled();
  });
  it('renders raw library rewards exactly and keeps invalid amounts unknown', () => {
    expect(moduleRewardLabel({ payoutRaw: '1', payout: '0' })).toBe('0.000000000000000001');
    expect(moduleRewardLabel({ payoutRaw: '9007199254740993123456789012345678' })).toBe('9007199254740993.123456789012345678');
    expect(moduleRewardLabel({ payoutRaw: 'unavailable' })).toBe('—');
  });
});
