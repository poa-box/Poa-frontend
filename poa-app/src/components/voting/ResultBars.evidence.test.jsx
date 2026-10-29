import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it } from 'vitest';
import { ResultBars } from '@/components/voting/ResultBars';

const render = options => renderToStaticMarkup(<ChakraProvider><ResultBars options={options} /></ChakraProvider>);
describe('vote total evidence display', () => {
  it('labels partial percentages and displays unavailable totals without inventing zero percent', () => {
    expect(render([{ name: 'Agree', percentage: 75, approximate: true, votes: 3 }])).toContain('~75%');
    const unknown = render([{ name: 'Agree', percentage: null, tallyUnavailable: true, votes: 0 }]);
    expect(unknown).toContain('Votes unavailable');
    expect(unknown).toContain('—');
    expect(unknown).not.toContain('>0%<');
  });
});
