/**
 * useFolderDoc
 * Fetch + parse the org's folder JSON from IPFS, keyed by the current
 * foldersRoot. Returns the validated doc plus the root it was loaded from
 * (needed for the CAS-guarded write path).
 */

import { useEffect, useState } from 'react';
import { ZERO_FOLDER_ROOT } from '@/lib/folders/constants';
import { useIPFScontext } from '@/context/ipfsContext';
import { makeEmptyFolderDoc, validateFolderDoc } from '@/lib/folders/schema';

function isZeroRoot(root) {
  if (!root) return true;
  if (root === ZERO_FOLDER_ROOT) return true;
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
      setLoadedRoot(null);
      if (foldersRoot == null) {
        setDoc(makeEmptyFolderDoc());
        setLoading(false);
        return;
      }
      if (isZeroRoot(foldersRoot)) {
        setDoc(makeEmptyFolderDoc());
        setLoadedRoot(ZERO_FOLDER_ROOT);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const fetched = await fetchFromIpfs(foldersRoot);
        if (cancelled) return;
        if (!fetched) throw new Error('The saved folder tree is unavailable. Please try again.');
        const parsed = fetched;
        const { valid, errors } = validateFolderDoc(parsed);
        if (!valid) {
          setError(new Error(errors.join(' ')));
          setDoc(makeEmptyFolderDoc());
        } else {
          setDoc(parsed);
        }
        if (valid) setLoadedRoot(foldersRoot);
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

  const current = loadedRoot === foldersRoot || (foldersRoot != null && isZeroRoot(foldersRoot) && loadedRoot === ZERO_FOLDER_ROOT);
  return { doc: current ? doc : null, loading, error, loadedRoot: current ? loadedRoot : null };
}
