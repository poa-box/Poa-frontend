import { useProjectCreator } from '@/hooks/useProjectCreator';
import { useAuthoritySubjects } from '@/hooks/accessV2/useAuthoritySubjects';
import { authorityTaskPermissionRows } from '@/lib/accessV2/taskPermissions';
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { parseProjectId } from '@poa-box/core/encoding';
import { requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { useAuth } from '@/context/authState';
import { useBoardProjectReads } from '@/hooks/useBoardProjectReads';
import { usePOContext } from '@/context/POContext';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { transformBoardProjects } from '@/lib/tasks/boardPresentation';
import { projectTaskAuthorityFacts, isCurrentBoardProject } from '@/lib/tasks/authorityPolicy';
import { useUserActive } from '@/hooks/useUserActive';
import { useSubgraphClient } from '@/util/apolloClient';
import { CAPABILITY } from '@/util/subgraphCapabilities';
import { useSubgraphCapability } from '@/hooks/useSubgraphCapability';

const ProjectContext = createContext();

export const useProjectContext = () => useContext(ProjectContext);

const UNAVAILABLE_ACTIONS = Object.fromEntries(['create', 'createAndAssign', 'claim', 'apply', 'assign', 'submit',
    'complete', 'reject', 'cancel', 'editFull', 'editMetadata', 'release', 'budget', 'deleteProject']
    .map(action => [action, { state: 'unknown', reasons: ['INCOMPLETE_SOURCE'] }]));

export const ProjectProvider = ({ children }) => {
    const [projectsData, setProjectsData] = useState([]);
    // IDs remain unknown until a creation receipt or the indexer supplies them.
    const nextTaskId = null;
    // Org-wide ROLE_PERM grants, lifted to state so consumers can read them without a
    // project in hand (e.g. the Create Project modal, which shows them as a baseline
    // even when the org has zero projects yet).
    const [globalRolePermissions, setGlobalRolePermissions] = useState([]);
    const { orgId, orgChainId, taskManagerContractAddress, subgraphUrl, initialSnapshotLoaded } = usePOContext();
    const { accountAddress, isAuthHydrated, isAuthenticated } = useAuth();
    const identityReady = isAuthHydrated === true && isAuthenticated === true;
    const source = useMemo(() => ({ chainId: orgChainId, orgId, contract: taskManagerContractAddress,
        endpoint: subgraphUrl, indexed: true, snapshot: 'latest', method: 'task-board' }),
        [orgChainId, orgId, taskManagerContractAddress, subgraphUrl]);

    const client = useSubgraphClient(subgraphUrl);
    const isActive = useUserActive();

    // Select the current endpoint's known schema synchronously; an unknown
    // endpoint starts with the compatible base document until its probe settles.
    const releasesSupported = useSubgraphCapability(subgraphUrl, CAPABILITY.TASK_RELEASES);

    const boardRead = useBoardProjectReads({ client, source, isActive, releasesSupported, initialSnapshotLoaded });
    const authoritySubjects = useAuthoritySubjects({ block: boardRead.result?.source.block });
    const currentSubjects = useMemo(() => authoritySubjects.enabled && !authoritySubjects.error
        ? authoritySubjects.subjects : [], [authoritySubjects.enabled, authoritySubjects.error, authoritySubjects.subjects]);
    const authorityEvidence = useMemo(() => ({ enabled: authoritySubjects.enabled, error: authoritySubjects.error,
        scope: authoritySubjects.scope, snapshot: authoritySubjects.snapshot, taskPolicyForProject: authoritySubjects.taskPolicyForProject }),
        [authoritySubjects.enabled, authoritySubjects.error, authoritySubjects.scope, authoritySubjects.snapshot, authoritySubjects.taskPolicyForProject]);
    const creatorScope = useMemo(() => ({ chainId: orgChainId, orgId, contract: taskManagerContractAddress,
        endpoint: subgraphUrl, account: accountAddress, contracts: { membershipAuthority: authoritySubjects.scope?.contract } }),
        [orgChainId, orgId, taskManagerContractAddress, subgraphUrl, accountAddress, authoritySubjects.scope?.contract]);
    const creatorRead = useProjectCreator({ authority: authoritySubjects.snapshot, scope: creatorScope,
        enabled: identityReady && authoritySubjects.complete && !authoritySubjects.error && !boardRead.error && !!boardRead.result });
    const creatorRef = useRef(); creatorRef.current = creatorRead;
    const assertProjectCreator = useCallback(() => {
        if (creatorRef.current?.facts?.authorized.state !== 'known' || !creatorRef.current.facts.authorized.value) {
            throw new Error('Project creation permissions are unavailable or this account cannot create projects.');
        }
    }, []);
    const authorityForProject = useCallback(projectId => projectTaskAuthorityFacts({ authority: authorityEvidence,
        projectId, scope: { ...source, account: accountAddress, hydrated: identityReady }, source: boardRead.result?.source, projectCreator: creatorRead.input }),
        [authorityEvidence, source, accountAddress, identityReady, boardRead.result, creatorRead.input]);
    const boardReleasesSupported = releasesSupported && boardRead.result?.hasReleaseData === true;
    const data = boardRead.result?.data;
    const error = boardRead.error;
    const refetch = boardRead.refetch;
    const managersData = boardRead.managers;
    // Reset the board the moment the org changes — otherwise the previous org's
    // projects survive until (and unless) the new org's query answers with a
    // taskManager, and actions would pair the new org's TaskManager address
    // with the old org's composite ids.
    const readScopeKey = JSON.stringify([orgId, orgChainId, taskManagerContractAddress, subgraphUrl]);
    const prevOrgIdRef = useRef(readScopeKey);
    useEffect(() => {
        if (prevOrgIdRef.current === readScopeKey) return;
        prevOrgIdRef.current = readScopeKey;
        setProjectsData([]);
        setGlobalRolePermissions([]);
    }, [readScopeKey]);

    // A failed read settles loading with an explicit error; it does not certify an empty board.
    const projectsLoading = !!orgId && boardRead.loading && !data;

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    // When the user returns (tab visible / mouse moves), refetch immediately
    // so stale data doesn't persist until the next poll tick.
    const wasActiveRef = useRef(isActive);
    useEffect(() => {
        if (isActive && !wasActiveRef.current && orgId) {
            refetchRef.current();
        }
        wasActiveRef.current = isActive;
    }, [isActive, orgId]);

    // Refetch immediately — executeWithNotification already waited for the
    // subgraph to index the transaction block before emitting the event.
    const handleRefresh = useCallback(() => {
        if (orgId) {
            refetchRef.current();
        }
    }, [orgId]);

    // Project changes refresh both complete collections, including their manager records.
    const handleProjectSetChange = useCallback(() => {
        if (orgId) {
            refetchRef.current();
        }
    }, [orgId]);

    useRefreshSubscription(
        [
            RefreshEvent.PROJECT_CREATED,
            RefreshEvent.PROJECT_DELETED,
            // setConfig(PROJECT_MANAGER, ...) is executor-only, i.e. it only happens
            // when a proposal executes — the one other event that changes managers.
            RefreshEvent.PROPOSAL_COMPLETED,
        ],
        handleProjectSetChange,
        [handleProjectSetChange]
    );

    useRefreshSubscription(
        [
            // PROJECT_CREATED / PROJECT_DELETED are handled by handleProjectSetChange
            // above, which also refreshes the managers document.
            RefreshEvent.PROJECT_BUDGET_UPDATED,
            RefreshEvent.TASK_CREATED,
            RefreshEvent.TASK_CLAIMED,
            RefreshEvent.TASK_SUBMITTED,
            RefreshEvent.TASK_COMPLETED,
            RefreshEvent.TASK_UPDATED,
            RefreshEvent.TASK_CANCELLED,
            RefreshEvent.TASK_REJECTED,
            RefreshEvent.TASK_ASSIGNED,
            RefreshEvent.TASK_UNCLAIMED,
            RefreshEvent.TASK_APPLICATION_SUBMITTED,
            RefreshEvent.TASK_APPLICATION_APPROVED,
        ],
        handleRefresh,
        [handleRefresh]
    );

    useEffect(() => {
        if (data?.organization?.taskManager) {
            // Org-wide ROLE_PERM grants — shared across every project under this TaskManager.
            // Exact project-context permissions are supplied by the authority projection.
            // Also surfaced at the context level (below) for consumers that need the org-wide
            // grants without a project — e.g. the Create Project modal's baseline display.
            const globalPerms = authorityTaskPermissionRows(currentSubjects);
            setGlobalRolePermissions(globalPerms);

            const transformedProjects = transformBoardProjects({ result: boardRead.result, managersData,
                scope: { ...source, account: accountAddress, hydrated: identityReady }, currentSubjects, authorityForProject, authorityDisplayComplete: authoritySubjects.complete && !authoritySubjects.error, error });
            setProjectsData(transformedProjects);
        }
    }, [data, error, managersData, currentSubjects, accountAddress, identityReady, source, boardRead.result, authorityForProject, authoritySubjects.complete, authoritySubjects.error]);

    // Derive taskCount from projectsData (correctly excludes cancelled tasks)
    const taskCount = useMemo(() => {
        let totalTasks = 0;
        projectsData.forEach(project => {
            project.columns?.forEach(col => {
                totalTasks += col.tasks?.length || 0;
            });
        });
        return totalTasks;
    }, [projectsData]);

    // Dashboard totals use the complete canonical observation, not the preview
    // or a previous render's board. Failed/loading/old-scope reads are unavailable.
    const taskTotals = useMemo(() => {
        const unavailable = { active: null, completed: null };
        if (boardRead.loading || error || !boardRead.result) return unavailable;
        try {
            const observed = requireCompleteSnapshot(boardRead.result, {
                scope: { chainId: source.chainId, orgId: source.orgId,
                    contract: source.contract, endpoint: source.endpoint },
                indexed: true, snapshot: 'pinned',
            });
            const projects = observed?.organization?.taskManager?.projects;
            if (!Array.isArray(projects)) return unavailable;
            let active = 0, completed = 0;
            for (const project of projects) {
                if (!Array.isArray(project.tasks)) return unavailable;
                for (const task of project.tasks) {
                    if (task.status === 'Completed') completed++;
                    else if (task.status !== 'Cancelled') active++;
                }
            }
            return { active, completed };
        } catch { return unavailable; }
    }, [boardRead.loading, boardRead.result, error, source]);

    // Derive recommended (open) tasks from projectsData
    const recommendedTasks = useMemo(() => {
        return projectsData.flatMap(project =>
            (project.columns?.find(c => c.id === 'open')?.tasks || []).map(task => ({
                ...task,
                projectTitle: project.title,
            }))
        );
    }, [projectsData]);

    const [applicationReads, setApplicationReads] = useState({});
    const applicationsKey = JSON.stringify([source, accountAddress, identityReady, boardRead.result?.source]);
    const applicationScope = useMemo(() => ({ key: applicationsKey, client }), [applicationsKey, client]);
    const applicationsScopeRef = useRef(); applicationsScopeRef.current = applicationScope;
    const applicationPending = useMemo(() => new Map(), [applicationScope]);
    useEffect(() => { applicationsScopeRef.current = applicationScope; return () => { if (applicationsScopeRef.current === applicationScope) applicationsScopeRef.current = null; }; }, [applicationScope]);
    const ensureTaskApplications = useCallback(async (task, retry = false) => {
        if (!identityReady || !boardRead.result || error || !task?.id || applicationsScopeRef.current !== applicationScope) return null;
        const key = task.id;
        if (applicationPending.has(key)) return applicationPending.get(key);
        if (!retry && applicationReads[task.id]?.scope === applicationScope) return applicationReads[task.id];
        setApplicationReads(previous => ({ ...previous, [task.id]: { scope: applicationScope, loading: true,
            applicants: previous[task.id]?.scope === applicationScope ? previous[task.id].applicants : undefined } }));
        const run = (async () => {
            try {
                const { readTaskApplications } = await import('@/lib/tasks/applications');
                if (applicationsScopeRef.current !== applicationScope) return null;
                const result = await readTaskApplications({ client, source: boardRead.result.source, task: task.id });
                if (applicationsScopeRef.current !== applicationScope) return null;
                const value = { scope: applicationScope, ...result };
                setApplicationReads(previous => ({ ...previous, [task.id]: value }));
                return value;
            } catch {
                if (applicationsScopeRef.current === applicationScope) setApplicationReads(previous => ({ ...previous,
                    [task.id]: { scope: applicationScope, applicants: previous[task.id]?.scope === applicationScope ? previous[task.id].applicants : undefined, error: 'Applications could not finish loading. Please try again.' } }));
                return null;
            } finally { applicationPending.delete(key); }
        })();
        applicationPending.set(key, run);
        return run;
    }, [identityReady, boardRead.result, error, applicationScope, applicationPending, applicationReads, client]);
    useEffect(() => { setApplicationReads({}); }, [applicationScope]);
    const getTaskApplicationRead = useCallback(task => applicationReads[task?.id]?.scope === applicationScope
        ? applicationReads[task.id] : null, [applicationReads, applicationScope]);

    const getTaskActions = useCallback((task, project, now = Date.now()) => {
        const scope = { ...source, account: accountAddress, hydrated: identityReady,
            projectId: project?.id };
        const runtime = boardRead.result;
        if (error || !isCurrentBoardProject(project, runtime)) return UNAVAILABLE_ACTIONS;
        const authority = authorityForProject(parseProjectId(project?.id || '0'));
        // Optimistic cards may still carry pre-claim status/pointers during their
        // grace period. Those display fields are not indexed policy evidence.
        const observedTask = task && project?.columns?.flatMap(column => column.tasks).find(row => row.id === task.id);
        const policyTask = !task ? null : observedTask
            ? { ...observedTask, isIndexing: observedTask.isIndexing || task.isIndexing }
            : { id: task.id, projectId: task.projectId, isIndexing: true };
        return runtime.taskActionPolicy({ scope, task: policyTask && { ...policyTask, applicationsEvidence: getTaskApplicationRead(task)?.snapshot }, project, authority, now, releasesSupported: boardReleasesSupported });
    }, [source, accountAddress, identityReady, authorityForProject, boardReleasesSupported, boardRead.result, error, getTaskApplicationRead]);

    const hasReviewCapability = useCallback(project => {
        const runtime = boardRead.result;
        if (error || !isCurrentBoardProject(project, runtime)) return false;
        const scope = { ...source, account: accountAddress, hydrated: identityReady };
        const authority = authorityForProject(parseProjectId(project?.id || '0'));
        return runtime.projectHasReviewCapability({ scope, project, authority });
    }, [source, accountAddress, identityReady, authorityForProject, boardRead.result, error, getTaskApplicationRead]);

    const contextValue = useMemo(() => ({
        projectsData,
        projectsLoading,
        projectsError: error,
        refetchProjects: refetch,
        getTaskActions,
        ensureTaskApplications, getTaskApplicationRead,
        projectCreator: creatorRead.facts?.authorized,
        assertProjectCreator,
        hasReviewCapability,
        taskCount,
        taskTotals,
        recommendedTasks,
        nextTaskId,
        globalRolePermissions,
        // Exposed so the release ACTION can be gated on the same probe as the
        // release FIELDS. The TaskUnclaimed mapping handler ships in the same
        // subgraph release as these fields, so an endpoint that fails the probe
        // also cannot index a release — the board would show the task as still
        // claimed forever, and the next click would revert BadStatus.
        releasesSupported: boardReleasesSupported,
    }), [projectsData, projectsLoading, error, refetch, getTaskActions, hasReviewCapability, taskCount, taskTotals, recommendedTasks, nextTaskId, globalRolePermissions, boardReleasesSupported, creatorRead.facts, assertProjectCreator, ensureTaskApplications, getTaskApplicationRead]);

    return React.createElement(ProjectContext.Provider, { value: contextValue }, children);
};
