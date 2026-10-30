import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { mountedHostDocument, mountedNodes } from '@/test/mountedHost';

// No Chakra mock and no ChakraProvider: this is the outermost _app boundary.
let root, container, fail, reload, errors;
function Child() {
  if (fail) throw new Error('Original child failure');
  return <p>Recovered child</p>;
}
const button = label => mountedNodes(container).find(node => node.tagName === 'BUTTON' && node.textContent === label);
beforeEach(() => {
  fail = true; reload = vi.fn(); errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const doc = mountedHostDocument(); container = doc.createElement('main');
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { document: doc, HTMLIFrameElement: class {}, location: { reload }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  expect(fetch).not.toHaveBeenCalled();
  errors.mockRestore(); vi.unstubAllGlobals();
});
describe('outer error boundary without a theme provider', () => {
  it('catches an actual thrown child, renders safely, reloads, and resets the mounted child', async () => {
    await act(() => root.render(<ErrorBoundary><Child /></ErrorBoundary>));
    expect(container.textContent).toContain('Something went wrong');
    expect(button('Try Again')).toBeDefined(); expect(button('Reload Page')).toBeDefined();
    expect(errors.mock.calls.some(args => args[0] === 'ErrorBoundary caught an error:' && args[1].message === 'Original child failure')).toBe(true);
    await act(() => button('Reload Page').click());
    expect(reload).toHaveBeenCalledOnce();
    await act(() => button('Try Again').click());
    expect(container.textContent).toContain('Something went wrong');
    fail = false;
    await act(() => button('Try Again').click());
    expect(container.textContent).toBe('Recovered child');
    expect(button('Reload Page')).toBeUndefined();
  });
});
