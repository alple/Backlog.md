import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Task } from '../../types';
import { apiClient } from '../lib/api';
import {
  buildEpicLanes,
  buildInitiativeGroups,
  buildSubtaskIndex,
  type EpicLane,
  groupInitiativeDirectTasks,
  groupTasksByEpicLaneAndStatus,
  laneKeyForTask,
} from '../lib/epic-lanes';
import { collectAvailableLabels, labelsToLower } from '../../utils/label-filter';
import { getPriorityOptions, normalizePriorityValue } from '../../utils/priority-config';
import { getProjectValues, matchesProjectFilter } from '../../utils/project-config';
import { getTaskTypeValues, matchesTaskTypeFilter } from '../../utils/task-type-config';
import TaskCard from './TaskCard';
import LabelFilterDropdown from './LabelFilterDropdown';
import { BoardLoadingSkeleton } from './BoardLoadingSkeleton';

/**
 * Kanban Swim: a fork-only epic swim-lane board at /board/swim. Mirrors the regular board's
 * milestone lane layout (Board.tsx) but groups tasks under epic parents, reusing TaskCard and the
 * existing reorder endpoint. Deliberately does not modify Board.tsx or lanes.ts so upstream merges
 * stay conflict-free.
 */

const SWIM_COLLAPSED_LANES_KEY = 'backlog.swim.collapsedLanes';

const SWIM_FILTER_SELECT_CLASS =
  'min-w-[140px] h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200';

const SWIM_FILTER_BUTTON_CLASS =
  'h-10 py-2 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg whitespace-nowrap transition-colors duration-200 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700';

interface SwimRow {
  task: Task;
  depth: 0 | 1;
  hasSubtasks: boolean;
  expanded: boolean;
  subtaskCount: number;
}

interface SwimBoardProps {
  onEditTask: (task: Task) => void;
  onNewTask: () => void;
  tasks: Task[];
  onRefreshData?: () => Promise<void>;
  onTasksUpdated?: (tasks: Task[], requestTask: Task) => void;
  statuses: string[];
  isLoading: boolean;
  loadingMessage?: string | null;
  loadError?: Error | null;
  availableLabels: string[];
  filterAssignee?: string;
  filterLabels?: string[];
  filterPriority?: string;
  availablePriorities?: string[];
  filterType?: string;
  availableTypes?: string[];
  filterProject?: string;
  availableProjects?: string[];
  onFiltersChange?: (filters: { assignee: string; labels: string[]; priority: string; taskType: string; project: string }) => void;
  hideEmptyColumns?: boolean;
  dateFormat?: string;
}

interface SwimColumnProps {
  status: string;
  rows: SwimRow[];
  laneId: string;
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
  onEditTask: (task: Task) => void;
  onRowReorder: (payload: { laneId: string; taskId: string; targetStatus: string; orderedTaskIds: string[] }) => void;
  onForeignDrop: () => void;
  dragSourceStatus: string | null;
  dragSourceLane: string | null;
  onDragStart: (context: { status: string; laneId: string }) => void;
  onDragEnd: () => void;
  availableTypes?: string[];
  availableProjects?: string[];
  dateFormat?: string;
  onToggleExpand: (taskId: string) => void;
}

const getStatusBadgeClass = (status: string) => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('done') || statusLower.includes('complete')) {
    return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 transition-colors duration-200';
  }
  if (statusLower.includes('progress') || statusLower.includes('doing')) {
    return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 transition-colors duration-200';
  }
  if (statusLower.includes('blocked') || statusLower.includes('stuck')) {
    return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 transition-colors duration-200';
  }
  return 'bg-stone-100 dark:bg-stone-900 text-stone-800 dark:text-stone-200 transition-colors duration-200';
};

const SwimColumn: React.FC<SwimColumnProps> = ({
  status,
  rows,
  laneId,
  onTaskUpdate,
  onEditTask,
  onRowReorder,
  onForeignDrop,
  dragSourceStatus,
  dragSourceLane,
  onDragStart,
  onDragEnd,
  availableTypes,
  availableProjects,
  dateFormat,
  onToggleExpand,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<{ index: number; position: 'before' | 'after' | 'self' } | null>(null);

  const rowTasks = useMemo(() => rows.map((row) => row.task), [rows]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setDropPosition(null);

    const droppedTaskId = e.dataTransfer.getData('text/plain');
    const sourceLane = e.dataTransfer.getData('text/lane');
    if (!droppedTaskId) return;

    // Drops are confined to the card's own epic lane; re-parenting happens via the task editor.
    if (sourceLane && sourceLane !== laneId) {
      onForeignDrop();
      return;
    }

    const columnWithoutDropped = rowTasks.filter((task) => task.id !== droppedTaskId);

    let insertIndex = columnWithoutDropped.length;
    if (dropPosition) {
      // 'self' resolves to the card's own spot so a release in place is a no-op, not an append.
      const { index, position } = dropPosition;
      const baseIndex = position === 'after' ? index + 1 : index;
      let count = 0;
      for (let i = 0; i < Math.min(baseIndex, rowTasks.length); i += 1) {
        if (rowTasks[i]?.id === droppedTaskId) {
          continue;
        }
        count += 1;
      }
      insertIndex = count;
    }

    const orderedTaskIds = columnWithoutDropped.map((task) => task.id);
    orderedTaskIds.splice(insertIndex, 0, droppedTaskId);

    const isOrderUnchanged =
      orderedTaskIds.length === rowTasks.length &&
      orderedTaskIds.every((taskId, idx) => taskId === rowTasks[idx]?.id);
    if (isOrderUnchanged) {
      return;
    }

    onRowReorder({ laneId, taskId: droppedTaskId, targetStatus: status, orderedTaskIds });
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDropPosition(null);
    }
  };

  const handleDragOverColumn = (e: React.DragEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.classList.contains('space-y-3')) {
      setDropPosition(null);
    }
  };

  const isEmpty = rows.length === 0;

  return (
    <div
      className={`rounded-lg p-4 transition-colors duration-200 h-full ${
        isEmpty ? 'min-h-24' : 'min-h-96'
      } ${
        isDragOver && (dragSourceStatus !== status || (dragSourceLane ?? null) !== laneId)
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-600 border-dashed'
          : isEmpty
            ? 'bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/50'
            : 'bg-white border border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOverColumn}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200">{status}</h3>
          <span className={`px-2 py-1 text-xs font-medium rounded-circle ${getStatusBadgeClass(status)}`}>
            {rows.length}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={row.task.id}
            className="relative"
            onDragOver={(e) => {
              if (!draggedTaskId) return;
              if (draggedTaskId === row.task.id) {
                e.preventDefault();
                setDropPosition({ index, position: 'self' });
                return;
              }
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              if (y < rect.height / 2) {
                setDropPosition({ index, position: 'before' });
              } else {
                setDropPosition({ index, position: 'after' });
              }
            }}
          >
            {dropPosition?.index === index && dropPosition.position === 'before' && (
              <div className="h-1 bg-blue-500 rounded-full mb-2 animate-pulse" />
            )}

            {row.depth === 0 && row.hasSubtasks && (
              <button
                type="button"
                onClick={() => onToggleExpand(row.task.id)}
                aria-expanded={row.expanded}
                className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-200"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${row.expanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {row.subtaskCount} {row.subtaskCount === 1 ? 'subtask' : 'subtasks'}
              </button>
            )}

            <div className={row.depth === 1 ? 'ml-5' : undefined}>
              <TaskCard
                task={row.task}
                onUpdate={onTaskUpdate}
                onEdit={onEditTask}
                onDragStart={() => {
                  setDraggedTaskId(row.task.id);
                  onDragStart({ status, laneId });
                }}
                onDragEnd={() => {
                  setDraggedTaskId(null);
                  setDropPosition(null);
                  onDragEnd();
                }}
                status={status}
                laneId={laneId}
                availableTypes={availableTypes}
                availableProjects={availableProjects}
                dateFormat={dateFormat}
              />
            </div>

            {dropPosition?.index === index && dropPosition.position === 'after' && (
              <div className="h-1 bg-blue-500 rounded-full mt-2 animate-pulse" />
            )}
          </div>
        ))}

        {isEmpty && !isDragOver && (
          <div className="text-center py-2 text-gray-400 dark:text-gray-500 text-xs transition-colors duration-200">
            {dragSourceStatus && dragSourceStatus !== status ? 'Drop to move' : 'Empty'}
          </div>
        )}
      </div>
    </div>
  );
};

const SwimBoard: React.FC<SwimBoardProps> = ({
  onEditTask,
  onNewTask,
  tasks,
  onRefreshData,
  onTasksUpdated,
  statuses,
  isLoading,
  loadingMessage,
  loadError,
  availableLabels,
  filterAssignee = '',
  filterLabels = [],
  filterPriority = '',
  availablePriorities,
  filterType = '',
  availableTypes,
  filterProject = '',
  availableProjects,
  onFiltersChange,
  hideEmptyColumns = false,
  dateFormat,
}) => {
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [dragSourceStatus, setDragSourceStatus] = useState<string | null>(null);
  const [dragSourceLane, setDragSourceLane] = useState<string | null>(null);
  const [hiddenColumnsRevealed, setHiddenColumnsRevealed] = useState(false);
  const revealHiddenColumnsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [laneDragKey, setLaneDragKey] = useState<string | null>(null);
  const [laneDropIndicator, setLaneDropIndicator] = useState<{ key: string; position: 'before' | 'after' } | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = window.localStorage.getItem(SWIM_COLLAPSED_LANES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SWIM_COLLAPSED_LANES_KEY, JSON.stringify(collapsedLanes));
    } catch {
      // Persisting collapse state is best-effort; the view works without it.
    }
  }, [collapsedLanes]);

  const priorityOptions = useMemo(
    () => [{ label: 'All priorities', value: '' }, ...getPriorityOptions(availablePriorities)],
    [availablePriorities]
  );
  const typeOptions = useMemo(() => getTaskTypeValues(availableTypes), [availableTypes]);
  const projectOptions = useMemo(() => getProjectValues(availableProjects), [availableProjects]);

  const uniqueAssignees = useMemo(() => {
    const seen = new Set<string>();
    for (const task of tasks) {
      for (const a of task.assignee) {
        if (a.trim()) seen.add(a.trim());
      }
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const uniqueLabels = useMemo(() => collectAvailableLabels(tasks, availableLabels), [tasks, availableLabels]);

  const normalizedFilterLabels = useMemo(
    () => filterLabels.map((label) => label.trim()).filter((label) => label.length > 0),
    [filterLabels]
  );

  const hasActiveFilters =
    filterAssignee !== '' ||
    normalizedFilterLabels.length > 0 ||
    filterPriority !== '' ||
    filterType !== '' ||
    filterProject !== '';

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterAssignee === '__unassigned__') {
      result = result.filter((task) => !task.assignee || task.assignee.length === 0 || task.assignee.every((a) => !a.trim()));
    } else if (filterAssignee) {
      result = result.filter((task) => task.assignee.some((a) => a.trim() === filterAssignee));
    }
    if (normalizedFilterLabels.length > 0) {
      const selectedLabels = new Set(labelsToLower(normalizedFilterLabels));
      result = result.filter((task) => labelsToLower(task.labels).some((label) => selectedLabels.has(label)));
    }
    if (filterPriority) {
      const normalizedFilterPriority = normalizePriorityValue(filterPriority);
      result = result.filter((task) => normalizePriorityValue(task.priority) === normalizedFilterPriority);
    }
    if (filterType) {
      result = result.filter((task) => matchesTaskTypeFilter(task.type, filterType));
    }
    if (filterProject) {
      result = result.filter((task) => matchesProjectFilter(task.project, filterProject));
    }
    return result;
  }, [tasks, filterAssignee, normalizedFilterLabels, filterPriority, filterType, filterProject]);

  const lanes = useMemo(() => buildEpicLanes(tasks), [tasks]);

  // Unfiltered grouping drives counts and progress so collapsed lanes report their real totals.
  const tasksByLane = useMemo(
    () => groupTasksByEpicLaneAndStatus(lanes, statuses, tasks),
    [lanes, statuses, tasks]
  );
  const filteredTasksByLane = useMemo(
    () => groupTasksByEpicLaneAndStatus(lanes, statuses, filteredTasks),
    [lanes, statuses, filteredTasks]
  );

  const displayTasksByLane = hasActiveFilters ? filteredTasksByLane : tasksByLane;
  const metadataTasksByLane = hasActiveFilters ? filteredTasksByLane : tasksByLane;

  const subtaskIndex = useMemo(
    () => buildSubtaskIndex(hasActiveFilters ? filteredTasks : tasks),
    [hasActiveFilters, filteredTasks, tasks]
  );

  const initiativeGroups = useMemo(() => buildInitiativeGroups(tasks, lanes), [tasks, lanes]);
  const claimedLaneKeys = useMemo(
    () => new Set(initiativeGroups.flatMap((group) => group.childLanes.map((lane) => lane.key))),
    [initiativeGroups]
  );
  const standaloneLanes = useMemo(
    () => lanes.filter((lane) => !lane.isNoEpic && !claimedLaneKeys.has(lane.key)),
    [lanes, claimedLaneKeys]
  );
  const noEpicLane = useMemo(() => lanes.find((lane) => lane.isNoEpic), [lanes]);

  // An initiative's direct non-epic children get their own nested "Tasks" cells, keyed by the
  // initiative's direct lane key.
  const displayDirectByLane = useMemo(
    () => groupInitiativeDirectTasks(hasActiveFilters ? filteredTasks : tasks, statuses),
    [hasActiveFilters, filteredTasks, tasks, statuses]
  );
  const metadataDirectByLane = useMemo(
    () => groupInitiativeDirectTasks(tasks, statuses),
    [tasks, statuses]
  );

  const getDisplayCells = (laneKey: string): Map<string, Task[]> | undefined =>
    displayTasksByLane.get(laneKey) ?? displayDirectByLane.get(laneKey);
  const getMetadataCells = (laneKey: string): Map<string, Task[]> | undefined =>
    metadataTasksByLane.get(laneKey) ?? metadataDirectByLane.get(laneKey);

  const getRowsForLane = (laneKey: string, status: string): SwimRow[] => {
    const children = getDisplayCells(laneKey)?.get(status) ?? [];
    const rows: SwimRow[] = [];
    for (const child of children) {
      const subs = subtaskIndex.get(child.id.trim().toLowerCase()) ?? [];
      const isExpanded = expandedTaskIds.has(child.id);
      rows.push({ task: child, depth: 0, hasSubtasks: subs.length > 0, expanded: isExpanded, subtaskCount: subs.length });
      if (isExpanded) {
        for (const sub of subs) {
          rows.push({ task: sub, depth: 1, hasSubtasks: false, expanded: false, subtaskCount: 0 });
        }
      }
    }
    return rows;
  };

  const laneTaskCount = (laneKey: string): number => {
    const statusMap = getMetadataCells(laneKey);
    if (!statusMap) return 0;
    let count = 0;
    for (const list of statusMap.values()) {
      count += list.length;
    }
    return count;
  };

  const getLaneProgress = (laneKey: string): number => {
    const statusMap = getMetadataCells(laneKey);
    if (!statusMap) return 0;
    let total = 0;
    let done = 0;
    for (const [status, taskList] of statusMap) {
      total += taskList.length;
      if (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete')) {
        done += taskList.length;
      }
    }
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
  };

  // When hideEmptyColumns is on, status columns without tasks anywhere disappear; while a card is
  // dragged they all come back so empty statuses remain drop targets.
  const visibleStatuses = useMemo(() => {
    if (!hideEmptyColumns || hiddenColumnsRevealed) return statuses;
    return statuses.filter((status) => {
      for (const statusMap of displayTasksByLane.values()) {
        if ((statusMap.get(status) ?? []).length > 0) return true;
      }
      return false;
    });
  }, [hideEmptyColumns, hiddenColumnsRevealed, statuses, displayTasksByLane]);

  const cancelHiddenColumnsReveal = () => {
    if (revealHiddenColumnsTimer.current !== null) clearTimeout(revealHiddenColumnsTimer.current);
    revealHiddenColumnsTimer.current = null;
  };

  useEffect(() => cancelHiddenColumnsReveal, []);

  const handleCardDragStart = ({ status, laneId }: { status: string; laneId: string }) => {
    setDragSourceStatus(status);
    setDragSourceLane(laneId);
    if (!hideEmptyColumns) return;
    cancelHiddenColumnsReveal();
    revealHiddenColumnsTimer.current = setTimeout(() => {
      revealHiddenColumnsTimer.current = null;
      setHiddenColumnsRevealed(true);
    }, 0);
  };

  const handleCardDragEnd = () => {
    cancelHiddenColumnsReveal();
    setDragSourceStatus(null);
    setDragSourceLane(null);
    setHiddenColumnsRevealed(false);
  };

  const toggleLaneCollapse = (laneKey: string) => {
    setCollapsedLanes((previous) => ({
      ...previous,
      [laneKey]: !previous[laneKey],
    }));
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    try {
      await apiClient.updateTask(taskId, updates);
      if (onRefreshData) {
        await onRefreshData();
      }
      setUpdateError(null);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleRowReorder = async (payload: { laneId: string; taskId: string; targetStatus: string; orderedTaskIds: string[] }) => {
    const normalizedId = payload.taskId.trim().toLowerCase();
    const draggedTask = tasks.find((task) => task.id.trim().toLowerCase() === normalizedId);
    const owningLane = draggedTask ? laneKeyForTask(draggedTask, lanes, tasks) : payload.laneId;
    if (owningLane !== payload.laneId) {
      setUpdateError("Cards can only move within their own epic's lane. Edit the task's parent to move it between epics.");
      return;
    }
    try {
      const result = await apiClient.reorderTask({
        taskId: payload.taskId,
        targetStatus: payload.targetStatus,
        orderedTaskIds: payload.orderedTaskIds,
      });
      if (onTasksUpdated) {
        onTasksUpdated(result.changedTasks ?? [result.task], result.task);
      } else if (onRefreshData) {
        await onRefreshData();
      }
      setUpdateError(null);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to reorder task');
    }
  };

  const getLaneTask = (laneKey: string): Task | undefined => {
    const epicLane = lanes.find((lane) => lane.key === laneKey);
    if (epicLane?.epic) return epicLane.epic;
    return initiativeGroups.find((group) => group.key === laneKey)?.initiative;
  };

  // Lane drag reorder is sibling-scoped: epic lanes compete within the same parent, initiative
  // lanes among initiatives. Sibling ids drive the existing ordinal-based reorder endpoint.
  const getLaneSiblingTasks = (laneKey: string): Task[] => {
    const epicLane = lanes.find((lane) => lane.key === laneKey && lane.epic);
    if (epicLane?.epic) {
      const parentKey = epicLane.epic.parentTaskId?.trim().toLowerCase() ?? "";
      return lanes
        .filter((lane) => lane.epic && (lane.epic.parentTaskId?.trim().toLowerCase() ?? "") === parentKey)
        .map((lane) => lane.epic as Task);
    }
    if (initiativeGroups.some((group) => group.key === laneKey)) {
      return initiativeGroups.map((group) => group.initiative);
    }
    return [];
  };

  const getInitiativeStats = (group: { childLanes: EpicLane[]; directLaneKey?: string }): { count: number; progress: number } => {
    let total = 0;
    let done = 0;
    const laneKeys = [...group.childLanes.map((lane) => lane.key), ...(group.directLaneKey ? [group.directLaneKey] : [])];
    for (const laneKey of laneKeys) {
      const statusMap = getMetadataCells(laneKey);
      if (!statusMap) continue;
      for (const [status, taskList] of statusMap) {
        total += taskList.length;
        if (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete')) {
          done += taskList.length;
        }
      }
    }
    if (total === 0) return { count: 0, progress: 0 };
    return { count: total, progress: Math.round((done / total) * 100) };
  };

  // Lane order rides the container tasks' existing ordinal field through the same reorder endpoint
  // the board uses for cards: the moved lane's task gets a new ordinal and its siblings rebalance.
  // Reordering is sibling-scoped: epic lanes within the same parent, initiative lanes among
  // initiatives. Cross-sibling drops are silently rejected by the sibling lookup.
  const handleLaneReorder = async (draggedKey: string, targetKey: string, position: 'before' | 'after') => {
    if (draggedKey === targetKey) return;
    const draggedTask = getLaneTask(draggedKey);
    const targetTask = getLaneTask(targetKey);
    if (!draggedTask || !targetTask) return;
    const siblings = getLaneSiblingTasks(draggedKey);
    const targetIndex = siblings.findIndex((task) => task.id.trim().toLowerCase() === targetTask.id.trim().toLowerCase());
    if (targetIndex === -1) return;
    const originalIds = siblings.map((task) => task.id);
    const reordered = siblings.filter((task) => task.id !== draggedTask.id);
    let insertIndex = reordered.findIndex((task) => task.id.trim().toLowerCase() === targetTask.id.trim().toLowerCase());
    if (insertIndex === -1) return;
    if (position === 'after') insertIndex += 1;
    reordered.splice(insertIndex, 0, draggedTask);
    const orderedTaskIds = reordered.map((task) => task.id);
    if (
      orderedTaskIds.length === originalIds.length &&
      orderedTaskIds.every((id, index) => id === originalIds[index])
    ) {
      return;
    }
    try {
      const result = await apiClient.reorderTask({
        taskId: draggedTask.id,
        targetStatus: draggedTask.status,
        orderedTaskIds,
      });
      if (onTasksUpdated) {
        onTasksUpdated(result.changedTasks ?? [result.task], result.task);
      } else if (onRefreshData) {
        await onRefreshData();
      }
      setUpdateError(null);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to reorder lanes');
    }
  };

  const handleLaneDragStart = (laneKey: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/swim-lane', laneKey);
    e.dataTransfer.effectAllowed = 'move';
    setLaneDragKey(laneKey);
  };

  const handleLaneDragOver = (laneKey: string) => (e: React.DragEvent) => {
    if (!laneDragKey || laneDragKey === laneKey) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setLaneDropIndicator((previous) =>
      previous?.key === laneKey && previous.position === position ? previous : { key: laneKey, position }
    );
  };

  const handleLaneDrop = (laneKey: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedKey = e.dataTransfer.getData('text/swim-lane') || laneDragKey;
    const indicator = laneDropIndicator;
    setLaneDragKey(null);
    setLaneDropIndicator(null);
    if (!draggedKey || draggedKey === laneKey || !indicator || indicator.key !== laneKey) return;
    void handleLaneReorder(draggedKey, laneKey, indicator.position);
  };

  const handleLaneDragEnd = () => {
    setLaneDragKey(null);
    setLaneDropIndicator(null);
  };

  const epicLaneCount = lanes.filter((lane) => !lane.isNoEpic).length;
  const containerLaneCount = epicLaneCount + initiativeGroups.length;

  const renderLaneColumns = (laneKey: string) => (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${visibleStatuses.length}, minmax(0, 1fr))` }}>
      {visibleStatuses.map((status) => (
        <div key={`${laneKey}-${status}`} className="min-w-0">
          <SwimColumn
            status={status}
            rows={getRowsForLane(laneKey, status)}
            laneId={laneKey}
            onTaskUpdate={handleTaskUpdate}
            onEditTask={onEditTask}
            onRowReorder={handleRowReorder}
            onForeignDrop={() =>
              setUpdateError("Cards can only move within their own lane. Edit the task's parent to move it between epics.")
            }
            dragSourceStatus={dragSourceStatus}
            dragSourceLane={dragSourceLane}
            onDragStart={handleCardDragStart}
            onDragEnd={handleCardDragEnd}
            availableTypes={typeOptions}
            availableProjects={projectOptions}
            dateFormat={dateFormat}
            onToggleExpand={toggleTaskExpanded}
          />
        </div>
      ))}
    </div>
  );

  interface LaneBoxInput {
    key: string;
    epic?: Task;
    label: string;
    draggable: boolean;
    chipClass?: string;
  }

  const renderLaneBox = (lane: LaneBoxInput, opts: { nested?: boolean } = {}) => {
    const isCollapsed = collapsedLanes[lane.key] ?? false;
    const taskCount = laneTaskCount(lane.key);
    const progress = getLaneProgress(lane.key);
    const isDropTarget = laneDropIndicator?.key === lane.key;

    return (
      <div
        key={lane.key}
        className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 overflow-hidden ${opts.nested ? 'bg-white/70 dark:bg-gray-800/40' : ''}`}
      >
        {isDropTarget && laneDropIndicator?.position === 'before' && (
          <div className="h-1 bg-blue-500 animate-pulse" />
        )}
        <div
          className={`flex items-center justify-between gap-4 px-4 py-3 bg-gray-100/80 dark:bg-gray-800/60 group ${!isCollapsed ? 'border-b border-gray-200 dark:border-gray-700' : ''} ${
            lane.draggable ? 'cursor-grab' : ''
          }`}
          draggable={lane.draggable}
          onDragStart={lane.draggable ? handleLaneDragStart(lane.key) : undefined}
          onDragOver={lane.draggable ? handleLaneDragOver(lane.key) : undefined}
          onDrop={lane.draggable ? handleLaneDrop(lane.key) : undefined}
          onDragEnd={handleLaneDragEnd}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => toggleLaneCollapse(lane.key)}
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${lane.label} lane`}
              className="flex items-center gap-3 min-w-0 focus:outline-none"
            >
              <svg
                className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {lane.epic && (
                <span
                  className={`shrink-0 px-1.5 py-0.5 text-xs font-medium rounded transition-colors duration-200 ${
                    lane.chipClass ?? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                  }`}
                >
                  {lane.epic.id}
                </span>
              )}
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200 truncate">
                {lane.label}
              </h3>
              <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors duration-200">
                {taskCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {lane.draggable && (
              <svg
                className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors duration-200"
                aria-hidden="true"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M7 4a2 2 0 110-4 2 2 0 010 4zM7 12a2 2 0 110-4 2 2 0 010 4zM7 20a2 2 0 110-4 2 2 0 010 4zM13 4a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z" transform="translate(0 2) scale(1 0.8)" />
              </svg>
            )}
            <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 text-right">{progress}%</span>
          </div>
        </div>

        {isDropTarget && laneDropIndicator?.position === 'after' && (
          <div className="h-1 bg-blue-500 animate-pulse" />
        )}

        {!isCollapsed && (
          <div className="p-4">{renderLaneColumns(lane.key)}</div>
        )}
      </div>
    );
  };

  const renderInitiativeGroup = (group: (typeof initiativeGroups)[number]) => {
    const isCollapsed = collapsedLanes[group.key] ?? false;
    const { count, progress } = getInitiativeStats(group);
    const isDropTarget = laneDropIndicator?.key === group.key;

    return (
      <div
        key={group.key}
        className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/20 dark:bg-violet-900/10 overflow-hidden"
      >
        {isDropTarget && laneDropIndicator?.position === 'before' && (
          <div className="h-1 bg-blue-500 animate-pulse" />
        )}
        <div
          className={`flex items-center justify-between gap-4 px-4 py-3 bg-violet-100/70 dark:bg-violet-900/20 group ${
            !isCollapsed ? 'border-b border-violet-200 dark:border-violet-900/60' : ''
          } cursor-grab`}
          draggable
          onDragStart={handleLaneDragStart(group.key)}
          onDragOver={handleLaneDragOver(group.key)}
          onDrop={handleLaneDrop(group.key)}
          onDragEnd={handleLaneDragEnd}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => toggleLaneCollapse(group.key)}
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.initiative.title} initiative`}
              className="flex items-center gap-3 min-w-0 focus:outline-none"
            >
              <svg
                className={`w-4 h-4 text-violet-500 dark:text-violet-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="shrink-0 px-1.5 py-0.5 text-xs font-medium rounded bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 transition-colors duration-200">
                {group.initiative.id}
              </span>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200 truncate">
                {group.initiative.title}
              </h3>
              <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-violet-200/70 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 transition-colors duration-200">
                initiative
              </span>
              <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors duration-200">
                {count}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <svg
              className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors duration-200"
              aria-hidden="true"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M7 4a2 2 0 110-4 2 2 0 010 4zM7 12a2 2 0 110-4 2 2 0 010 4zM7 20a2 2 0 110-4 2 2 0 010 4zM13 4a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z" transform="translate(0 2) scale(1 0.8)" />
            </svg>
            <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 text-right">{progress}%</span>
          </div>
        </div>

        {isDropTarget && laneDropIndicator?.position === 'after' && (
          <div className="h-1 bg-blue-500 animate-pulse" />
        )}

        {!isCollapsed && (
          <div className="p-4 space-y-4">
            {group.childLanes.length === 0 && !group.directLaneKey && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No child work yet. Create epics or tasks with this initiative as their parent to nest them here.
              </p>
            )}
            {group.childLanes.map((lane) =>
              renderLaneBox({ key: lane.key, epic: lane.epic, label: lane.epic?.title ?? '', draggable: true }, { nested: true })
            )}
            {group.directLaneKey &&
              renderLaneBox({ key: group.directLaneKey, label: 'Tasks', draggable: false }, { nested: true })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      {updateError && (
        <div className="mb-4 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200 transition-colors duration-200">
          {updateError}
        </div>
      )}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-200">Kanban Swim</h2>
          <button
            className="inline-flex items-center px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 dark:focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition-colors duration-200"
            onClick={onNewTask}
          >
            + New Task
          </button>
        </div>
        {onFiltersChange && (
          <div className="flex flex-wrap items-center gap-3" role="toolbar" aria-label="Swim view filters">
            <select
              aria-label="Filter board by assignee"
              value={filterAssignee}
              onChange={(e) => onFiltersChange({ assignee: e.target.value, labels: normalizedFilterLabels, priority: filterPriority, taskType: filterType, project: filterProject })}
              className={SWIM_FILTER_SELECT_CLASS}
            >
              <option value="">All assignees</option>
              <option value="__unassigned__">Unassigned</option>
              {uniqueAssignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <LabelFilterDropdown
              availableLabels={uniqueLabels}
              selectedLabels={normalizedFilterLabels}
              onChange={(labels) => onFiltersChange({ assignee: filterAssignee, labels, priority: filterPriority, taskType: filterType, project: filterProject })}
              menuId="swim-labels-filter-menu"
              className="min-w-[200px]"
            />

            <select
              aria-label="Filter board by type"
              value={filterType}
              onChange={(e) => onFiltersChange({ assignee: filterAssignee, labels: normalizedFilterLabels, priority: filterPriority, taskType: e.target.value, project: filterProject })}
              className={SWIM_FILTER_SELECT_CLASS}
            >
              <option value="">All types</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            {projectOptions.length > 0 && (
              <select
                aria-label="Filter board by project"
                value={filterProject}
                onChange={(e) => onFiltersChange({ assignee: filterAssignee, labels: normalizedFilterLabels, priority: filterPriority, taskType: filterType, project: e.target.value })}
                className={SWIM_FILTER_SELECT_CLASS}
              >
                <option value="">All projects</option>
                {projectOptions.map((project) => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
            )}

            <select
              aria-label="Filter board by priority"
              value={filterPriority}
              onChange={(e) => onFiltersChange({ assignee: filterAssignee, labels: normalizedFilterLabels, priority: e.target.value, taskType: filterType, project: filterProject })}
              className={SWIM_FILTER_SELECT_CLASS}
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => onFiltersChange({ assignee: '', labels: [], priority: '', taskType: '', project: '' })}
                className={SWIM_FILTER_BUTTON_CLASS}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-800 dark:bg-red-900/20" role="alert">
          <p className="font-medium text-red-700 dark:text-red-300">Failed to load tasks</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{loadError.message}</p>
          {onRefreshData && (
            <button
              type="button"
              onClick={() => void onRefreshData()}
              className="mt-4 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              Retry
            </button>
          )}
        </div>
      ) : isLoading ? (
        <BoardLoadingSkeleton message={loadingMessage} columnCount={statuses.length} />
      ) : (
        <div className="space-y-6">
          {containerLaneCount === 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
              No epics or initiatives yet. Create a task with type <span className="font-mono">epic</span> to get swim
              lanes (its subtasks show up as cards), or type <span className="font-mono">initiative</span> for an
              umbrella container that groups related epics.
            </div>
          )}
          {initiativeGroups.map((group) => renderInitiativeGroup(group))}
          {standaloneLanes.map((lane) => renderLaneBox({ key: lane.key, epic: lane.epic, label: lane.epic?.title ?? '', draggable: true }))}
          {noEpicLane && renderLaneBox({ key: noEpicLane.key, label: 'No epic', draggable: false })}
        </div>
      )}
    </div>
  );
};

export default SwimBoard;
