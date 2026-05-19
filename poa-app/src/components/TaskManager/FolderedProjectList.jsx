/**
 * FolderedProjectList
 *
 * Renders the org's projects grouped under their folder tree (TaskManager v4)
 * inside ProjectSidebar. Each folder section is collapsible; the existing
 * DraggableProject component renders unchanged inside.
 *
 * Behaviour:
 *  - Search filters projects globally (parent passes pre-filtered list);
 *    any folder containing a match is auto-expanded.
 *  - On mount / selection-change, the ancestor chain of the selected
 *    project's folder is auto-expanded so users land on it visible.
 *  - Projects not assigned to any folder land in a virtual "Unsorted"
 *    bucket at the top (matches the spec).
 *
 * Drag-drop into folders is INTENTIONALLY not wired here — every move
 * is a separate setFolders tx, so reorganization lives in the editor
 * modal where changes batch into one publish. This component is read-only
 * for the folder structure; project drag-delete still works (DraggableProject
 * keeps its existing useDrag wiring → TrashBin).
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Box, Flex, Text, Badge, Icon, IconButton, Collapse, VStack } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { FaFolder, FaFolderOpen } from 'react-icons/fa';

import DraggableProject from './DraggableProject';
import {
  ancestorsOf,
  buildTree,
  folderContainingProject,
  unassignedProjectIds,
} from '@/lib/folders/tree';
import { parseProjectId } from '@/services/web3/utils/encoding';

/**
 * Subset of projects that fall under `folderProjectIds`, in the order
 * those ids appear in the folder (preserves the organizer's intent).
 * `folderProjectIds` are bytes32 (per spec); `projectsByPid` keys are too.
 */
function projectsInFolder(folderProjectIds, projectsByPid) {
  const out = [];
  for (const pid of folderProjectIds || []) {
    const p = projectsByPid.get(pid);
    if (p) out.push(p);
  }
  return out;
}

function FolderSection({
  node,
  depth,
  projectsByPid,
  visiblePids,
  getIsExpanded,
  onToggle,
  isProjectSelected,
  onSelectProject,
  onDeleteProject,
}) {
  const isExpanded = getIsExpanded(node.id);

  // Projects directly in this folder, filtered by current search.
  // folder.projectIds is bytes32; visiblePids likewise.
  const directProjects = projectsInFolder(node.projectIds || [], projectsByPid).filter((p) =>
    visiblePids.has(parseProjectId(p.id))
  );

  // Recurse: are any descendant folders going to show something?
  // Used to keep folder-only branches collapsible without empty noise.
  const visibleChildCount = useMemo(() => {
    let count = 0;
    const walk = (n) => {
      for (const pid of n.projectIds || []) {
        if (visiblePids.has(pid)) count++;
      }
      for (const c of n.children) walk(c);
    };
    walk(node);
    return count;
  }, [node, visiblePids]);

  const hasContent = directProjects.length > 0 || node.children.length > 0;

  return (
    <Box w="100%">
      <Flex
        align="center"
        py={1.5}
        pl={`${depth * 12 + 6}px`}
        pr={2}
        my={0.5}
        borderRadius="md"
        borderLeft="3px solid"
        borderLeftColor={isExpanded ? 'purple.300' : 'whiteAlpha.200'}
        bg={isExpanded ? 'whiteAlpha.50' : 'transparent'}
        cursor={hasContent ? 'pointer' : 'default'}
        onClick={() => hasContent && onToggle(node.id)}
        transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
        _hover={hasContent ? { bg: 'whiteAlpha.100' } : undefined}
      >
        <IconButton
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
          icon={isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          size="xs"
          variant="ghost"
          color="whiteAlpha.700"
          isDisabled={!hasContent}
          mr={1}
          onClick={(e) => {
            e.stopPropagation();
            if (hasContent) onToggle(node.id);
          }}
        />
        <Icon
          as={isExpanded ? FaFolderOpen : FaFolder}
          color={isExpanded ? 'purple.300' : 'gray.400'}
          mr={2}
          boxSize={3.5}
          flexShrink={0}
        />
        <Text
          color="white"
          fontSize="sm"
          fontWeight={isExpanded ? '600' : '500'}
          flex="1"
          isTruncated
        >
          {node.name || (
            <Text as="span" color="gray.500" fontStyle="italic">
              Untitled folder
            </Text>
          )}
        </Text>
        {visibleChildCount > 0 && (
          <Badge
            ml={1}
            px={2}
            py={0.5}
            borderRadius="full"
            bg="whiteAlpha.100"
            color="whiteAlpha.700"
            border="1px solid"
            borderColor="whiteAlpha.200"
            fontSize="0.65rem"
            fontWeight="500"
          >
            {visibleChildCount}
          </Badge>
        )}
      </Flex>

      <Collapse in={isExpanded} animateOpacity unmountOnExit>
        <Box pl={`${depth * 12 + 18}px`} pr={1} py={1}>
          <VStack spacing={1.5} align="stretch">
            {directProjects.map((project) => (
              <DraggableProject
                key={project.id}
                project={project}
                isSelected={isProjectSelected(project.id)}
                onSelectProject={onSelectProject}
                onDeleteProject={onDeleteProject}
              />
            ))}
            {node.children.map((child) => (
              <FolderSection
                key={child.id}
                node={child}
                depth={depth + 1}
                projectsByPid={projectsByPid}
                visiblePids={visiblePids}
                getIsExpanded={getIsExpanded}
                onToggle={onToggle}
                isProjectSelected={isProjectSelected}
                onSelectProject={onSelectProject}
                onDeleteProject={onDeleteProject}
              />
            ))}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default function FolderedProjectList({
  folders,
  projects,
  filteredProjects,
  selectedProject,
  onSelectProject,
  onDeleteProject,
  searchTerm,
}) {
  // folder.projectIds and the folder tree's API both deal in bytes32
  // (the spec's canonical project id). Subgraph hands us composite ids;
  // normalize once here and keep the rest of the file in bytes32 land.
  const projectsByPid = useMemo(() => {
    const m = new Map();
    for (const p of projects) m.set(parseProjectId(p.id), p);
    return m;
  }, [projects]);

  const visiblePids = useMemo(
    () => new Set((filteredProjects || projects).map((p) => parseProjectId(p.id))),
    [filteredProjects, projects]
  );

  // Defensive: if a pre-fix folder doc was pinned with composite project
  // ids ("{tm}-{bytes32}"), normalize on read so visibility/lookups still
  // resolve. parseProjectId is idempotent on bytes32 so this is a no-op
  // for spec-compliant docs.
  const normalizedFolders = useMemo(
    () =>
      folders.map((f) => ({
        ...f,
        projectIds: (f.projectIds || []).map((pid) => parseProjectId(pid)),
      })),
    [folders]
  );

  const tree = useMemo(() => buildTree(normalizedFolders), [normalizedFolders]);

  // Folders containing at least one currently-visible project — used to
  // auto-expand search hits. Comparisons are bytes32 throughout.
  const foldersWithVisible = useMemo(() => {
    const out = new Set();
    for (const f of normalizedFolders) {
      const hit = (f.projectIds || []).some((pid) => visiblePids.has(pid));
      if (hit) {
        out.add(f.id);
        for (const ancestor of ancestorsOf(normalizedFolders, f.id)) out.add(ancestor);
      }
    }
    return out;
  }, [normalizedFolders, visiblePids]);

  // Ancestor chain of the selected project's folder — auto-expand so the
  // user lands on a visible row.
  const selectedAncestors = useMemo(() => {
    if (!selectedProject?.id) return new Set();
    const selectedPid = parseProjectId(selectedProject.id);
    const folderId = folderContainingProject(normalizedFolders, selectedPid);
    if (!folderId) return new Set();
    const chain = ancestorsOf(normalizedFolders, folderId);
    chain.add(folderId);
    return chain;
  }, [normalizedFolders, selectedProject?.id]);

  // User-intent overrides keyed by folder id (`true` = explicitly opened,
  // `false` = explicitly closed, absent = follow auto rule). The original
  // implementation kept a single `expanded` Set and pushed auto-expand
  // additions into it from a useEffect — but `filteredProjects` is a new
  // array reference per search keystroke, so the effect would fire every
  // keystroke and re-add ids the user had just collapsed. Deriving
  // visibility instead of mutating state makes user collapses survive
  // every render, no matter how often the auto-rule inputs churn.
  const [overrides, setOverrides] = useState(() => new Map());

  const autoExpanded = useMemo(() => {
    const out = new Set();
    for (const id of foldersWithVisible) out.add(id);
    for (const id of selectedAncestors) out.add(id);
    return out;
  }, [foldersWithVisible, selectedAncestors]);

  const getIsExpanded = useCallback(
    (id) => {
      if (overrides.has(id)) return overrides.get(id);
      return autoExpanded.has(id);
    },
    [overrides, autoExpanded]
  );

  const onToggle = useCallback(
    (id) => {
      setOverrides((prev) => {
        const next = new Map(prev);
        const currentlyExpanded = next.has(id) ? next.get(id) : autoExpanded.has(id);
        next.set(id, !currentlyExpanded);
        return next;
      });
    },
    [autoExpanded]
  );

  const isProjectSelected = useCallback(
    (projectId) => Boolean(selectedProject && selectedProject.id === projectId),
    [selectedProject]
  );

  // Projects with no folder assignment, intersected with the visible
  // (search-filtered) set. Per product feedback we render these as plain
  // DraggableProject rows above the folder sections — no collapsible
  // "Unsorted" header. The right mental model is: an unsorted project is
  // a regular project that the organizer hasn't placed yet, not a
  // pseudo-folder you have to click into.
  const unsorted = useMemo(() => {
    const allPids = projects.map((p) => parseProjectId(p.id));
    const unsortedPids = unassignedProjectIds(normalizedFolders, allPids);
    return unsortedPids
      .map((pid) => projectsByPid.get(pid))
      .filter((p) => p && visiblePids.has(parseProjectId(p.id)));
  }, [normalizedFolders, projects, projectsByPid, visiblePids]);

  return (
    <VStack spacing={1} align="stretch" w="100%">
      {/* Unsorted projects render inline above the folder sections.
          Newly-created projects show up here until an organizer assigns
          them, so visibility is exactly what users want — no extra click. */}
      {unsorted.length > 0 && (
        <VStack spacing={1.5} align="stretch" pb={folders.length > 0 ? 1 : 0}>
          {unsorted.map((project) => (
            <DraggableProject
              key={project.id}
              project={project}
              isSelected={isProjectSelected(project.id)}
              onSelectProject={onSelectProject}
              onDeleteProject={onDeleteProject}
            />
          ))}
        </VStack>
      )}

      {tree.map((node) => (
        <FolderSection
          key={node.id}
          node={node}
          depth={0}
          projectsByPid={projectsByPid}
          visiblePids={visiblePids}
          getIsExpanded={getIsExpanded}
          onToggle={onToggle}
          isProjectSelected={isProjectSelected}
          onSelectProject={onSelectProject}
          onDeleteProject={onDeleteProject}
        />
      ))}
    </VStack>
  );
}
