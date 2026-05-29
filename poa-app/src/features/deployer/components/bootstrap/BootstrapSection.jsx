/**
 * BootstrapSection - configure initial projects & tasks created atomically at deploy.
 *
 * Maps to OrgDeployer's `bootstrap` field (ITaskManagerBootstrap configs):
 * - project create/claim/review/assign pickers store ROLE INDICES (the deployer
 *   resolves them to hat IDs)
 * - amounts are human token values (-> 18-dec wei in buildBootstrapConfig)
 * - descriptions are uploaded to IPFS in the create page; titles are stored on-chain
 *
 * Optional and collapsed by default — empty = nothing bootstrapped.
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Textarea,
  Select,
  Switch,
  Button,
  IconButton,
  Icon,
  Wrap,
  WrapItem,
  Tag,
  Divider,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useColorModeValue,
} from '@chakra-ui/react';
import { AddIcon, CloseIcon } from '@chakra-ui/icons';
import { PiListChecks } from 'react-icons/pi';
import { useDeployer } from '../../context/DeployerContext';
import { AddressListInput } from '../common/AddressListInput';

// Toggleable role tags (stores an array of role indices).
function RolePicker({ roles, selected = [], onChange, label }) {
  const sel = new Set((selected || []).map(Number));
  const toggle = (idx) => {
    const next = new Set(sel);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    onChange(Array.from(next).sort((a, b) => a - b));
  };
  return (
    <Box>
      <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>{label}</Text>
      <Wrap spacing={2}>
        {roles.map((r, idx) => (
          <WrapItem key={r.id || idx}>
            <Tag
              size="sm"
              variant={sel.has(idx) ? 'solid' : 'outline'}
              colorScheme={sel.has(idx) ? 'purple' : 'gray'}
              cursor="pointer"
              onClick={() => toggle(idx)}
            >
              {r.name || `Role ${idx + 1}`}
            </Tag>
          </WrapItem>
        ))}
        {roles.length === 0 && <Text fontSize="xs" color="warmGray.400">No roles defined</Text>}
      </Wrap>
    </Box>
  );
}

// Rows of { token address, cap } for project bounty tokens.
function BountyRows({ bounties = [], onChange }) {
  const setAt = (i, patch) => onChange(bounties.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i) => onChange(bounties.filter((_, idx) => idx !== i));
  const add = () => onChange([...bounties, { token: '', cap: '' }]);
  return (
    <Box>
      <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>Bounty tokens (optional)</Text>
      <VStack align="stretch" spacing={2}>
        {bounties.map((b, i) => (
          <HStack key={i} spacing={2}>
            <Input size="sm" placeholder="Token address 0x…" value={b.token || ''} fontFamily="mono"
              onChange={(e) => setAt(i, { token: e.target.value })} />
            <Input size="sm" placeholder="Cap" value={b.cap || ''} w="120px" type="number"
              onChange={(e) => setAt(i, { cap: e.target.value })} />
            <IconButton aria-label="Remove bounty" size="sm" variant="ghost" icon={<CloseIcon boxSize={2.5} />} onClick={() => remove(i)} />
          </HStack>
        ))}
        <Button size="xs" variant="outline" leftIcon={<AddIcon boxSize={2.5} />} onClick={add} alignSelf="flex-start">
          Add bounty token
        </Button>
      </VStack>
    </Box>
  );
}

function ProjectCard({ project, index, roles, actions, borderColor }) {
  const up = (patch) => actions.updateBootstrapProject(index, patch);
  return (
    <Box border="1px solid" borderColor={borderColor} borderRadius="xl" p={4}>
      <HStack justify="space-between" mb={3}>
        <Text fontWeight="600" fontSize="sm">Project {index + 1}</Text>
        <IconButton aria-label="Remove project" size="sm" variant="ghost" colorScheme="red"
          icon={<CloseIcon boxSize={2.5} />} onClick={() => actions.removeBootstrapProject(index)} />
      </HStack>
      <VStack align="stretch" spacing={3}>
        <Input size="sm" placeholder="Project title" value={project.title || ''}
          onChange={(e) => up({ title: e.target.value })} />
        <Textarea size="sm" placeholder="Description (optional, stored on IPFS)" value={project.description || ''}
          onChange={(e) => up({ description: e.target.value })} rows={2} />
        <HStack spacing={3}>
          <Box flex="1">
            <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>Participation-token cap (optional)</Text>
            <Input size="sm" type="number" placeholder="0 = uncapped" value={project.cap || ''}
              onChange={(e) => up({ cap: e.target.value })} />
          </Box>
        </HStack>
        <Divider />
        <RolePicker roles={roles} selected={project.createHats} label="Can create tasks" onChange={(v) => up({ createHats: v })} />
        <RolePicker roles={roles} selected={project.claimHats} label="Can claim tasks" onChange={(v) => up({ claimHats: v })} />
        <RolePicker roles={roles} selected={project.reviewHats} label="Can review tasks" onChange={(v) => up({ reviewHats: v })} />
        <RolePicker roles={roles} selected={project.assignHats} label="Can assign tasks" onChange={(v) => up({ assignHats: v })} />
        <Divider />
        <Box>
          <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>Project managers (optional)</Text>
          <AddressListInput value={project.managers} onChange={(v) => up({ managers: v })}
            addLabel="Add manager" emptyHint="No managers set." />
        </Box>
        <BountyRows bounties={project.bounties} onChange={(v) => up({ bounties: v })} />
      </VStack>
    </Box>
  );
}

function TaskCard({ task, index, projects, actions, borderColor }) {
  const up = (patch) => actions.updateBootstrapTask(index, patch);
  return (
    <Box border="1px solid" borderColor={borderColor} borderRadius="xl" p={4}>
      <HStack justify="space-between" mb={3}>
        <Text fontWeight="600" fontSize="sm">Task {index + 1}</Text>
        <IconButton aria-label="Remove task" size="sm" variant="ghost" colorScheme="red"
          icon={<CloseIcon boxSize={2.5} />} onClick={() => actions.removeBootstrapTask(index)} />
      </HStack>
      <VStack align="stretch" spacing={3}>
        <Box>
          <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>Project</Text>
          <Select size="sm" value={task.projectIndex ?? 0} onChange={(e) => up({ projectIndex: Number(e.target.value) })}>
            {projects.map((p, idx) => (
              <option key={idx} value={idx}>{p.title?.trim() || `Project ${idx + 1}`}</option>
            ))}
          </Select>
        </Box>
        <Input size="sm" placeholder="Task title" value={task.title || ''} onChange={(e) => up({ title: e.target.value })} />
        <Textarea size="sm" placeholder="Description (optional, stored on IPFS)" value={task.description || ''}
          onChange={(e) => up({ description: e.target.value })} rows={2} />
        <HStack spacing={3}>
          <Box flex="1">
            <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>Payout (participation tokens) — required, &gt; 0</Text>
            <Input size="sm" type="number" placeholder="e.g. 100" value={task.payout || ''}
              isInvalid={task.payout !== '' && task.payout != null && !(parseFloat(task.payout) > 0)}
              onChange={(e) => up({ payout: e.target.value })} />
          </Box>
        </HStack>
        <HStack spacing={3} align="end">
          <Box flex="1">
            <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>Bounty token (optional)</Text>
            <Input size="sm" placeholder="0x…" fontFamily="mono" value={task.bountyToken || ''} onChange={(e) => up({ bountyToken: e.target.value })} />
          </Box>
          <Box w="120px">
            <Text fontSize="xs" fontWeight="600" color="warmGray.600" mb={1}>Bounty</Text>
            <Input size="sm" type="number" placeholder="0" value={task.bountyPayout || ''} onChange={(e) => up({ bountyPayout: e.target.value })} />
          </Box>
        </HStack>
        <HStack justify="space-between">
          <Text fontSize="xs" fontWeight="600" color="warmGray.600">Requires application before claim</Text>
          <Switch size="sm" colorScheme="purple" isChecked={!!task.requiresApplication}
            onChange={(e) => up({ requiresApplication: e.target.checked })} />
        </HStack>
      </VStack>
    </Box>
  );
}

export function BootstrapSection() {
  const { state, actions } = useDeployer();
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');
  const borderColor = useColorModeValue('warmGray.200', 'warmGray.600');

  const roles = state.roles || [];
  const projects = state.bootstrap?.projects || [];
  const tasks = state.bootstrap?.tasks || [];
  const count = projects.length + tasks.length;

  return (
    <Box bg={cardBg} borderRadius="2xl" border="1px solid" borderColor={borderColor}
      backdropFilter="blur(16px)" boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)" overflow="hidden">
      <Accordion allowToggle>
        <AccordionItem border="none">
          <AccordionButton p={6} _hover={{ bg: 'transparent' }}>
            <HStack spacing={3} flex="1" textAlign="left">
              <Icon as={PiListChecks} boxSize={5} color="amethyst.500" />
              <Box>
                <Text fontWeight="600" fontSize="md">Initial Projects & Tasks</Text>
                <Text fontSize="xs" color="warmGray.500">
                  Optional — seed your org with projects and tasks created at deploy.
                  {count > 0 ? ` (${projects.length} project${projects.length !== 1 ? 's' : ''}, ${tasks.length} task${tasks.length !== 1 ? 's' : ''})` : ''}
                </Text>
              </Box>
            </HStack>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel px={6} pb={6}>
            <VStack align="stretch" spacing={4}>
              {/* Projects */}
              {projects.map((p, idx) => (
                <ProjectCard key={p.id || idx} project={p} index={idx} roles={roles} actions={actions} borderColor={borderColor} />
              ))}
              <Button size="sm" variant="outline" leftIcon={<AddIcon boxSize={3} />} onClick={() => actions.addBootstrapProject()} alignSelf="flex-start">
                Add project
              </Button>

              {/* Tasks (require at least one project) */}
              {projects.length > 0 && (
                <>
                  <Divider />
                  {tasks.map((t, idx) => (
                    <TaskCard key={t.id || idx} task={t} index={idx} projects={projects} actions={actions} borderColor={borderColor} />
                  ))}
                  <Button size="sm" variant="outline" leftIcon={<AddIcon boxSize={3} />} onClick={() => actions.addBootstrapTask(0)} alignSelf="flex-start">
                    Add task
                  </Button>
                </>
              )}
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Box>
  );
}

export default BootstrapSection;
