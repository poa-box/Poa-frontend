import { parseProjectId } from '@poa-box/core/encoding';
import { authorityTaskPermissionRows } from '@/lib/accessV2/taskPermissions';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';

const STATUS_TO_COLUMN = {
    'Open': 'Open',
    'Assigned': 'In Progress',
    'Submitted': 'In Review',
    'Completed': 'Completed',
    'Cancelled': null,
};

/** Host presentation only; canonical raw rows/source are retained by the read result. */
export function transformBoardProjects({ result, managersData, scope, currentSubjects = [], authorityForProject = () => undefined, authorityDisplayComplete = false, error }) {
    const projects = result.data.organization.taskManager.projects;
    const managersByProjectId = new Map();
    if (managersData?.coverage.status === 'complete' && !managersData.coverage.issues.length) {
        for (const row of managersData.data) {
            if (!managersByProjectId.has(row.project.id)) managersByProjectId.set(row.project.id, []);
            managersByProjectId.get(row.project.id).push(row.manager.toLowerCase());
        }
    }
    return projects.map(project => {
                const projectTitle = project.title || 'Indexing...';
                const transformedProject = {
                    id: project.id,
                    title: projectTitle,
                    name: projectTitle, // Alias for TaskManager components
                    metadataHash: project.metadataHash,
                    taskSource: result.source,
                    permissionsAvailable: !error && authorityDisplayComplete,
                    taskCoverage: error ? { ...result.coverage, status: 'incomplete' } : result.coverage,
                    authorityTaskProjection: authorityForProject(parseProjectId(project.id)),
                    managerFact: scope.account && scope.hydrated && managersData
                        ? result.projectManagerFact(managersData, result.source, parseProjectId(project.id), scope.account)
                        : { state: 'unknown', code: 'MANAGER_EVIDENCE_UNAVAILABLE' },
                    // Use indexed metadata from subgraph as primary source
                    description: project.metadata?.description || '',
                    // createdAt is indexed by the subgraph (unix seconds string); surfaced in the
                    // project info modal's stats. May be undefined on optimistic/indexing projects.
                    createdAt: project.createdAt,
                    cap: project.cap,
                    spent: project.spent || '0',
                    bountyCaps: project.bountyCaps || [],
                    rolePermissions: authorityTaskPermissionRows(currentSubjects, project.id),
                    // Context values are already folded; never fall back to the retired global table.
                    globalRolePermissions: [],
                    // Active project managers (lowercased). The contract's `_isPM` bypass —
                    // arrives from its own document, so it may be [] for a beat on first paint.
                    managers: managersByProjectId.get(project.id) || [],
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
                    const bountyTokenInfo = getTokenByAddress(task.bountyToken);
                    const transformedTask = {
                        id: task.id,
                        taskId: task.taskId,
                        title: taskTitle,
                        name: taskTitle, // Alias for TaskManager components
                        // Use indexed metadata from subgraph as primary source.
                        // Use ?? (not ||) to preserve empty strings as valid values
                        // and keep null to signal "not yet loaded" for the IPFS fallback.
                        description: task.metadata?.description ?? null,
                        difficulty: task.metadata?.difficulty ?? 'medium',
                        estHours: task.metadata?.estimatedHours ?? 1,
                        // Raw hashes for IPFS fallback if indexed data is missing
                        metadataHash: task.metadataHash,
                        submissionHash: task.submissionHash,
                        // Submission text from subgraph (stored in metadata entity)
                        submission: task.metadata?.submission ?? null,
                        claimedBy: task.assignee || '',
                        payout: taskPayout,
                        payoutRaw: task.payout,
                        Payout: taskPayout, // Alias with capital P for TaskCard
                        kubixPayout: taskPayout, // Alias for TaskColumn
                        bountyToken: task.bountyToken,
                        bountyPayoutRaw: task.bountyPayout,
                        bountyPayoutExact: task.bountyPayout == null ? undefined : formatTokenAmount(task.bountyPayout, bountyTokenInfo.decimals, bountyTokenInfo.decimals),
                        bountyPayout: formatTokenAmount(task.bountyPayout || '0', bountyTokenInfo.decimals, bountyTokenInfo.decimals <= 6 ? 2 : 2),
                        projectId: project.id,
                        status: task.status,
                        claimerUsername: task.assigneeUsername || '',
                        completerUsername: task.completerUsername || '',
                        requiresApplication: task.requiresApplication,
                        applications: task.applications || [],
                        applicationsComplete: false,
                        applicationCoverage: { status: 'preview', limit: 100 },
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
                        // ---- Deadlines (TaskManager v6) ----
                        // Raw subgraph passthrough (string seconds or null); consumers
                        // normalize via deadlineUtils.toSec (0/'0' also mean unset).
                        completionWindow: task.completionWindow,
                        absoluteDeadline: task.absoluteDeadline,
                        claimDeadline: task.claimDeadline,
                        reclaimCount: task.reclaimCount || 0,
                        claimExpiries: task.claimExpiries || [],
                        claimExpiryCoverage: { status: 'preview', limit: 5 },
                        // v7 claim release. Absent whenever the endpoint predates
                        // subgraph-pop #201 (or Apollo replays a cache entry that
                        // was normalized before the capability probe flipped), so
                        // these must default rather than assume the richer query ran.
                        releaseCount: task.releaseCount || 0,
                        lastReleasedAt: task.lastReleasedAt ?? null,
                        releases: task.releases || [],
                        releaseHistoryCoverage: { status: 'preview', limit: 5 },
                        // Soft due date lives in the IPFS metadata (unix seconds).
                        dueDate: task.metadata?.dueDate != null ? Number(task.metadata.dueDate) : null,
                    };

                    const columnTitle = STATUS_TO_COLUMN[task.status] || 'Open';
                    const column = transformedProject.columns.find(c => c.title === columnTitle);
                    if (column) {
                        column.tasks.push(transformedTask);
                    }
                });

                return transformedProject;
            });

}
