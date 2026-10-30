import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';
import CommunityLoadingState from '@/components/shared/CommunityLoadingState';
import { loadingQuotes } from '@/components/shared/loadingQuotes';
import PostDeployLoadingScreen from '@/components/shared/PostDeployLoadingScreen';

// Keep status semantics and real component effects in this layout-free host.
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children, ...props }) => <div {...props}>{children}</div>,
  Text: ({ children, ...props }) => <span {...props}>{children}</span>,
  VisuallyHidden: ({ children }) => <span>{children}</span>,
  VStack: ({ children }) => <div>{children}</div>,
  Button: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
}));
let host;
beforeEach(() => { vi.useFakeTimers(); host = createParityHost(); });
afterEach(async () => { await host.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const status = () => host.nodes().find(node => host.props(node)?.role === 'status');
const hidden = () => host.nodes().find(node => host.props(node)?.['aria-hidden'] === true && host.props(node)?.visibility === 'hidden');

it('hides inline status for 200ms, announces once, and cleans up on readiness', async () => {
  await host.render(<CommunityLoadingState label="Loading tasks…" />);
  expect(hidden()).toBeDefined();
  await act(async () => vi.advanceTimersByTime(199));
  expect(hidden()).toBeDefined();
  await act(async () => vi.advanceTimersByTime(1));
  expect(hidden()).toBeUndefined();
  expect(host.nodes().filter(node => host.props(node)?.role === 'status')).toHaveLength(1);
  expect(status().textContent).toBe('Loading tasks…');
  await host.render(<div>Tasks ready</div>);
  expect(status()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans up a short wait without delaying ready content', async () => {
  await host.render(<CommunityLoadingState />);
  await act(async () => vi.advanceTimersByTime(50));
  await host.render(<div>Ready</div>);
  expect(host.container.textContent).toBe('Ready');
  expect(vi.getTimerCount()).toBe(0);
});

it('renders without organization providers and shows fullscreen status with recovery outside its live region', async () => {
  await host.render(<CommunityLoadingState fullScreen description="Please wait"><button>Retry</button></CommunityLoadingState>);
  expect(hidden()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  expect(status().textContent).toContain('Please wait');
  expect(status().textContent).not.toContain('Retry');
  expect(host.button('Retry')).toBeDefined();
});

it('keeps one original reflection stable across a mounted wait, outside the live status', async () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  await host.render(<CommunityLoadingState fullScreen label="Loading tasks…" />);
  const reflection = loadingQuotes[0];
  expect(host.container.textContent).toContain(reflection);
  expect(loadingQuotes.filter(quote => host.container.textContent.includes(quote))).toEqual([reflection]);
  expect(status().textContent).toBe('Loading tasks…');

  random.mockReturnValue(0.99);
  await host.render(<CommunityLoadingState fullScreen label="Still loading tasks…" description="Please wait" />);
  await act(async () => vi.advanceTimersByTime(10000));
  expect(host.container.textContent).toContain(reflection);
  expect(host.container.textContent).not.toContain(loadingQuotes[loadingQuotes.length - 1]);
  expect(host.nodes().filter(node => host.props(node)?.role === 'status')).toHaveLength(1);
  expect(status().textContent).toBe('Still loading tasks…Please wait');
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps post-creation refresh available after the timeout and clears the timer', async () => {
  const reload = vi.fn();
  window.location = { reload };
  await host.render(<PostDeployLoadingScreen orgName="Test6" />);
  expect(status().textContent).toContain('Preparing Test6');
  expect(host.button('Refresh Page')).toBeUndefined();
  await act(async () => vi.advanceTimersByTime(59999));
  expect(host.button('Refresh Page')).toBeUndefined();
  await act(async () => vi.advanceTimersByTime(1));
  expect(status().textContent).toContain('Taking a little longer');
  await host.click(host.button('Refresh Page'));
  expect(reload).toHaveBeenCalledOnce();
  await host.render(<div>Ready</div>);
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels post-creation recovery when the organization becomes ready', async () => {
  await host.render(<PostDeployLoadingScreen />);
  expect(status().textContent).toContain('Preparing your organization');
  await act(async () => vi.advanceTimersByTime(1000));
  await host.render(<div>Organization ready</div>);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTime(60000));
  expect(host.container.textContent).toBe('Organization ready');
  expect(host.button('Refresh Page')).toBeUndefined();
});

// These eager fallbacks must remain usable before organization providers load.
// Check their complete local dependency surface so an indirect data import also fails.
it('keeps the early loading dependency graph limited to presentation modules', () => {
  const allowed = new Set(['react', '@chakra-ui/react', '@emotion/react', '@/components/shared/PulseLoader', '@/components/shared/loadingQuotes']);
  for (const file of ['CommunityLoadingState.jsx', 'PulseLoader.jsx', 'loadingQuotes.js']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    const dependencies = [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)(['"])([^'"]+)\1/g)].map(match => match[2]);
    expect(dependencies.filter(dependency => !allowed.has(dependency))).toEqual([]);
  }
});
