import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Box,
  VStack,
  Flex,
  Spacer,
  useToast,
  Textarea,
  useDisclosure,
  Text,
  Badge,
  HStack,
} from '@chakra-ui/react';
import { CheckIcon, WarningIcon } from '@chakra-ui/icons';
import { hasBounty as checkHasBounty, getTokenByAddress } from '../../util/tokens';
import EditTaskModal from './EditTaskModal';
import TaskApplicationModal from './TaskApplicationModal';
import { useTaskBoard } from '../../context/TaskBoardContext';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useUserContext } from '@/context/UserContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { useRouter } from 'next/router';
import { ethers } from 'ethers';
import { resolveUsernames } from '@/features/deployer/utils/usernameResolver';
import { useProjectContext } from '@/context/ProjectContext';
import { userCanReviewTask, userCanAssignTask } from '../../util/permissions';


const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(25, 25, 30, 0.97)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.200',
  color: 'white',
  _placeholder: { color: 'gray.500' },
  _hover: { borderColor: 'whiteAlpha.300' },
  _focus: {
    borderColor: 'gray.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-gray-400)',
  },
};

const SectionHeader = ({ children }) => (
  <Text
    fontSize="xs"
    fontWeight="bold"
    color="gray.400"
    textTransform="uppercase"
    letterSpacing="wide"
    mb={2}
  >
    {children}
  </Text>
);

const TaskCardModal = ({ task, columnId, onEditTask }) => {
  const [submission, setSubmission] = useState('');
  const [assignAddress, setAssignAddress] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { moveTask, deleteTask, applyForTask, approveApplication, assignTask, rejectTask } = useTaskBoard();
  const { hasExecRole, hasMemberRole, address: account, fetchUserDetails, userData } = useUserContext();
  const { projectsData } = useProjectContext();
  const { getUsernameByAddress, setSelectedProject, projects } = useDataBaseContext();
  const { safeFetchFromIpfs } = useIPFScontext();
  const router = useRouter();
  const { userDAO } = router.query;
  const toast = useToast();
  const { isOpen, onOpen, onClose} = useDisclosure();
  const { isOpen: isApplicationModalOpen, onOpen: onOpenApplicationModal, onClose: onCloseApplicationModal } = useDisclosure();
  const [showAssignSection, setShowAssignSection] = useState(false);

  // IPFS metadata state
  const [taskMetadata, setTaskMetadata] = useState(null);
  const [submissionMetadata, setSubmissionMetadata] = useState(null);
  const [rejectionMetadata, setRejectionMetadata] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(false);

  // Application IPFS content state
  const [applicationContents, setApplicationContents] = useState({});
  const [applicationsLoading, setApplicationsLoading] = useState(false);

  // Project-level review permission (matches TaskColumn.js pattern)
  const userHatIds = userData?.hatIds || [];
  const currentProject = useMemo(() => {
    return projectsData?.find(p => p.id === task?.projectId);
  }, [projectsData, task?.projectId]);
  const projectRolePermissions = currentProject?.rolePermissions || [];

  const canReviewTask = useMemo(() => {
    const hasPermission = userCanReviewTask(userHatIds, projectRolePermissions);
    if (hasPermission) return true;
    if (!projectRolePermissions?.length && hasExecRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, hasExecRole]);

  // Project-level assign permission (for approving applications)
  // Contract's approveApplication requires ASSIGN permission or project manager
  const canAssign = useMemo(() => {
    const hasPermission = userCanAssignTask(userHatIds, projectRolePermissions);
    if (hasPermission) return true;
    if (!projectRolePermissions?.length && hasExecRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, hasExecRole]);

  // Check if current user has already applied for this task
  const userApplication = useMemo(() => {
    if (!account || !task?.applicants) return null;
    return task.applicants.find(
      a => a.address?.toLowerCase() === account?.toLowerCase()
    );
  }, [task?.applicants, account]);
  const hasApplied = !!userApplication;

  // Ref to prevent re-opening modal during intentional close
  const isClosingRef = useRef(false);

  useEffect(() => {
    // Don't re-open if we're intentionally closing
    if (isClosingRef.current) return;

    const taskId = router.query.task;

    if (taskId === task.id) {
      onOpen();
    }
  }, [router.query.task, task.id, onOpen]);

  // Fetch IPFS metadata when modal opens - only as fallback when indexed data is missing
  useEffect(() => {
    const fetchIpfsMetadata = async () => {
      if (!isOpen || !task) return;

      // Only fetch from IPFS if indexed data is missing (fallback for older tasks or indexing delay)
      const needsTaskMetadata = !task.description && task.metadataHash && !taskMetadata;
      const needsSubmissionMetadata = !task.submission && task.submissionHash &&
        !submissionMetadata && (task.status === 'Submitted' || task.status === 'Completed');
      const needsRejectionMetadata = !task.rejectionReason && task.rejectionHash &&
        task.rejectionCount > 0 && !rejectionMetadata;

      if (!needsTaskMetadata && !needsSubmissionMetadata && !needsRejectionMetadata) return;

      setMetadataLoading(true);

      // Fetch task metadata (description, difficulty, estHours) - IPFS fallback
      if (needsTaskMetadata) {
        console.log('[TaskCardModal] Indexed metadata missing, fetching from IPFS:', task.metadataHash);
        try {
          const metadata = await safeFetchFromIpfs(task.metadataHash);
          console.log('[TaskCardModal] IPFS task metadata result:', metadata);
          if (metadata) {
            setTaskMetadata(metadata);
          }
        } catch (err) {
          console.error('[TaskCardModal] IPFS fallback failed for task metadata:', err);
        }
      }

      // Fetch submission metadata for submitted/completed tasks - IPFS fallback
      if (needsSubmissionMetadata) {
        console.log('[TaskCardModal] Indexed submission missing, fetching from IPFS:', task.submissionHash);
        try {
          const metadata = await safeFetchFromIpfs(task.submissionHash);
          console.log('[TaskCardModal] IPFS submission metadata result:', metadata);
          if (metadata) {
            setSubmissionMetadata(metadata);
          }
        } catch (err) {
          console.error('[TaskCardModal] IPFS fallback failed for submission metadata:', err);
        }
      }

      // Fetch rejection metadata - IPFS fallback
      if (needsRejectionMetadata) {
        console.log('[TaskCardModal] Indexed rejection missing, fetching from IPFS:', task.rejectionHash);
        try {
          const metadata = await safeFetchFromIpfs(task.rejectionHash);
          console.log('[TaskCardModal] IPFS rejection metadata result:', metadata);
          if (metadata) {
            setRejectionMetadata(metadata);
          }
        } catch (err) {
          console.error('[TaskCardModal] IPFS fallback failed for rejection metadata:', err);
        }
      }

      setMetadataLoading(false);
    };

    fetchIpfsMetadata();
  }, [isOpen, task, safeFetchFromIpfs, taskMetadata, submissionMetadata, rejectionMetadata]);

  // Fetch application content from IPFS — only for applicants without subgraph-indexed metadata
  useEffect(() => {
    const fetchApplicationContents = async () => {
      if (!isOpen || !task?.applicants?.length) return;

      const hashesToFetch = task.applicants.filter(
        a => a.applicationHash && !a.metadata && !applicationContents[a.address]
      );
      if (hashesToFetch.length === 0) return;

      setApplicationsLoading(true);
      const results = {};

      await Promise.all(
        hashesToFetch.map(async (applicant) => {
          try {
            const content = await safeFetchFromIpfs(applicant.applicationHash);
            if (content) {
              results[applicant.address] = content;
            }
          } catch (err) {
            console.error('[TaskCardModal] Failed to fetch application content for', applicant.address, err);
          }
        })
      );

      setApplicationContents(prev => ({ ...prev, ...results }));
      setApplicationsLoading(false);
    };

    fetchApplicationContents();
  }, [isOpen, task?.applicants, safeFetchFromIpfs]);

  const handleCloseModal = async () => {
    // Set flag to prevent useEffect from re-opening
    isClosingRef.current = true;
    onClose();

    const { projectId, userDAO } = router.query;
    const safeProjectId = projectId ? encodeURIComponent(decodeURIComponent(projectId)) : '';

    // Wait for URL to update before returning - this prevents new modal instances from opening
    await router.push(
      { pathname: `/tasks/`, query: { projectId: safeProjectId, userDAO } },
      undefined,
      { shallow: true }
    );

    // Reset flag after URL update completes
    isClosingRef.current = false;
  };

  // Handle applying for a task (for tasks that require application)
  const handleApply = async (applicationData) => {
    if (!hasMemberRole) {
      toast({
        title: 'Membership Required',
        description: 'You must be a member to apply for this task.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    try {
      await applyForTask(task.id, applicationData);
      toast({
        title: 'Application Submitted',
        description: 'Your application has been submitted for review.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onCloseApplicationModal();
    } catch (error) {
      console.error('Error applying for task:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit application.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    }
  };

  // Handle approving an application (requires ASSIGN permission)
  const handleApproveApplication = async (applicantAddress, applicantUsername) => {
    if (!canAssign) {
      toast({
        title: 'Permission Required',
        description: 'You must have assign permissions to approve applications.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    // Close the modal before the transaction — optimistic UI will move the task
    await handleCloseModal();

    try {
      await approveApplication(task.id, applicantAddress, applicantUsername);
    } catch (error) {
      console.error('Error approving application:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve application.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    }
  };

  // Handle assigning a task directly (for executives)
  // Supports both wallet addresses and usernames
  const handleAssignTask = async () => {
    if (!hasExecRole) {
      toast({
        title: 'Permission Required',
        description: 'You must be an executive to assign tasks.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    const input = assignAddress.trim();
    if (!input) {
      toast({
        title: 'Input Required',
        description: 'Please enter a username or wallet address.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsAssigning(true);

    try {
      let resolvedAddress = input;

      // Check if input is already a valid address
      if (!ethers.utils.isAddress(input)) {
        // Not an address, try to resolve as username
        toast({
          title: 'Resolving Username',
          description: `Looking up "${input}"...`,
          status: 'info',
          duration: 2000,
          isClosable: true,
        });

        const { resolved, notFound } = await resolveUsernames([input]);

        if (notFound.length > 0 || !resolved.has(input.toLowerCase())) {
          toast({
            title: 'User Not Found',
            description: `No user found with username "${input}". Please check the spelling or use a wallet address.`,
            status: 'error',
            duration: 4000,
            isClosable: true,
          });
          setIsAssigning(false);
          return;
        }

        resolvedAddress = resolved.get(input.toLowerCase());
      }

      await assignTask(task.id, resolvedAddress);
      toast({
        title: 'Task Assigned',
        description: `The task has been assigned to ${input !== resolvedAddress ? input : `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}`}.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setAssignAddress('');
      setShowAssignSection(false);
      handleCloseModal();
    } catch (error) {
      console.error('Error assigning task:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign task.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRejectTask = async () => {
    if (!canReviewTask) {
      toast({
        title: 'Permission Required',
        description: 'You must have review permissions to reject a task.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejection.',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
      return;
    }

    await handleCloseModal();

    rejectTask(task, rejectionReason).catch(error => {
      console.error("Error rejecting task:", error);
    });
  };

  const handleButtonClick = async () => {
    // For tasks requiring application, open the application modal instead
    if (columnId === 'open' && task.requiresApplication) {
      if (hasApplied) {
        toast({
          title: 'Already Applied',
          description: 'You have already submitted an application for this task.',
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
      if (hasMemberRole) {
        onOpenApplicationModal();
      } else {
        toast({
          title: 'Membership Required',
          description: 'You must be a member to apply for this task.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
      }
      return;
    }

    // Validate permissions and inputs BEFORE closing modal
    if (columnId === 'open') {
      if (!hasMemberRole) {
        toast({
          title: 'Membership Required',
          description: 'You must be a member to claim this task. Go to user page to join.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    if (columnId === 'inProgress') {
      if (submission === "") {
        toast({
          title: "Invalid Submission",
          description: "Please Enter a submission",
          status: "error",
          duration: 3500,
          isClosable: true
        });
        return;
      }
      if (!hasMemberRole) {
        toast({
          title: 'Membership Required',
          description: 'You must be a member to submit. Go to user page to join.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    if (columnId === 'inReview') {
      if (!canReviewTask) {
        toast({
          title: 'Permission Required',
          description: 'You must have review permissions to complete the review.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    if (columnId === 'completed') {
      if (!hasExecRole) {
        toast({
          title: 'Permission Required',
          description: 'You must be an executive to delete a task.',
          status: 'warning',
          duration: 4000,
          isClosable: true,
          position: 'top',
        });
        return;
      }
    }

    // All validations passed - close modal and wait for URL update
    // This ensures new TaskCardModal instances (from optimistic update) won't see the task in URL
    await handleCloseModal();

    // Now execute the transaction (runs in background, optimistic UI already shown)
    if (columnId === 'open') {
      // Claim task - moveTask handles optimistic UI and notifications
      moveTask(task, columnId, 'inProgress', 0, " ", account).catch(error => {
        console.error("Error claiming task:", error);
      });
    }

    if (columnId === 'inProgress') {
      // Submit task - moveTask handles optimistic UI and notifications
      moveTask(task, columnId, 'inReview', 0, submission).catch(error => {
        console.error("Error submitting task:", error);
      });
    }

    if (columnId === 'inReview') {
      // Complete review - moveTask handles optimistic UI and notifications
      moveTask(task, columnId, 'completed', 0).catch(error => {
        console.error("Error completing review:", error);
      });
    }

    if (columnId === 'completed') {
      // Delete task
      deleteTask(task.id, columnId).catch(error => {
        console.error("Error deleting task:", error);
      });
    }
  };


  const buttonText = () => {
    switch (columnId) {
      case 'open':
        // Show "Apply" / "Applied" for tasks requiring application (unless exec who can bypass)
        if (task.requiresApplication) {
          return hasApplied ? 'Applied' : 'Apply';
        }
        return 'Claim';
      case 'inProgress':
        return 'Submit';
      case 'inReview':
        return 'Complete Review';
      case 'completed':
        return <CheckIcon />;
      default:
        return '';
    }
  };

  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);

  const handleOpenEditTaskModal = () => {
    
    if (hasExecRole) {
      setIsEditTaskModalOpen(true);
    } else {
      toast({
        title: 'Permission Required',
        description: 'You must be an executive to edit a task.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
    }
    
  };

  const handleCloseEditTaskModal = () => {
    setIsEditTaskModalOpen(false);
    router.push({ pathname: `/tasks/`, query: { userDAO: userDAO } }, undefined, { shallow: true });
  };

  const copyLinkToClipboard = () => {
    const encodedProjectId = encodeURIComponent(task.projectId);
    const link = `${window.location.origin}/tasks/?task=${task.id}&projectId=${encodedProjectId}&userDAO=${userDAO}`;

    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Link copied",
        description: "Task link copied to clipboard.",
        status: "success",
        duration: 3000,
        isClosable: true
      });
    }).catch(err => {
      toast({
        title: "Failed to copy",
        description: "There was an issue copying the link.",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      console.error('Failed to copy link: ', err);
    });
  };

  const difficultyColorScheme = {
    easy: 'green',
    medium: 'yellow',
    hard: 'orange',
    veryhard: 'red'
  };

  return task ? (
    <>
      <Modal isOpen={isOpen} onClose={handleCloseModal} size="2xl" isCentered>
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent
          bg="transparent"
          borderRadius="xl"
          position="relative"
          boxShadow="dark-lg"
          mx={4}
          color="white"
        >
          <Box style={glassLayerStyle} />
          <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
            {task.isIndexing ? 'Indexing Task Data...' : task.name}
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody pb={6}>
            <VStack spacing={5} align="stretch">
              {task.isIndexing ? (
                <Box w="100%" p={4} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
                  <Text color="gray.300" fontWeight="bold">
                    Task information is being indexed from IPFS
                  </Text>
                  <Text color="gray.400" fontSize="sm" mt={2}>
                    This task was recently created and its data is still being indexed.
                    Please check back in a few moments.
                  </Text>
                </Box>
              ) : (
                <>
                  {/* Task Details Section */}
                  <Box>
                    <SectionHeader>Task Details</SectionHeader>
                    <Box
                      p={4}
                      bg="whiteAlpha.50"
                      borderRadius="lg"
                      border="1px solid"
                      borderColor="whiteAlpha.100"
                    >
                      <Text fontSize="sm" lineHeight="6" color="gray.200" style={{ whiteSpace: 'pre-wrap' }}>
                        {metadataLoading ? 'Loading task details...' : (task.description || taskMetadata?.description || 'No description available')}
                      </Text>
                    </Box>
                    <HStack mt={3} spacing={3}>
                      <Badge colorScheme={difficultyColorScheme[(task.difficulty || taskMetadata?.difficulty)?.toLowerCase()?.replace(" ", "") || 'easy']}>
                        {task.difficulty || taskMetadata?.difficulty || 'Unknown'}
                      </Badge>
                      <Badge colorScheme="blue">{task.estHours || taskMetadata?.estHours || '0'} hrs</Badge>
                      <Spacer />
                      {task.claimedBy && (
                        <Text fontSize="sm" color="gray.400">
                          Claimed by <Text as="span" color="white" fontWeight="medium">{task.claimerUsername}</Text>
                        </Text>
                      )}
                    </HStack>
                  </Box>

                  {/* Submission Input (In Progress) */}
                  {columnId === 'inProgress' && (
                    <Box>
                      <SectionHeader>Submission</SectionHeader>
                      <Textarea
                        height="200px"
                        placeholder="Type your submission here"
                        value={submission}
                        onChange={(e) => setSubmission(e.target.value)}
                        {...inputStyles}
                      />
                    </Box>
                  )}

                  {/* Submission Display (In Review / Completed) */}
                  {(columnId === 'inReview' || columnId === 'completed') && (
                    <Box>
                      <SectionHeader>Submission</SectionHeader>
                      <Box
                        p={4}
                        bg="whiteAlpha.50"
                        borderRadius="lg"
                        border="1px solid"
                        borderColor="whiteAlpha.100"
                      >
                        <Text fontSize="sm" color="gray.200" style={{ whiteSpace: 'pre-wrap' }}>
                          {metadataLoading ? 'Loading submission...' : (task.submission || submissionMetadata?.submission || 'No submission available')}
                        </Text>
                      </Box>
                    </Box>
                  )}

                  {/* Rejection Alert */}
                  {task.rejectionCount > 0 && (
                    <Box w="100%" p={4} bg="rgba(127, 29, 29, 0.5)" borderRadius="lg" borderLeft="4px solid" borderColor="red.400">
                      <HStack mb={2}>
                        <WarningIcon color="red.300" />
                        <Text fontWeight="bold" color="red.200" fontSize="md">
                          Rejected{task.rejectionCount > 1 ? ` (${task.rejectionCount} times)` : ''}
                        </Text>
                      </HStack>
                      {(task.rejectionReason || rejectionMetadata?.rejection || rejectionMetadata?.rejectionReason) && (
                        <Box mb={2}>
                          <Text fontSize="sm" color="red.200" fontWeight="semibold" mb={1}>Reason:</Text>
                          <Text fontSize="sm" color="gray.200" style={{ whiteSpace: 'pre-wrap' }}>
                            {task.rejectionReason || rejectionMetadata?.rejection || rejectionMetadata?.rejectionReason}
                          </Text>
                        </Box>
                      )}
                      {task.rejections && task.rejections.length > 0 && task.rejections[0].rejectorUsername && (
                        <Text fontSize="xs" color="gray.400">
                          Rejected by {task.rejections[0].rejectorUsername}
                          {task.rejections[0].rejectedAt && (
                            <> on {new Date(task.rejections[0].rejectedAt * 1000).toLocaleDateString()}</>
                          )}
                        </Text>
                      )}
                    </Box>
                  )}

                  {/* Rejection Reason Input (In Review) */}
                  {columnId === 'inReview' && canReviewTask && (
                    <Box>
                      <SectionHeader>Rejection Reason</SectionHeader>
                      <Textarea
                        height="100px"
                        placeholder="Explain why this submission is being rejected..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        {...inputStyles}
                      />
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        Required only if you choose to reject
                      </Text>
                    </Box>
                  )}

                  {/* Application Required Info */}
                  {columnId === 'open' && task.requiresApplication && (
                    <Box
                      p={3}
                      bg="whiteAlpha.50"
                      borderRadius="lg"
                      border="1px solid"
                      borderColor="whiteAlpha.200"
                      w="100%"
                    >
                      <HStack>
                        <Badge colorScheme="teal" fontSize="xs">Application Required</Badge>
                        <Text fontSize="xs" color="gray.400">
                          Members must apply and be approved before claiming
                        </Text>
                      </HStack>
                    </Box>
                  )}

                  {/* Already Applied Status */}
                  {columnId === 'open' && task.requiresApplication && hasApplied && (
                    <Box w="100%" p={4} bg="rgba(20, 83, 45, 0.5)" borderRadius="lg" borderLeft="4px solid" borderColor="green.400">
                      <HStack>
                        <CheckIcon color="green.300" />
                        <Text fontWeight="bold" color="green.200" fontSize="sm">
                          Application Submitted
                        </Text>
                      </HStack>
                      <Text fontSize="xs" color="gray.400" mt={1}>
                        Your application is pending review.
                        {userApplication?.appliedAt && (
                          <> Applied {new Date(userApplication.appliedAt * 1000).toLocaleDateString()}</>
                        )}
                      </Text>
                    </Box>
                  )}

                  {/* Applicants Section */}
                  {columnId === 'open' && task.requiresApplication && canAssign && task.applicants && task.applicants.length > 0 && (
                    <Box w="100%" p={4} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
                      <SectionHeader>Applicants ({task.applicants.length})</SectionHeader>
                      <VStack spacing={3} align="stretch">
                        {task.applicants.map((applicant, index) => {
                          const appContent = applicant.metadata || applicationContents[applicant.address];
                          return (
                            <Box
                              key={index}
                              p={3}
                              bg="whiteAlpha.100"
                              borderRadius="md"
                              border="1px solid"
                              borderColor="whiteAlpha.100"
                            >
                              <Flex justify="space-between" align="start" mb={appContent || applicationsLoading ? 2 : 0}>
                                <VStack align="start" spacing={0}>
                                  <Text fontSize="sm" fontWeight="bold" color="white">
                                    {applicant.username || `${applicant.address?.slice(0, 6)}...${applicant.address?.slice(-4)}`}
                                  </Text>
                                  <Text fontSize="xs" color="gray.500">
                                    {applicant.appliedAt
                                      ? `Applied ${new Date(applicant.appliedAt * 1000).toLocaleDateString()}`
                                      : ''}
                                  </Text>
                                </VStack>
                                <Button
                                  size="sm"
                                  colorScheme="green"
                                  variant="outline"
                                  onClick={() => handleApproveApplication(applicant.address, applicant.username)}
                                >
                                  Approve
                                </Button>
                              </Flex>

                              {applicationsLoading && !appContent ? (
                                <Text fontSize="xs" color="gray.500">Loading application details...</Text>
                              ) : appContent ? (
                                <VStack align="start" spacing={2} mt={1}>
                                  <Box>
                                    <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={0.5}>
                                      Why they want this task:
                                    </Text>
                                    <Text fontSize="sm" color="gray.300" style={{ whiteSpace: 'pre-wrap' }}>
                                      {appContent.notes || 'No notes provided'}
                                    </Text>
                                  </Box>
                                  {appContent.experience && (
                                    <Box>
                                      <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={0.5}>
                                        Relevant Experience:
                                      </Text>
                                      <Text fontSize="sm" color="gray.300" style={{ whiteSpace: 'pre-wrap' }}>
                                        {appContent.experience}
                                      </Text>
                                    </Box>
                                  )}
                                </VStack>
                              ) : null}
                            </Box>
                          );
                        })}
                      </VStack>
                    </Box>
                  )}

                  {/* Assign Section (Executives) */}
                  {columnId === 'open' && hasExecRole && showAssignSection && (
                    <Box w="100%" p={4} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
                      <SectionHeader>Assign Task</SectionHeader>
                      <HStack>
                        <Input
                          placeholder="Username or wallet address (0x...)"
                          value={assignAddress}
                          onChange={(e) => setAssignAddress(e.target.value)}
                          size="sm"
                          {...inputStyles}
                        />
                        <Button
                          size="sm"
                          colorScheme="teal"
                          onClick={handleAssignTask}
                          isLoading={isAssigning}
                          loadingText="Resolving..."
                        >
                          Assign
                        </Button>
                      </HStack>
                      <Text fontSize="xs" color="gray.500" mt={2}>
                        Enter a username or full wallet address
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
            <HStack spacing={3} w="100%" justify="space-between" align="center">
              {/* Reward Display */}
              <Box
                p={3}
                bg="whiteAlpha.50"
                borderRadius="lg"
                border="1px solid"
                borderColor="whiteAlpha.100"
              >
                <VStack align="start" spacing={0}>
                  <Text fontSize="xs" color="gray.400">Reward</Text>
                  <HStack spacing={1} align="baseline">
                    <Text fontSize="lg" fontWeight="bold" color="white">
                      {task.Payout}
                    </Text>
                    <Text fontSize="sm" color="gray.300">PT</Text>
                  </HStack>
                  {checkHasBounty(task.bountyToken, task.bountyPayout) && (
                    <Text fontSize="xs" color="green.400" fontWeight="bold">
                      + {task.bountyPayout} {getTokenByAddress(task.bountyToken).symbol}
                    </Text>
                  )}
                </VStack>
              </Box>

              {/* Action Buttons */}
              <HStack spacing={2}>
                <Button
                  variant="ghost"
                  onClick={copyLinkToClipboard}
                  color="gray.400"
                  _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                  size="sm"
                >
                  Share
                </Button>
                {!task.isIndexing && columnId === 'open' && hasExecRole && (
                  <Button
                    variant="ghost"
                    onClick={() => setShowAssignSection(!showAssignSection)}
                    color={showAssignSection ? "teal.300" : "gray.400"}
                    _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                    size="sm"
                  >
                    {showAssignSection ? 'Cancel Assign' : 'Assign'}
                  </Button>
                )}
                {!task.isIndexing && columnId === 'open' && (
                  <Button
                    variant="ghost"
                    onClick={handleOpenEditTaskModal}
                    color="gray.400"
                    _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
                    size="sm"
                  >
                    Edit
                  </Button>
                )}
                {!task.isIndexing && columnId === 'inReview' && canReviewTask && (
                  <Button
                    colorScheme="red"
                    variant="outline"
                    onClick={handleRejectTask}
                    size="sm"
                  >
                    Reject
                  </Button>
                )}
                <Button
                  onClick={handleButtonClick}
                  colorScheme="teal"
                  isDisabled={task.isIndexing || (columnId === 'open' && task.requiresApplication && hasApplied)}
                  size="sm"
                >
                  {buttonText()}
                </Button>
              </HStack>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {columnId === 'open' && !task.isIndexing && (
        <EditTaskModal
          isOpen={isEditTaskModalOpen}
          onClose={handleCloseEditTaskModal}
          onEditTask={onEditTask}
          task={task}
          onDeleteTask={(taskId) => deleteTask(taskId, columnId)}
        />
      )}

      {/* Task Application Modal */}
      <TaskApplicationModal
        isOpen={isApplicationModalOpen}
        onClose={onCloseApplicationModal}
        onApply={handleApply}
        task={task}
      />
    </>
  ) : null;
};

export default TaskCardModal;
