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

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Box, Flex, Text, Badge, Icon, IconButton, Collapse, VStack } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { FaFolder, FaFolderOpen, FaInbox } from 'react-icons/fa';

import DraggableProject from './DraggableProject';
import {
  ancestorsOf,
  buildTree,
  folderContainingProject,
  unassignedProjectIds,
} from '@/lib/folders/tree';

const UNSORTED_KEY = '__unsorted__';

/**
 * Subset of projects that fall under `folderProjectIds`, in the order
 * those ids appear in the folder (preserves the organizer's intent).
 */
function projectsInFolder(folderProjectIds, projectsById) {
  const out = [];
  for (const pid of folderProjectIds || []) {
    const p = projectsById.get(pid);
    if (p) out.push(p);
  }
  return out;
}

function FolderSection({
  node,
  depth,
  projectsById,
  visibleProjectIds,
  getIsExpanded,
  onToggle,
  isProjectSelected,
  onSelectProject,
  onDeleteProject,
}) {
  const isExpanded = getIsExpanded(node.id);

  // Projects directly in this folder, filtered by current search.
  const directProjects = projectsInFolder(node.projectIds || [], projectsById).filter((p) =>
    visibleProjectIds.has(p.id)
  );

  // Recurse: are any descendant folders going to show something?
  // Used to keep folder-only branches collapsible without empty noise.
  const visibleChildCount = useMemo(() => {
    let count = 0;
    const walk = (n) => {
      for (const pid of n.projectIds || []) {
        if (visibleProjectIds.has(pid)) count++;
      }
      for (const c of n.children) walk(c);
    };
    walk(node);
    return count;
  }, [node, visibleProjectIds]);

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
                projectsById={projectsById}
                visibleProjectIds={visibleProjectIds}
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
  const projectsById = useMemo(() => {
    const m = new Map();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const visibleProjectIds = useMemo(
    () => new Set((filteredProjects || projects).map((p) => p.id)),
    [filteredProjects, projects]
  );

  const tree = useMemo(() => buildTree(folders), [folders]);

  // Folders containing at least one currently-visible project — used to
  // auto-expand search hits.
  const foldersWithVisible = useMemo(() => {
    const out = new Set();
    for (const f of folders) {
      const hit = (f.projectIds || []).some((pid) => visibleProjectIds.has(pid));
      if (hit) {
        out.add(f.id);
        for (const ancestor of ancestorsOf(folders, f.id)) out.add(ancestor);
      }
    }
    return out;
  }, [folders, visibleProjectIds]);

  // Ancestor chain of the selected project's folder — auto-expand so the
  // user lands on a visible row.
  const selectedAncestors = useMemo(() => {
    if (!selectedProject?.id) return new Set();
    const folderId = folderContainingProject(folders, selectedProject.id);
    if (!folderId) return new Set();
    const chain = ancestorsOf(folders, folderId);
    chain.add(folderId);
    return chain;
  }, [folders, selectedProject?.id]);

  // Single `expanded` Set holds the user's manual toggles. Auto-expansion
  // (search hits + selected ancestors) is unioned at read time so the
  // user's collapse choices survive the next keystroke, but search and
  // selection still surface relevant rows.
  const [expanded, setExpanded] = useState(() => new Set());

  // When the search-or-selection-driven set changes, fold those ids in
  // so a brand-new search hit opens its folder by default.
  useEffect(() => {
    if (foldersWithVisible.size === 0 && selectedAncestors.size === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of foldersWithVisible) next.add(id);
      for (const id of selectedAncestors) next.add(id);
      return next;
    });
  }, [foldersWithVisible, selectedAncestors]);

  const onToggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const getIsExpanded = useCallback((id) => expanded.has(id), [expanded]);

  const isProjectSelected = useCallback(
    (projectId) => Boolean(selectedProject && selectedProject.id === projectId),
    [selectedProject]
  );

  // Unsorted bucket — projects with no folder assignment, intersected with
  // the visible (search-filtered) set.
  const unsorted = useMemo(() => {
    const allIds = projects.map((p) => p.id);
    const unsortedIds = unassignedProjectIds(folders, allIds);
    return unsortedIds
      .map((id) => projectsById.get(id))
      .filter((p) => p && visibleProjectIds.has(p.id));
  }, [folders, projects, projectsById, visibleProjectIds]);

  const unsortedExpanded = expanded.has(UNSORTED_KEY) || (searchTerm && unsorted.length > 0);

  return (
    <VStack spacing={1} align="stretch" w="100%">
      {/* Unsorted comes first so newly-created projects are visible by
          default (organizers assign them later). */}
      {unsorted.length > 0 && (
        <Box w="100%">
          <Flex
            align="center"
            py={1.5}
            pl="6px"
            pr={2}
            my={0.5}
            borderRadius="md"
            borderLeft="3px solid"
            borderLeftColor="whiteAlpha.200"
            bg={unsortedExpanded ? 'whiteAlpha.50' : 'transparent'}
            cursor="pointer"
            onClick={() => onToggle(UNSORTED_KEY)}
            transition="background 0.2s ease, border-color 0.2s ease"
            _hover={{ bg: 'whiteAlpha.100' }}
          >
            <IconButton
              aria-label={unsortedExpanded ? 'Collapse unsorted' : 'Expand unsorted'}
              icon={unsortedExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
              size="xs"
              variant="ghost"
              color="whiteAlpha.700"
              mr={1}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(UNSORTED_KEY);
              }}
            />
            <Icon as={FaInbox} color="gray.400" mr={2} boxSize={3.5} flexShrink={0} />
            <Text color="whiteAlpha.800" fontSize="sm" fontWeight="500" flex="1">
              Unsorted
            </Text>
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
              {unsorted.length}
            </Badge>
          </Flex>
          <Collapse in={unsortedExpanded} animateOpacity unmountOnExit>
            <Box pl="18px" pr={1} py={1}>
              <VStack spacing={1.5} align="stretch">
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
            </Box>
          </Collapse>
        </Box>
      )}

      {tree.map((node) => (
        <FolderSection
          key={node.id}
          node={node}
          depth={0}
          projectsById={projectsById}
          visibleProjectIds={visibleProjectIds}
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
