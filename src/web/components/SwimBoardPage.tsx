import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SwimBoard from './SwimBoard';
import { type Task } from '../../types';
import { resolvePriorityValue } from '../../utils/priority-config';
import { resolveProjectValue } from '../../utils/project-config';
import { resolveTaskTypeValue } from '../../utils/task-type-config';

/**
 * Fork-only page wrapper for the Kanban Swim view (/board/swim). Mirrors BoardPage's URL filter
 * sync (same parameter names, so filters survive moving between the board and swim views) without
 * touching BoardPage itself.
 */

interface SwimBoardPageProps {
  onEditTask: (task: Task) => void;
  onNewTask: () => void;
  tasks: Task[];
  onRefreshData?: () => Promise<void>;
  onTasksUpdated?: (tasks: Task[], requestTask: Task) => void;
  statuses: string[];
  availableLabels: string[];
  isLoading: boolean;
  loadingMessage?: string | null;
  loadError?: Error | null;
  hideEmptyColumns?: boolean;
  dateFormat?: string;
  availablePriorities?: string[];
  availableTypes?: string[];
  availableProjects?: string[];
}

export default function SwimBoardPage({
  onEditTask,
  onNewTask,
  tasks,
  onRefreshData,
  onTasksUpdated,
  statuses,
  availableLabels,
  isLoading,
  loadingMessage,
  loadError,
  hideEmptyColumns,
  dateFormat,
  availablePriorities,
  availableTypes,
  availableProjects,
}: SwimBoardPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const handleFiltersChange = (filters: { assignee: string; labels: string[]; priority: string; taskType: string; project: string }) => {
    setSearchParams((params) => {
      if (filters.assignee) {
        params.set('assignee', filters.assignee);
      } else {
        params.delete('assignee');
      }
      params.delete('label');
      params.delete('labels');
      for (const label of filters.labels) {
        const normalized = label.trim();
        if (normalized) {
          params.append('label', normalized);
        }
      }
      if (filters.priority) {
        params.set('priority', filters.priority);
      } else {
        params.delete('priority');
      }
      if (filters.taskType) {
        params.set('type', filters.taskType);
      } else {
        params.delete('type');
      }
      if (filters.project) {
        params.set('project', filters.project);
      } else {
        params.delete('project');
      }
      return params;
    }, { replace: true });
  };

  const filterAssignee = searchParams.get('assignee') ?? '';
  const filterLabels = [
    ...searchParams.getAll('label'),
    ...searchParams.getAll('labels').flatMap((value) => value.split(',')),
  ].map((label) => label.trim()).filter((label) => label.length > 0);
  const rawFilterPriority = searchParams.get('priority') ?? '';
  const filterPriority = resolvePriorityValue(rawFilterPriority, availablePriorities) ?? '';
  const rawFilterType = searchParams.get('type') ?? '';
  const filterType = resolveTaskTypeValue(rawFilterType, availableTypes) ?? '';
  const rawFilterProject = searchParams.get('project') ?? '';
  const filterProject = resolveProjectValue(rawFilterProject, availableProjects) ?? '';

  // Unknown filter values (renamed priorities/types/projects) resolve to no filter; sync the URL
  // so the address bar agrees with what the view actually shows.
  useEffect(() => {
    if (
      isLoading ||
      (rawFilterPriority === filterPriority && rawFilterType === filterType && rawFilterProject === filterProject)
    ) {
      return;
    }
    setSearchParams((params) => {
      if (filterPriority) {
        params.set('priority', filterPriority);
      } else {
        params.delete('priority');
      }
      if (filterType) {
        params.set('type', filterType);
      } else {
        params.delete('type');
      }
      if (filterProject) {
        params.set('project', filterProject);
      } else {
        params.delete('project');
      }
      return params;
    }, { replace: true });
  }, [
    filterPriority,
    filterType,
    filterProject,
    isLoading,
    rawFilterPriority,
    rawFilterType,
    rawFilterProject,
    setSearchParams,
  ]);

  return (
    <div className="page-shell transition-colors duration-200">
      <SwimBoard
        onEditTask={onEditTask}
        onNewTask={onNewTask}
        tasks={tasks}
        onRefreshData={onRefreshData}
        onTasksUpdated={onTasksUpdated}
        statuses={statuses}
        isLoading={isLoading}
        loadingMessage={loadingMessage}
        loadError={loadError}
        availableLabels={availableLabels}
        filterAssignee={filterAssignee}
        filterLabels={filterLabels}
        filterPriority={filterPriority}
        availablePriorities={availablePriorities}
        filterType={filterType}
        availableTypes={availableTypes}
        filterProject={filterProject}
        availableProjects={availableProjects}
        onFiltersChange={handleFiltersChange}
        hideEmptyColumns={hideEmptyColumns}
        dateFormat={dateFormat}
      />
    </div>
  );
}
