import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_PROJECTS_DATA_NEW } from '../util/queries';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { usePOContext } from './POContext';
import { formatTokenAmount } from '../util/formatToken';

const ProjectContext = createContext();

export const useProjectContext = () => useContext(ProjectContext);

const STATUS_TO_COLUMN = {
    'Open': 'Open',
    'Assigned': 'In Progress',
    'Submitted': 'In Review',
    'Completed': 'Completed',
    'Cancelled': null,
};

export const ProjectProvider = ({ children }) => {
    const [projectsData, setProjectsData] = useState([]);
    const [taskCount, setTaskCount] = useState(0);
    const [recommendedTasks, setRecommendedTasks] = useState([]);
    const { address } = useAccount();
    const { orgId, subgraphUrl } = usePOContext();

    const router = useRouter();

    // pollInterval replaces graph-client's @live directive — polls every 5s
    // to keep task data fresh. cache-and-network shows cached data instantly.
    const { data, loading, error } = useQuery(FETCH_PROJECTS_DATA_NEW, {
        variables: { orgId: orgId },
        skip: !orgId,
        fetchPolicy: 'cache-and-network',
        pollInterval: 5000,
        context: { subgraphUrl },
    });

    useEffect(() => {
        if (data?.organization?.taskManager) {
            const projects = data.organization.taskManager.projects || [];

            let totalTasks = 0;
            projects.forEach(project => {
                project.tasks?.forEach(task => {
                    if (task.status !== 'Cancelled') totalTasks++;
                });
            });
            setTaskCount(totalTasks);

            // Get recommended tasks (open tasks, randomly sorted)
            const openTasks = projects
                .flatMap(project =>
                    (project.tasks || [])
                        .filter(task => task.status === 'Open')
                        .map(task => {
                            const taskPayout = formatTokenAmount(task.payout || '0');
                            return {
                                ...task,
                                title: task.title || 'Indexing...',
                                name: task.title || 'Indexing...', // Alias for TaskManager components
                                description: '', // In IPFS
                                difficulty: 'medium', // Default
                                estHours: 1, // Default
                                payout: taskPayout,
                                Payout: taskPayout,
                                kubixPayout: taskPayout,
                                projectId: project.id,
                                projectTitle: project.title,
                                isIndexing: !task.title,
                            };
                        })
                )
;
            setRecommendedTasks(openTasks);

            // Transform projects for kanban board
            const transformedProjects = projects.map(project => {
                const projectTitle = project.title || 'Indexing...';
                const transformedProject = {
                    id: project.id,
                    title: projectTitle,
                    name: projectTitle, // Alias for TaskManager components
                    metadataHash: project.metadataHash,
                    // Use indexed metadata from subgraph as primary source
                    description: project.metadata?.description || '',
                    cap: project.cap,
                    rolePermissions: project.rolePermissions || [],
                    columns: [
                        { id: 'open', title: 'Open', tasks: [] },
                        { id: 'inProgress', title: 'In Progress', tasks: [] },
                        { id: 'inReview', title: 'In Review', tasks: [] },
                        { id: 'completed', title: 'Completed', tasks: [] },
                    ],
                };

                (project.tasks || []).forEach(task => {
                    if (task.status === 'Cancelled') return;

                    const taskTitle = task.title || 'Indexing...';
                    const taskPayout = formatTokenAmount(task.payout || '0');
                    const transformedTask = {
                        id: task.id,
                        taskId: task.taskId,
                        title: taskTitle,
                        name: taskTitle, // Alias for TaskManager components
                        // Use indexed metadata from subgraph as primary source
                        description: task.metadata?.description || '',
                        difficulty: task.metadata?.difficulty || 'medium',
                        estHours: task.metadata?.estimatedHours || 1,
                        // Raw hashes for IPFS fallback if indexed data is missing
                        metadataHash: task.metadataHash,
                        submissionHash: task.submissionHash,
                        // Submission text from subgraph (stored in metadata entity)
                        submission: task.metadata?.submission || '',
                        claimedBy: task.assignee || '',
                        payout: taskPayout,
                        Payout: taskPayout, // Alias with capital P for TaskCard
                        kubixPayout: taskPayout, // Alias for TaskColumn
                        bountyToken: task.bountyToken,
                        bountyPayout: formatTokenAmount(task.bountyPayout || '0'),
                        projectId: project.id,
                        status: task.status,
                        claimerUsername: task.assigneeUsername || '',
                        completerUsername: task.completerUsername || '',
                        requiresApplication: task.requiresApplication,
                        applications: task.applications || [],
                        // Transform applications to applicants format for TaskCardModal
                        applicants: (task.applications || []).map(app => ({
                            address: app.applicant,
                            username: app.applicantUsername || '',
                            applicationHash: app.applicationHash,
                            approved: app.approved,
                            appliedAt: app.appliedAt,
                        })),
                        rejectionHash: task.rejectionHash,
                        rejectionCount: task.rejectionCount || 0,
                        rejectionReason: (task.rejections || []).find(r => r.metadata?.rejection)?.metadata?.rejection || '',
                        rejections: (task.rejections || []).map(r => ({
                            rejectorUsername: r.rejectorUsername || '',
                            rejectedAt: r.rejectedAt,
                        })),
                        isIndexing: !task.title,
                        createdAt: task.createdAt,
                        assignedAt: task.assignedAt,
                        submittedAt: task.submittedAt,
                        completedAt: task.completedAt,
                    };

                    const columnTitle = STATUS_TO_COLUMN[task.status] || 'Open';
                    const column = transformedProject.columns.find(c => c.title === columnTitle);
                    if (column) {
                        column.tasks.push(transformedTask);
                    }
                });

                return transformedProject;
            });

            setProjectsData(transformedProjects);
        }
    }, [data]);

    const contextValue = useMemo(() => ({
        projectsData,
        taskCount,
        recommendedTasks,
        loading,
        error,
    }), [projectsData, taskCount, recommendedTasks, loading, error]);

    return (
        <ProjectContext.Provider value={contextValue}>
            {children}
        </ProjectContext.Provider>
    );
};
