import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  Badge,
} from '@chakra-ui/react';
import { useTaskBoard } from '@/context/TaskBoardContext';
import { useDataBaseContext } from '@/context/dataBaseContext';
import DraftRow from './DraftRow';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(15, 10, 25, 0.97)',
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
  border: '1px solid rgba(148, 115, 220, 0.3)',
};

const DraftsReviewModal = ({
  isOpen,
  onClose,
  drafts,
  removeDraft,
  clearProjectDrafts,
  activeProjectId,
  destColumnId,
  onSwitchToProject,
}) => {
  const taskBoard = useTaskBoard();
  const addTaskBatch = taskBoard?.addTaskBatch;
  const { projects, setSelectedProjectId } = useDataBaseContext();
  const [submittingProjectId, setSubmittingProjectId] = useState(null);

  const groups = useMemo(() => {
    const byProject = new Map();
    drafts.forEach((d) => {
      if (!byProject.has(d.projectId)) byProject.set(d.projectId, []);
      byProject.get(d.projectId).push(d);
    });
    return Array.from(byProject.entries()).map(([projectId, projectDrafts]) => {
      const project = projects?.find((p) => p.id === projectId);
      return {
        projectId,
        projectName: project?.name || 'Unknown project',
        projectExists: !!project,
        drafts: projectDrafts,
        isActive: projectId === activeProjectId,
      };
    });
  }, [drafts, projects, activeProjectId]);

  const handleSubmitGroup = async (projectId, projectDrafts) => {
    if (!addTaskBatch) return;
    setSubmittingProjectId(projectId);
    try {
      const result = await addTaskBatch(projectDrafts, projectId, destColumnId);
      if (result?.success) {
        clearProjectDrafts(projectId);
        onClose();
      }
    } finally {
      setSubmittingProjectId(null);
    }
  };

  const handleSwitchProject = (projectId) => {
    setSelectedProjectId(projectId);
    if (onSwitchToProject) onSwitchToProject(projectId);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.800" />
      <ModalContent bg="transparent" borderRadius="xl" position="relative" boxShadow="dark-lg" mx={4}>
        <Box style={glassLayerStyle} />

        <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
          Task Drafts
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          {drafts.length === 0 ? (
            <Text color="gray.400" fontSize="sm">
              No drafts yet. In any project&apos;s task board, click &quot;+&quot; and switch to &quot;Save as draft&quot;
              mode to stage tasks for batch submission.
            </Text>
          ) : (
            <VStack align="stretch" spacing={6}>
              {groups.map((group, idx) => (
                <Box key={group.projectId}>
                  {idx > 0 && <Divider borderColor="whiteAlpha.200" mb={4} />}
                  <HStack justify="space-between" mb={3}>
                    <HStack spacing={2}>
                      <Text color="white" fontSize="sm" fontWeight="bold">
                        {group.projectName}
                      </Text>
                      <Badge colorScheme={group.isActive ? 'purple' : 'gray'} variant="subtle">
                        {group.drafts.length} draft{group.drafts.length === 1 ? '' : 's'}
                      </Badge>
                      {group.isActive && (
                        <Badge colorScheme="green" variant="subtle">
                          current project
                        </Badge>
                      )}
                    </HStack>
                  </HStack>

                  <VStack align="stretch" spacing={2}>
                    {group.drafts.map((draft) => (
                      <DraftRow
                        key={draft.draftId}
                        draft={draft}
                        onDelete={removeDraft}
                      />
                    ))}
                  </VStack>

                  <HStack justify="flex-end" mt={3}>
                    {group.isActive ? (
                      <Button
                        colorScheme="purple"
                        size="sm"
                        onClick={() => handleSubmitGroup(group.projectId, group.drafts)}
                        isLoading={submittingProjectId === group.projectId}
                        loadingText="Submitting..."
                      >
                        Submit {group.drafts.length} draft{group.drafts.length === 1 ? '' : 's'}
                      </Button>
                    ) : group.projectExists ? (
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="purple"
                        onClick={() => handleSwitchProject(group.projectId)}
                      >
                        Open {group.projectName} drafts
                      </Button>
                    ) : (
                      <Text fontSize="xs" color="gray.500">
                        Project no longer in this org &mdash; remove drafts manually.
                      </Text>
                    )}
                  </HStack>
                </Box>
              ))}
            </VStack>
          )}
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <Button variant="ghost" onClick={onClose} color="gray.400" _hover={{ bg: 'whiteAlpha.100', color: 'white' }}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DraftsReviewModal;
