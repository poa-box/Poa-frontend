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
  } catch {}
}

const initialState = {
  isActive: false,
  currentStepId: null, // track by ID, not index, so reactive filtering works
  orgName: null,
  showPrompt: false,
};

function tourReducer(state, action) {
  switch (action.type) {
    case 'SHOW_PROMPT':
      return { ...state, showPrompt: true, orgName: action.payload };
    case 'DISMISS_PROMPT':
      return { ...state, showPrompt: false };
    case 'START_TOUR':
      return { ...state, isActive: true, currentStepId: action.payload.firstStepId, orgName: action.payload.orgName, showPrompt: false };
    case 'SET_STEP':
      return { ...state, currentStepId: action.payload };
    case 'COMPLETE_TOUR':
      return { ...state, isActive: false, currentStepId: null };
    case 'SKIP_TOUR':
      return { ...state, isActive: false, showPrompt: false, currentStepId: null };
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

  // Reactively compute effective steps from tourCtx (not frozen)
  const effectiveSteps = useMemo(() =>
    TOUR_STEPS.filter(step => !step.skip || !step.skip(tourCtx)),
    [tourCtx]
  );

  // Resolve current step index from ID
  const currentStepIndex = state.isActive
    ? effectiveSteps.findIndex(s => s.id === state.currentStepId)
    : -1;
  // If the current step was removed by a skip change, clamp to last step
  const safeIndex = currentStepIndex >= 0 ? currentStepIndex : Math.max(0, effectiveSteps.length - 1);
  const currentStepDef = state.isActive ? effectiveSteps[safeIndex] ?? null : null;
  const pendingAction = currentStepDef?.action || null;

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
    } catch {}
  }, [poContextLoading, orgName]);

  const showPrompt = useCallback((orgName) => {
    const saved = loadTourState(orgName);
    if (saved && (saved.status === 'completed' || saved.status === 'dismissed')) return;
    dispatch({ type: 'SHOW_PROMPT', payload: orgName });
  }, []);

  const dismissPrompt = useCallback(() => {
    if (state.orgName) {
      saveTourState(state.orgName, { status: 'dismissed', dismissedAt: Date.now() });
    }
    dispatch({ type: 'DISMISS_PROMPT' });
  }, [state.orgName]);

  const startTour = useCallback((orgName) => {
    const steps = TOUR_STEPS.filter(step => !step.skip || !step.skip(tourCtx));
    const firstId = steps[0]?.id;
    dispatch({ type: 'START_TOUR', payload: { orgName, firstStepId: firstId } });
    saveTourState(orgName, { status: 'active', stepId: firstId, startedAt: Date.now() });

    const firstStep = steps[0];
    if (firstStep?.page && firstStep.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || orgName;
      router.push(`${firstStep.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }
  }, [router, tourCtx]);

  const nextStep = useCallback(() => {
    const nextIdx = safeIndex + 1;
    if (nextIdx >= effectiveSteps.length) {
      saveTourState(state.orgName, { status: 'completed', completedAt: Date.now() });
      dispatch({ type: 'COMPLETE_TOUR' });
      return;
    }

    const nextStepDef = effectiveSteps[nextIdx];
    if (nextStepDef.page && nextStepDef.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || state.orgName;
      router.push(`${nextStepDef.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }

    dispatch({ type: 'SET_STEP', payload: nextStepDef.id });
    saveTourState(state.orgName, { status: 'active', stepId: nextStepDef.id });
  }, [safeIndex, effectiveSteps, state.orgName, router]);

  const prevStep = useCallback(() => {
    const prevIdx = safeIndex - 1;
    if (prevIdx < 0) return;

    const prevStepDef = effectiveSteps[prevIdx];
    if (prevStepDef.page && prevStepDef.page !== router.pathname) {
      const dao = router.query.org || router.query.userDAO || state.orgName;
      router.push(`${prevStepDef.page}?org=${encodeURIComponent(dao)}`).catch(() => {});
    }

    dispatch({ type: 'SET_STEP', payload: prevStepDef.id });
    saveTourState(state.orgName, { status: 'active', stepId: prevStepDef.id });
  }, [safeIndex, effectiveSteps, state.orgName, router]);

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
    currentStep: safeIndex,
    currentStepDef,
    totalSteps: effectiveSteps.length,
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
  }), [state, safeIndex, currentStepDef, effectiveSteps.length, pendingAction, tourCtx, showPrompt, dismissPrompt, startTour, nextStep, prevStep, skipTour, completeTour]);

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
