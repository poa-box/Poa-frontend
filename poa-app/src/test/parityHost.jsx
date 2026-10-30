import React, { act, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { mountedHostDocument, mountedNodes } from '@/test/mountedHost';

/** Actual React state/effects/events with no layout, network or wallet runtime. */
export function parityChakra(toast = () => {}) {
  const components = {
    useDisclosure: () => {
      const [isOpen, setOpen] = useState(false);
      return { isOpen, onOpen: useCallback(() => setOpen(true), []), onClose: useCallback(() => setOpen(false), []) };
    },
    useToast: () => toast,
    useMediaQuery: () => [false],
  };
  return new Proxy(components, { get(target, name) {
    if (name === 'then') return undefined;
    if (!(name in target)) target[name] = React.forwardRef(function Host({ children, ...props }, ref) {
      if (name === 'Modal' && !props.isOpen) return null;
      const tag = { Button: 'button', Input: 'input', Textarea: 'textarea', Select: 'select', Link: 'a' }[name] || 'div';
      return React.createElement(tag, { ref, onClick: props.onClick, onChange: props.onChange, onSubmit: props.onSubmit,
        disabled: props.isDisabled || props.isLoading, value: props.value, name: props.name,
        'aria-label': props['aria-label'], 'data-component': name }, typeof children === 'function' ? children({}) : children);
    });
    return target[name];
  } });
}

export function createParityHost() {
  const doc = mountedHostDocument(), container = doc.createElement('main');
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { document: doc, HTMLIFrameElement: class {}, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(container);
  const nodes = () => mountedNodes(container);
  const props = node => node[Object.keys(node).find(key => key.startsWith('__reactProps$'))];
  return { container, nodes, props,
    render: element => act(() => root.render(element)),
    unmount: () => act(() => root.unmount()),
    button: label => nodes().find(node => node.tagName === 'BUTTON' && node.textContent === label),
    change: (node, value) => act(() => props(node).onChange({ target: { value } })),
    click: node => act(() => props(node).onClick({ preventDefault() {}, stopPropagation() {} })),
  };
}
