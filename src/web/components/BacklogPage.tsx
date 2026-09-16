import React, { useEffect, useState } from 'react';
import { type Milestone, type Task } from '../../types';
import TaskList from './TaskList';
import { isDraftStatus, isPlanningStatus, planningStatusOptions } from '../lib/status-policy';

/**
 * Fork-only Backlog page (/backlog): the not-started work queue. Shows Draft tickets plus every
 * configured planning status (Backlog, To Do) by reusing the All Tasks table with a pre-filtered
 * task set, so table features, filters, and click-to-edit come unchanged.
 *
 * Drafts are a separate corpus on the server (never part of the main task list), so they are
 * fetched here exactly the way DraftsList does it and refreshed on the shared drafts-updated event.
 */

interface BacklogPageProps {
  onEditTask: (task: Task) => void;
  onEditDraft: (draft: Task) => void;
  onNewTask: () => void;
  tasks: Task[];
  statuses: string[];
  availableLabels: string[];
  availableMilestones: string[];
  availablePriorities?: string[];
  milestoneEntities: Milestone[];
  archivedMilestones: Milestone[];
  onRefreshData?: () => Promise<void>;
  dateFormat?: string;
  isLoading?: boolean;
}

const BacklogPage: React.FC<BacklogPageProps> = ({
  onEditTask,
  onEditDraft,
  onNewTask,
  tasks,
  statuses,
  availableLabels,
  availableMilestones,
  availablePriorities,
  milestoneEntities,
  archivedMilestones,
  onRefreshData,
  dateFormat,
  isLoading = false,
}) => {
  const [drafts, setDrafts] = useState<Task[]>([]);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDrafts = async () => {
      try {
        const response = await fetch('/api/drafts');
        if (!response.ok) {
          throw new Error(`Failed to load drafts: ${response.statusText}`);
        }
        const draftsData = await response.json();
        if (!cancelled) {
          setDrafts(draftsData);
          setDraftsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDraftsError(err instanceof Error ? err.message : 'Failed to load drafts');
        }
      }
    };

    void loadDrafts();

    const handleDraftsUpdated = () => void loadDrafts();
    window.addEventListener('drafts-updated', handleDraftsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('drafts-updated', handleDraftsUpdated);
    };
  }, []);

  const planningTasks = tasks.filter((task) => isPlanningStatus(task.status));
  const planningTicketList = [...drafts, ...planningTasks];

  const handleEdit = (task: Task) => (isDraftStatus(task.status) ? onEditDraft(task) : onEditTask(task));

  return (
    <div>
      {draftsError && (
        <div className="mb-4 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200 transition-colors duration-200">
          {draftsError}
        </div>
      )}
      <TaskList
        onEditTask={handleEdit}
        onNewTask={onNewTask}
        tasks={planningTicketList}
        availableStatuses={planningStatusOptions(statuses)}
        availableLabels={availableLabels}
        availableMilestones={availableMilestones}
        availablePriorities={availablePriorities}
        milestoneEntities={milestoneEntities}
        archivedMilestones={archivedMilestones}
        onRefreshData={onRefreshData}
        dateFormat={dateFormat}
        isLoading={isLoading}
        title="Backlog"
      />
    </div>
  );
};

export default BacklogPage;
