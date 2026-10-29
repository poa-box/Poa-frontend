import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveTokenLabel } from '@/util/tokenLabel';
const host = vi.hoisted(() => ({ slots: [], cursor: 0, effects: new Map(), buttons: [] }));
vi.mock('react', async original => {
  const actual = await original();
  return { ...actual,
    useMemo: fn => { host.cursor++; return fn(); },
    useState: initial => {
      const index = host.cursor++; host.slots[index] ||= { value: initial };
      return [host.slots[index].value, next => { host.slots[index].value = typeof next === 'function' ? next(host.slots[index].value) : next; }];
    },
    useEffect: (fn, deps) => {
      const index = host.cursor++, previous = host.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) host.effects.set(index, () => {
        previous?.cleanup?.(); host.slots[index] = { deps, cleanup: fn() };
      });
    },
  };
});
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(host.buttons));
vi.mock('@chakra-ui/icons', () => ({ AddIcon: () => null, InfoIcon: () => null, ChevronRightIcon: () => null }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgChainId: 100, taskManagerContractAddress: host.contract, tokenLabel: host.label }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectCreator: host.permission, globalRolePermissions: [] }) }));
vi.mock('@/services/web3/utils/publicChainClient', () => ({ createPublicClientForChain: () => { throw new Error('Unexpected RPC'); } }));
vi.mock('@/features/deployer/utils/usernameResolver', () => ({ resolveUsernames: () => { throw new Error('Unexpected lookup'); } }));
import CreateProjectModal from '@/components/TaskManager/CreateProjectModal';
function render() {
  host.buttons.length = 0; host.cursor = 0;
  const html = renderToStaticMarkup(CreateProjectModal({ isOpen: true, onClose: host.close,
    onCreateProject: host.create, defaultName: 'New project' }));
  const effects = [...host.effects.values()]; host.effects.clear(); for (const effect of effects) effect();
  return { html, submit: host.buttons.find(button => button.children === 'Create Project') };
}
beforeEach(() => {
  host.slots = []; host.effects = new Map(); host.permission = undefined; host.label = undefined;
  host.contract = `0x${'12'.repeat(20)}`; host.create = vi.fn(async () => ({ success: true })); host.close = vi.fn();
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected network'); });
});
afterEach(() => { host.slots.forEach(slot => slot?.cleanup?.()); vi.unstubAllGlobals(); });
it('keeps unknown and denied distinct, and submits only after current creator evidence allows it', async () => {
  render();
  let view = render();
  expect(view.html).toContain('Checking project creation permissions'); expect(view.submit.isDisabled).toBe(true);
  await view.submit.onClick(); expect(host.create).not.toHaveBeenCalled();
  host.permission = { state: 'unknown', code: 'SETTINGS_UNAVAILABLE' };
  view = render(); expect(view.submit.isDisabled).toBe(true);
  host.permission = { state: 'known', value: false };
  view = render(); expect(view.html).toContain('does not have permission'); expect(view.html).not.toContain('Checking project');
  await view.submit.onClick(); expect(host.create).not.toHaveBeenCalled();
  host.permission = { state: 'known', value: true };
  view = render(); expect(view.submit.isDisabled).toBe(false);
  await view.submit.onClick();
  expect(host.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'New project', createHats: [], claimHats: [], reviewHats: [], assignHats: [] }));
});
it('withdraws submit while a replacement permission scope settles and preserves a settled denial', async () => {
  host.permission = { state: 'known', value: true }; render();
  expect(render().submit.isDisabled).toBe(false);
  // The provider withdraws its old scoped fact synchronously (tested by the hook regressions).
  host.permission = undefined;
  let view = render(); expect(view.submit.isDisabled).toBe(true);
  await view.submit.onClick(); expect(host.create).not.toHaveBeenCalled();
  host.permission = { state: 'known', value: false };
  view = render(); expect(view.submit.isDisabled).toBe(true); expect(view.html).toContain('does not have permission');
});

it.each([
  [undefined, 'Shares'],
  [{ useTokenSymbol: false, symbol: 'MiXeD' }, 'Shares'],
  [{ useTokenSymbol: true, symbol: 'MiXeD' }, 'MiXeD'],
  [{ useTokenSymbol: true, symbol: '' }, 'Shares'],
  [{ useTokenSymbol: true }, 'Shares'],
])('preserves the configured ownership label while creation permissions settle: %s', (settings, expected) => {
  host.label = settings ? resolveTokenLabel(settings) : undefined;
  expect(render().html).toContain(`${expected} Budget Cap`);
});
