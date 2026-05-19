/**
 * useFolderDoc
 * Fetch + parse the org's folder JSON from IPFS, keyed by the current
 * foldersRoot. Returns the validated doc plus the root it was loaded from
 * (needed for the CAS-guarded write path).
 */

import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useIPFScontext } from '@/context/ipfsContext';
import { makeEmptyFolderDoc, validateFolderDoc } from '@/lib/folders/schema';

function isZeroRoot(root) {
  if (!root) return true;
  if (root === ethers.constants.HashZero) return true;
  if (typeof root === 'string' && /^0x0+$/.test(root)) return true;
  return false;
}

export function useFolderDoc(foldersRoot) {
  const { fetchFromIpfs } = useIPFScontext();
  const [doc, setDoc] = useState(makeEmptyFolderDoc());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadedRoot, setLoadedRoot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      if (isZeroRoot(foldersRoot)) {
        setDoc(makeEmptyFolderDoc());
        setLoadedRoot(ethers.constants.HashZero);
        return;
      }
      setLoading(true);
      try {
        const fetched = await fetchFromIpfs(foldersRoot);
        if (cancelled) return;
        const parsed = fetched ?? makeEmptyFolderDoc();
        const { valid, errors } = validateFolderDoc(parsed);
        if (!valid) {
          setError(new Error(errors.join(' ')));
          setDoc(makeEmptyFolderDoc());
        } else {
          setDoc(parsed);
        }
        setLoadedRoot(foldersRoot);
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setDoc(makeEmptyFolderDoc());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [foldersRoot, fetchFromIpfs]);

  return { doc, loading, error, loadedRoot };
}
