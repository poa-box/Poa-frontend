import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { TOUR_STEPS } from './tourSteps';

const TourContext = createContext(null);

function getTourStorageKey(orgName) {
  return `poa-tour-${orgName}`;
}

function loadTourState(orgName) {
  if (!orgName || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getTourStorageKey(orgName));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTourState(orgName, stateToSave) {
  if (!orgName || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getTourStorageKey(orgName), JSON.stringify(stateToSave));
  } catch {
    // localStorage full or unavailable
  }
}

const initialState = {
  isActive: false,
  currentStep: 0,
  orgName: null,
  showPrompt: false,
  frozenSteps: null, // filtered step list, set at tour start
};

function tourReducer(state, action) {
  switch (action.type) {
    case 'SHOW_PROMPT':
      return { ...state, showPrompt: true, orgName: action.payload };
    case 'DISMISS_PROMPT':
      return { ...state, showPrompt: false };
    case 'START_TOUR':
      return {
        ...state,
        isActive: true,
        currentStep: 0,
        orgName: action.payload.orgName,
        frozenSteps: action.payload.steps,
        showPrompt: false,
      };
    case 'NEXT_STEP':
      return { ...state, currentStep: state.currentStep + 1 };
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(0, state.currentStep - 1) };
    case 'COMPLETE_TOUR':
      return { ...state, isActive: false, currentStep: 0, frozenSteps: null };
    case 'SKIP_TOUR':
      return { ...state, isActive: false, showPrompt: false, currentStep: 0, frozenSteps: null };
    default:
      return state;
  }
}

export function TourProvider({ children }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(tourReducer, initialState);

  // Build tour context from app state (used for skip functions)
  const { isAuthenticated } = useAuth();
  const { hideTreasury, educationHubEnabled, poContextLoading } = usePOContext();
  const { hasMemberRole, hasExecRole } = useUserContext();
  const { projects } = useDataBaseContext();

  const tourCtx = useMemo(() => ({
    isAuthenticated,
    hasMemberRole,
    hasExecRole,
    hasProjects: !!(projects && projects.length > 0),
    hideTreasury: !!hideTreasury,
    educationHubEnabled: !!educationHubEnabled,
  }), [isAuthenticated, hasMemberRole, hasExecRole, projects, hideTreasury, educationHubEnabled]);

  // After a new org deploy, auto-show the tour prompt once org data has loaded
  const orgName = router.query.org || router.query.userDAO || '';
  useEffect(() => {
    if (poContextLoading || !orgName) return;
    try {
      const raw = localStorage.getItem('poa-new-org-deploy');
      if (!raw) return;
      const deployData = JSON.parse(raw);
      if (deployData.orgName === orgName) {
        localStorage.removeItem('poa-new-org-deploy');
        setTimeout(() => {
          dispatch({ type: 'SHOW_PROMPT', payload: orgName });
        }, 500);
      }
    } catch {
      // Ignore parse errors
    }
  }, [poContextLoading, orgName]);

  // Derive current step from frozen steps
  const steps = state.frozenSteps || TOUR_STEPS;
  const currentStepDef = state.isActive ? steps[state.currentStep] ?? null : null;
  const pendingAction = currentStepDef?.action || null;

  const showPrompt = useCallback((orgName) => {
    const saved = loadTourState(orgName);
    if (saved && (saved.status === 'completed' || saved.status === 'dismissed')) {
      return;
    }
    dispatch({ type: 'SHOW_PROMPT', payload: orgName });
  }, []);

  const dismissPrompt = useCallback(() => {
    if (state.orgName) {
      saveTourState(state.orgName, { status: 'dismissed', dismissedAt: Date.now() });
    }
    dispatch({ type: 'DISMISS_PROMPT' });
  }, [state.orgName]);

  const startTour = useCallback((orgName) => {
    // Filter steps based on current user/org state (frozen for tour duration)
    const filtered = TOUR_STEPS.filter(step => !step.skip || !step.skip(tourCtx));
    dispatch({ type: 'START_TOUR', payload: { orgName, steps: filtered } });
    saveTourState(orgName, { status: 'active', stepId: filtered[0]?.id, startedAt: Date.now() });

    const firstStep = filtered[0];
    if (firstStep?.page && firstStep.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || orgName;
      router.push(`${firstStep.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }
  }, [router, tourCtx]);

  const nextStep = useCallback(() => {
    const frozen = state.frozenSteps;
    if (!frozen) return;

    const nextIdx = state.currentStep + 1;
    if (nextIdx >= frozen.length) {
      saveTourState(state.orgName, { status: 'completed', completedAt: Date.now() });
      dispatch({ type: 'COMPLETE_TOUR' });
      return;
    }

    const nextStepDef = frozen[nextIdx];

    if (nextStepDef.page && nextStepDef.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || state.orgName;
      router.push(`${nextStepDef.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }

    dispatch({ type: 'NEXT_STEP' });
    saveTourState(state.orgName, { status: 'active', stepId: nextStepDef.id });
  }, [state.currentStep, state.orgName, state.frozenSteps, router]);

  const prevStep = useCallback(() => {
    const frozen = state.frozenSteps;
    if (!frozen) return;

    const prevIdx = state.currentStep - 1;
    if (prevIdx < 0) return;

    const prevStepDef = frozen[prevIdx];
    if (prevStepDef.page && prevStepDef.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || state.orgName;
      router.push(`${prevStepDef.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }

    dispatch({ type: 'PREV_STEP' });
    saveTourState(state.orgName, { status: 'active', stepId: prevStepDef.id });
  }, [state.currentStep, state.orgName, state.frozenSteps, router]);

  const skipTour = useCallback(() => {
    if (state.orgName) {
      saveTourState(state.orgName, { status: 'dismissed', dismissedAt: Date.now() });
    }
    dispatch({ type: 'SKIP_TOUR' });
  }, [state.orgName]);

  const completeTour = useCallback(() => {
    if (state.orgName) {
      saveTourState(state.orgName, { status: 'completed', completedAt: Date.now() });
    }
    dispatch({ type: 'COMPLETE_TOUR' });
  }, [state.orgName]);

  // Auto-advance when a pending action's refresh event fires
  const nextStepRef = React.useRef(nextStep);
  nextStepRef.current = nextStep;
  const autoAdvancePendingRef = React.useRef(false);

  useRefreshSubscription(
    [RefreshEvent.PROJECT_CREATED, RefreshEvent.TASK_CREATED],
    useCallback((event) => {
      if (!state.isActive || !pendingAction || autoAdvancePendingRef.current) return;
      if (pendingAction === 'create-project' && event.event === RefreshEvent.PROJECT_CREATED) {
        autoAdvancePendingRef.current = true;
        setTimeout(() => { autoAdvancePendingRef.current = false; nextStepRef.current(); }, 1500);
      }
      if (pendingAction === 'create-task' && event.event === RefreshEvent.TASK_CREATED) {
        autoAdvancePendingRef.current = true;
        setTimeout(() => { autoAdvancePendingRef.current = false; nextStepRef.current(); }, 1500);
      }
    }, [state.isActive, pendingAction]),
    [state.isActive, pendingAction]
  );

  const value = useMemo(() => ({
    isActive: state.isActive,
    currentStep: state.currentStep,
    currentStepDef,
    totalSteps: state.frozenSteps?.length ?? 0,
    pendingAction,
    orgName: state.orgName,
    showPromptModal: state.showPrompt,
    tourCtx,
    showPrompt,
    dismissPrompt,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
  }), [state, currentStepDef, pendingAction, tourCtx, showPrompt, dismissPrompt, startTour, nextStep, prevStep, skipTour, completeTour]);

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return {
      isActive: false,
      currentStep: 0,
      currentStepDef: null,
      totalSteps: 0,
      pendingAction: null,
      orgName: null,
      showPromptModal: false,
      tourCtx: {},
      showPrompt: () => {},
      dismissPrompt: () => {},
      startTour: () => {},
      nextStep: () => {},
      prevStep: () => {},
      skipTour: () => {},
      completeTour: () => {},
    };
  }
  return ctx;
}

export default TourContext;
