/**
 * FolderTreeEditor
 *
 * Edit-mode for the folder tree. Renders the tree as a list with per-row
 * controls (rename, add child, delete, reparent via dropdown), plus a
 * project assignment picker. Save pins JSON to IPFS and calls setFolders
 * CAS-guarded against the root the doc was loaded from.
 *
 * On FoldersRootStale: opens a conflict modal showing the current on-chain
 * tree vs the user's pending edits. The user can discard their edits and
 * start over (MVP). Auto-merge intentionally deferred per spec.
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Button,
  IconButton,
  Input,
  Select,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Alert,
  AlertIcon,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Divider,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';

import { useIPFScontext } from '@/context/ipfsContext';
import { useWeb3 } from '@/hooks';
import { usePOContext } from '@/context/POContext';
import { useProjectContext } from '@/context/ProjectContext';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';

import { validateFolderDoc, FOLDERS_SCHEMA_VERSION } from '@/lib/folders/schema';
import {
  computeSortOrder,
  descendantsOf,
  generateFolderId,
  moveProject,
  unassignedProjectIds,
} from '@/lib/folders/tree';
import { parseFoldersRootStale } from '@/lib/folders/cas';
import { useRefreshEmit, RefreshEvent } from '@/context/RefreshContext';
import FolderTreeView from './FolderTreeView';
import { useFolderDoc } from './useFolderDoc';

function FolderRow({ folder, allFolders, projects, depth, onChange, onDelete }) {
  const disallowed = useMemo(() => descendantsOf(allFolders, folder.id), [allFolders, folder.id]);
  const candidates = allFolders.filter((f) => !disallowed.has(f.id));

  return (
    <Box pl={depth * 4} py={2} borderBottom="1px solid" borderColor="whiteAlpha.100">
      <HStack align="flex-start" spacing={2}>
        <Input
          size="sm"
          value={folder.name}
          placeholder="Folder name"
          onChange={(e) =>
            onChange({ ...folder, name: e.target.value })
          }
          maxW="240px"
        />
        <Select
          size="sm"
          value={folder.parentId ?? ''}
          maxW="220px"
          onChange={(e) => {
            const next = e.target.value === '' ? null : e.target.value;
            // Recompute sortOrder among NEW siblings so the move lands at the end.
            const newSiblings = allFolders
              .filter((f) => f.parentId === next && f.id !== folder.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const newSort = computeSortOrder(newSiblings, newSiblings.length);
            onChange({ ...folder, parentId: next, sortOrder: newSort });
          }}
        >
          <option value="">(top level)</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.id.slice(0, 10)}
            </option>
          ))}
        </Select>

        <Tooltip label="Delete folder">
          <IconButton
            aria-label="Delete folder"
            size="sm"
            icon={<DeleteIcon />}
            variant="ghost"
            colorScheme="red"
            onClick={() => onDelete(folder.id)}
          />
        </Tooltip>
      </HStack>

      {/* Project assignments for this folder */}
      <Wrap mt={2} spacing={2}>
        {(folder.projectIds || []).map((pid) => {
          const proj = projects.find((p) => p.id === pid);
          return (
            <WrapItem key={pid}>
              <Tag size="sm" colorScheme="blue" borderRadius="full">
                <TagLabel>{proj?.name || pid.slice(0, 10) + '…'}</TagLabel>
                <TagCloseButton
                  onClick={() =>
                    onChange({
                      ...folder,
                      projectIds: (folder.projectIds || []).filter((p) => p !== pid),
                    })
                  }
                />
              </Tag>
            </WrapItem>
          );
        })}
      </Wrap>
    </Box>
  );
}

export default function FolderTreeEditor({ isOpen, onClose, foldersRoot }) {
  const toast = useToast();
  const { addToIpfs } = useIPFScontext();
  const { task: taskService, executeWithNotification } = useWeb3();
  const { taskManagerContractAddress } = usePOContext();
  const { projects = [] } = useProjectContext() || {};
  const { emit } = useRefreshEmit();

  const { doc: loadedDoc, loading, error, loadedRoot } = useFolderDoc(foldersRoot);

  // Working copy of folder state. Initialised from the loaded doc each time
  // the modal opens so re-opens always start from the latest on-chain root.
  const [folders, setFolders] = useState([]);
  const [savingError, setSavingError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null); // { actualRoot, theirDoc }

  React.useEffect(() => {
    if (isOpen) {
      setFolders((loadedDoc?.folders || []).map((f) => ({ ...f })));
      setSavingError(null);
      setConflict(null);
      setSaving(false);
    }
  }, [isOpen, loadedDoc]);

  const updateFolder = (next) =>
    setFolders((prev) => prev.map((f) => (f.id === next.id ? next : f)));

  const addFolder = (parentId = null) => {
    const siblings = folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const sortOrder = computeSortOrder(siblings, siblings.length);
    const newFolder = {
      id: generateFolderId(),
      name: '',
      parentId,
      sortOrder,
      projectIds: [],
    };
    setFolders((prev) => [...prev, newFolder]);
  };

  const deleteFolder = (folderId) => {
    // Drops the entire subtree. Users who want to keep children should
    // reparent them first; we don't auto-promote because that would silently
    // change the parent association of unrelated rows.
    const toRemove = descendantsOf(folders, folderId);
    setFolders((prev) => prev.filter((f) => !toRemove.has(f.id)));
  };

  const handleAssignProject = (folderId, projectId) => {
    setFolders((prev) => moveProject(prev, projectId, folderId));
  };

  const dirty = useMemo(() => {
    const a = JSON.stringify(loadedDoc?.folders || []);
    const b = JSON.stringify(folders);
    return a !== b;
  }, [loadedDoc, folders]);

  const unassigned = useMemo(
    () => unassignedProjectIds(folders, projects.map((p) => p.id)),
    [folders, projects]
  );

  const handleSave = async () => {
    if (saving) return; // double-click guard
    setSavingError(null);
    setConflict(null);

    const docToPin = { schemaVersion: FOLDERS_SCHEMA_VERSION, folders };
    const { valid, errors } = validateFolderDoc(docToPin);
    if (!valid) {
      setSavingError(new Error(errors.join(' ')));
      return;
    }

    if (!taskService || !taskManagerContractAddress) {
      setSavingError(new Error('Web3 not ready.'));
      return;
    }
    if (loadedRoot === null) {
      // Defensive: prop is set but IPFS fetch hasn't populated loadedRoot yet.
      // Saving with a wrong expected root would just trigger CAS — but the
      // user would see a misleading "conflict" when really we just hadn't
      // finished loading. Block instead.
      setSavingError(new Error('Folder tree is still loading — wait a moment and retry.'));
      return;
    }

    setSaving(true);
    let newRoot;
    try {
      const pinResult = await addToIpfs(JSON.stringify(docToPin));
      newRoot = ipfsCidToBytes32(pinResult.path);
    } catch (e) {
      setSaving(false);
      setSavingError(e);
      return;
    }

    const result = await executeWithNotification(
      () => taskService.setFolders(taskManagerContractAddress, loadedRoot, newRoot),
      {
        pendingMessage: 'Publishing folder tree...',
        successMessage: 'Folder tree updated.',
        refreshEvent: RefreshEvent.FOLDERS_UPDATED,
      }
    );
    setSaving(false);

    if (result?.success) {
      onClose();
      return;
    }

    // Distinguish CAS staleness from other failures.
    const stale = parseFoldersRootStale(result?.error);
    if (stale) {
      try {
        const actualRoot = stale.actual || (await taskService.readFoldersRoot(taskManagerContractAddress));
        setConflict({ actualRoot });
      } catch (e) {
        setConflict({ actualRoot: null });
        setSavingError(e);
      }
      return;
    }

    setSavingError(result?.error || new Error('Failed to publish folder tree.'));
  };

  const handleDiscardAndReload = () => {
    setConflict(null);
    // Force the parent page (and any other listeners) to re-pull the latest
    // on-chain root. Without this, re-opening the editor would re-collide
    // with the same stale `expectedRoot` and CAS would fail again.
    emit(RefreshEvent.FOLDERS_UPDATED, { source: 'cas-discard' });
    onClose();
    toast({
      title: 'Reloaded',
      description: 'Pulled the latest folder tree. Re-open editor to retry your edits.',
      status: 'info',
      duration: 4000,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Edit folder tree</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {loading && <Text color="gray.500">Loading current tree...</Text>}
          {error && (
            <Alert status="error" mb={3} borderRadius="md">
              <AlertIcon />
              {error.message}
            </Alert>
          )}

          {savingError && (
            <Alert status="error" mb={3} borderRadius="md">
              <AlertIcon />
              {savingError.message || String(savingError)}
            </Alert>
          )}

          <VStack align="stretch" spacing={2}>
            <HStack justify="space-between">
              <Text fontSize="sm" color="gray.500">
                {folders.length} folder{folders.length === 1 ? '' : 's'} · {unassigned.length} unassigned project{unassigned.length === 1 ? '' : 's'}
              </Text>
              <Button size="sm" leftIcon={<AddIcon />} colorScheme="purple" onClick={() => addFolder(null)}>
                New folder
              </Button>
            </HStack>

            <Divider />

            {folders
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((f) => (
                <FolderRow
                  key={f.id}
                  folder={f}
                  allFolders={folders}
                  projects={projects}
                  depth={0}
                  onChange={updateFolder}
                  onDelete={deleteFolder}
                />
              ))}

            {projects.length > 0 && (
              <>
                <Divider mt={4} />
                <Text fontWeight="600" fontSize="sm" mt={2}>
                  Assign projects to folders
                </Text>
                {projects.map((p) => {
                  const currentFolder = folders.find((f) => (f.projectIds || []).includes(p.id));
                  return (
                    <HStack key={p.id} spacing={2}>
                      <Text fontSize="sm" flex="1" isTruncated>
                        {p.name}
                      </Text>
                      <Select
                        size="sm"
                        maxW="240px"
                        value={currentFolder?.id ?? ''}
                        onChange={(e) =>
                          handleAssignProject(e.target.value === '' ? null : e.target.value, p.id)
                        }
                      >
                        <option value="">(unassigned)</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name || f.id.slice(0, 10)}
                          </option>
                        ))}
                      </Select>
                    </HStack>
                  );
                })}
              </>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} isDisabled={saving}>
            Cancel
          </Button>
          <Button
            colorScheme="purple"
            onClick={handleSave}
            isLoading={saving}
            loadingText="Publishing..."
            isDisabled={!dirty || loading || loadedRoot === null}
          >
            Save & publish
          </Button>
        </ModalFooter>

        {/* Conflict modal: another organizer published while you were editing */}
        <Modal isOpen={!!conflict} onClose={() => setConflict(null)} size="2xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Folder tree out of date</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Alert status="warning" mb={3} borderRadius="md">
                <AlertIcon />
                Another organizer published a new folder tree while you were editing.
                Your changes were NOT saved.
              </Alert>
              <Text fontSize="sm" color="gray.600" mb={2}>
                Current on-chain tree:
              </Text>
              <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={2}>
                <ConflictView actualRoot={conflict?.actualRoot} />
              </Box>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={() => setConflict(null)}>
                Keep my edits open
              </Button>
              <Button colorScheme="purple" onClick={handleDiscardAndReload}>
                Discard mine & reload
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </ModalContent>
    </Modal>
  );
}

function ConflictView({ actualRoot }) {
  const { doc, loading, error } = useFolderDoc(actualRoot);
  if (loading) return <Text fontSize="sm" color="gray.500">Loading current tree...</Text>;
  if (error) return <Text fontSize="sm" color="red.500">{error.message}</Text>;
  return <FolderTreeView doc={doc} />;
}
