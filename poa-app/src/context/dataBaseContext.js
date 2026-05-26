import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProjectContext } from './ProjectContext';
import { ALL_PROJECTS_ID } from '../components/TaskManager/views/allTasks';

// Synthetic "All Tasks" project used when the sidebar's cross-project entry is
// active. Identifies itself via ALL_PROJECTS_ID so MainLayout can branch on it,
// and exposes empty columns since the real columns are synthesized inside the
// AllTasksProvider (TaskBoardProvider's lifecycle stays out of this path).
const ALL_TASKS_PROJECT = Object.freeze({
  id: ALL_PROJECTS_ID,
  name: 'All Tasks',
  columns: [],
});

const DataBaseContext = createContext();

export const useDataBaseContext = () => {
  return useContext(DataBaseContext);
};

export const DataBaseProvider = ({ children }) => {
    const {projectsData}= useProjectContext();


    useEffect(()=>{
        if (typeof projectsData === 'object' && projectsData !== null && Object.keys(projectsData).length !== 0) {
            setProjects(projectsData);

            // Only set selectedProject if:
            // 1. No project is currently selected, OR
            // 2. The currently selected project is no longer in the list
            // This preserves the user's selection when data is refreshed.
            // The ALL_TASKS sentinel is also preserved across refreshes — it has
            // no backing project, so projectsData.find would return undefined
            // and we'd accidentally fall back to the first project.
            setSelectedProject(prev => {
                if (prev?.id === ALL_PROJECTS_ID) {
                    return ALL_TASKS_PROJECT;
                }
                // If we have a selection and it still exists in the new data, update it with fresh data
                if (prev && prev.id) {
                    const updatedProject = projectsData.find(p => p.id === prev.id);
                    if (updatedProject) {
                        return updatedProject;
                    }
                }
                // Otherwise default to first project
                return projectsData[0];
            });
        }
    },[projectsData])


    // Projects are populated from ProjectContext via useEffect
    const [projects, setProjects] = useState([]);

    // Ref-stabilize projects so setSelectedProjectId doesn't re-create on every data update
    const projectsRef = useRef(projects);
    projectsRef.current = projects;

    const [selectedProject,setSelectedProject] = useState('')

    const setSelectedProjectId = useCallback((projectId) => {
      if (projectId === ALL_PROJECTS_ID) {
        setSelectedProject(ALL_TASKS_PROJECT);
        return;
      }
      const project = projectsRef.current.find(project => project.id === projectId);
      setSelectedProject(project);
    }, []);

    // Placeholder function - username lookup should use subgraph data
    const getUsernameByAddress = useCallback(async (address) => {
      if (!address) return 'Unknown';
      return `${address.substring(0, 6)}...${address.substring(38)}`;
    }, []);

    // Handle column updates from TaskBoard.
    // Accepts an optional projectId to guard against stale updates when the user
    // switches projects while a transaction is still in-flight.
    const handleUpdateColumns = useCallback((newColumns, projectId) => {
      setSelectedProject(prev => {
        if (!prev) return prev;
        if (projectId && prev.id !== projectId) return prev;
        return { ...prev, columns: newColumns };
      });

      if (projectId) {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, columns: newColumns } : p
        ));
      }
    }, []);

    const contextValue = useMemo(() => ({
      projects,
      setSelectedProjectId,
      selectedProject,
      setSelectedProject,
      handleUpdateColumns,
      getUsernameByAddress,
    }), [projects, setSelectedProjectId, selectedProject, handleUpdateColumns, getUsernameByAddress]);

    return (
        <DataBaseContext.Provider value={contextValue}>
          {children}
        </DataBaseContext.Provider>
      );
    };