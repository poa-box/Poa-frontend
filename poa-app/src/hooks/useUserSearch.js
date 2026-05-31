/**
 * useUserSearch Hook
 * Reusable hook for searching users by username or wallet address
 * Auto-detects input type and performs debounced searches
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import apolloClient from '@/util/apolloClient';
import { FETCH_USERNAME_NEW } from '@/util/queries';
import { searchUsersByUsernameAcrossChains } from '@/util/crossChainUsername';

// Username validation regex (alphanumeric + underscore)
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
// Minimum characters before we run an as-you-type partial search.
const MIN_QUERY_LENGTH = 2;

// Address validation regex (0x followed by 40 hex chars)
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Detect input type (username or address)
 * @param {string} input - The search input
 * @returns {'username' | 'address' | null}
 */
function detectInputType(input) {
  if (!input || input.trim().length === 0) return null;

  const trimmed = input.trim();

  // Check if it's an Ethereum address
  if (ADDRESS_REGEX.test(trimmed)) {
    return 'address';
  }

  // Check if it could be a username fragment (alphanumeric + underscore, 2+ chars)
  if (USERNAME_REGEX.test(trimmed) && trimmed.length >= MIN_QUERY_LENGTH) {
    return 'username';
  }

  return null;
}

/**
 * Truncate an Ethereum address for display
 * @param {string} address
 * @returns {string}
 */
function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Hook to search for users by username or wallet address
 * @param {Object} options - Hook options
 * @param {number} options.debounceMs - Debounce delay in ms (default: 500)
 * @returns {Object} Search state and utilities
 */
export function useUserSearch({ debounceMs = 300 } = {}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);

  // Detect input type (memoized)
  const inputType = useMemo(() => detectInputType(searchQuery), [searchQuery]);

  // Debounced search effect
  useEffect(() => {
    // Clear results if no valid input
    if (!inputType) {
      setSearchResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    // Start searching indicator immediately for UX
    setIsSearching(true);
    setError(null);

    // Guard against out-of-order resolution while typing: a slower earlier
    // request must not overwrite the results of a newer one.
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        if (inputType === 'address') {
          // Exact address lookup — get username if one is registered.
          const { data } = await apolloClient.query({
            query: FETCH_USERNAME_NEW,
            variables: { id: searchQuery.trim().toLowerCase() },
            fetchPolicy: 'network-only',
          });
          if (cancelled) return;

          // An address is always a valid target, even without a username.
          setSearchResults([{
            address: searchQuery.trim().toLowerCase(),
            username: data?.account?.username || null,
          }]);
          setError(null);
        } else {
          // Partial username search across ALL chains — returns a ranked list.
          const results = await searchUsersByUsernameAcrossChains(searchQuery.trim());
          if (cancelled) return;

          setSearchResults(results);
          setError(results.length === 0 ? 'No users found' : null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[useUserSearch] Search failed:', err);
        setSearchResults([]);
        setError('Search failed. Please try again.');
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, inputType, debounceMs]);

  // Clear function
  const clear = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  // Helper text based on current state
  const helperText = useMemo(() => {
    if (error) return null; // Error shown separately
    if (searchResults.length > 0) return null; // Results shown separately
    if (isSearching) return 'Searching...';
    if (searchQuery && !inputType) {
      return 'Enter a username (2+ chars) or wallet address (0x...)';
    }
    return null;
  }, [searchQuery, inputType, isSearching, error, searchResults]);

  return {
    // Input state
    searchQuery,
    setSearchQuery,

    // Result state
    searchResults,
    isSearching,
    error,

    // Validation
    isValidInput: inputType !== null,
    inputType,

    // Utilities
    clear,
    helperText,
    truncateAddress,
  };
}

export default useUserSearch;
