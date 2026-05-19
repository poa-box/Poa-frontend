/**
 * FolderTreeView
 * Read-only render of the org's folder tree. Projects-not-in-any-folder
 * land in a virtual "Unassigned" bucket per spec.
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  VStack,
  Icon,
  IconButton,
  Badge,
  Collapse,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { FaFolder, FaFolderOpen, FaProjectDiagram } from 'react-icons/fa';
import Link from 'next/link';
import { useProjectContext } from '@/context/ProjectContext';
import { useOrgName } from '@/hooks/useOrgName';
import { buildTree, unassignedProjectIds } from '@/lib/folders/tree';
import { parseProjectId } from '@/services/web3/utils/encoding';

function FolderRow({ node, depth, projectsById, userDAO, expandedIds, toggle }) {
  const isOpen = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0 || (node.projectIds || []).length > 0;

  return (
    <Box>
      <Flex
        align="center"
        py={1.5}
        pl={depth * 4}
        pr={2}
        borderRadius="md"
        _hover={{ bg: 'whiteAlpha.50' }}
        cursor={hasChildren ? 'pointer' : 'default'}
        onClick={() => hasChildren && toggle(node.id)}
      >
        <IconButton
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          icon={isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          size="xs"
          variant="ghost"
          color="whiteAlpha.700"
          isDisabled={!hasChildren}
          mr={1}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggle(node.id);
          }}
        />
        <Icon
          as={isOpen ? FaFolderOpen : FaFolder}
          color={isOpen ? 'purple.300' : 'gray.400'}
          mr={2}
          boxSize={3.5}
        />
        <Text color="white" fontSize="sm" fontWeight="500" flex="1" isTruncated>
          {node.name || <Text as="span" color="gray.500" fontStyle="italic">Untitled folder</Text>}
        </Text>
        <Badge variant="subtle" colorScheme="purple" fontSize="0.65rem">
          {(node.projectIds || []).length} {(node.projectIds || []).length === 1 ? 'project' : 'projects'}
        </Badge>
      </Flex>

      <Collapse in={isOpen} animateOpacity>
        <Box>
          {(node.projectIds || []).map((pid) => {
            const project = projectsById.get(pid);
            return (
              <Flex
                key={pid}
                align="center"
                py={1}
                pl={depth * 4 + 8}
                pr={2}
                _hover={{ bg: 'whiteAlpha.50' }}
              >
                <Icon as={FaProjectDiagram} color="blue.300" mr={2} boxSize={3} />
                {project ? (
                  <Link href={`/tasks?projectId=${encodeURIComponent(pid)}&org=${userDAO}`} legacyBehavior passHref>
                    <ChakraLink color="white" fontSize="sm" _hover={{ color: 'purple.200' }}>
                      {project.name}
                    </ChakraLink>
                  </Link>
                ) : (
                  <Text color="gray.500" fontSize="sm" fontStyle="italic">
                    Unknown project {pid.slice(0, 10)}…
                  </Text>
                )}
              </Flex>
            );
          })}
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              projectsById={projectsById}
              userDAO={userDAO}
              expandedIds={expandedIds}
              toggle={toggle}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function FolderTreeView({ doc }) {
  // ProjectContext exports `projectsData` not `projects`; alias.
  // Map projects by their canonical bytes32 id so they resolve when looked
  // up via folder.projectIds (which the spec mandates is bytes32).
  const { projectsData: projects = [] } = useProjectContext() || {};
  const userDAO = useOrgName();

  const projectsById = useMemo(() => {
    const m = new Map();
    for (const p of projects) m.set(parseProjectId(p.id), p);
    return m;
  }, [projects]);

  const allProjectPids = useMemo(() => projects.map((p) => parseProjectId(p.id)), [projects]);
  const tree = useMemo(() => buildTree(doc?.folders || []), [doc]);
  const unassigned = useMemo(
    () => unassignedProjectIds(doc?.folders || [], allProjectPids),
    [doc, allProjectPids]
  );

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggle = (id) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if ((doc?.folders || []).length === 0 && unassigned.length === 0) {
    return (
      <Box p={4} color="gray.400" fontSize="sm" fontStyle="italic">
        No folders yet. Wearers of an organizer hat can publish a folder tree.
      </Box>
    );
  }

  return (
    <VStack align="stretch" spacing={0} w="100%">
      {tree.map((node) => (
        <FolderRow
          key={node.id}
          node={node}
          depth={0}
          projectsById={projectsById}
          userDAO={userDAO}
          expandedIds={expandedIds}
          toggle={toggle}
        />
      ))}

      {unassigned.length > 0 && (
        <Box mt={2} pt={2} borderTop="1px solid" borderColor="whiteAlpha.200">
          <Flex
            align="center"
            py={1.5}
            pr={2}
            cursor="pointer"
            onClick={() => toggle('__unassigned__')}
          >
            <IconButton
              aria-label="Toggle unassigned"
              icon={expandedIds.has('__unassigned__') ? <ChevronDownIcon /> : <ChevronRightIcon />}
              size="xs"
              variant="ghost"
              color="whiteAlpha.700"
              mr={1}
              onClick={(e) => {
                e.stopPropagation();
                toggle('__unassigned__');
              }}
            />
            <Icon as={FaFolder} color="gray.500" mr={2} boxSize={3.5} />
            <Text color="gray.300" fontSize="sm" fontWeight="500" flex="1">
              Unassigned
            </Text>
            <Badge variant="subtle" colorScheme="gray" fontSize="0.65rem">
              {unassigned.length}
            </Badge>
          </Flex>
          <Collapse in={expandedIds.has('__unassigned__')} animateOpacity>
            <Box>
              {unassigned.map((pid) => {
                const project = projectsById.get(pid);
                return (
                  <Flex key={pid} align="center" py={1} pl={8} pr={2} _hover={{ bg: 'whiteAlpha.50' }}>
                    <Icon as={FaProjectDiagram} color="gray.400" mr={2} boxSize={3} />
                    {project ? (
                      <Link href={`/tasks?projectId=${encodeURIComponent(pid)}&org=${userDAO}`} legacyBehavior passHref>
                        <ChakraLink color="white" fontSize="sm" _hover={{ color: 'purple.200' }}>
                          {project.name}
                        </ChakraLink>
                      </Link>
                    ) : (
                      <Text color="gray.500" fontSize="sm" fontStyle="italic">
                        Unknown project {pid.slice(0, 10)}…
                      </Text>
                    )}
                  </Flex>
                );
              })}
            </Box>
          </Collapse>
        </Box>
      )}
    </VStack>
  );
}
