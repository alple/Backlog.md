import type { Task } from "../../types";
import { compareTaskIds } from "../../utils/task-sorting";
import { sortTasksForStatus } from "./lanes";
import { isInitiativeTask } from "./status-policy";

/**
 * Epic swim lanes for the Kanban Swim view (/board/swim).
 *
 * An epic is a task with type "epic"; its direct children link to it via parentTaskId. Every epic
 * owns one lane and is ordered by the task's existing ordinal field, so lane order rides the same
 * field (and the same reorder endpoint) the regular board already uses. The "No epic" lane is the
 * pinned catch-all for tasks whose parent is absent, missing, or not an epic.
 *
 * Initiatives (type "initiative") are the umbrella containers above epics: like epics they are
 * containers, never cards, and their direct children group into the initiative's nested lanes
 * (child epic lanes plus a "Tasks" lane for direct non-epic children) instead of "No epic".
 *
 * This module is fork-only and must stay pure: no API calls, no React.
 */

export const NO_EPIC_LANE_KEY = "lane:epic:__none";
export const EPIC_TYPE = "epic";

export const epicLaneKey = (epicId: string): string => `lane:epic:${epicId.trim().toLowerCase()}`;

export const initiativeLaneKey = (initiativeId: string): string => `lane:init:${initiativeId.trim().toLowerCase()}`;

export const initiativeDirectLaneKey = (initiativeId: string): string =>
	`lane:init:${initiativeId.trim().toLowerCase()}:direct`;

export const isEpicTask = (task: Task): boolean => (task.type ?? "").trim().toLowerCase() === EPIC_TYPE;

/** Containers own lanes and are never cards: epics and initiatives. */
export const isContainerTask = (task: Task): boolean => isEpicTask(task) || isInitiativeTask(task);

const sameTaskId = (a: string | undefined, b: string): boolean => {
	const left = (a ?? "").trim().toLowerCase();
	const right = b.trim().toLowerCase();
	return left.length > 0 && left === right;
};

export interface EpicLane {
	/** Stable key for DOM, collapse state, and grouping maps. */
	key: string;
	/** The epic task backing the lane; undefined for the "No epic" catch-all. */
	epic?: Task;
	isNoEpic: boolean;
}

/** Ordinal first (the shared board ordering), then the numeric task id. */
export function compareEpicTasks(a: Task, b: Task): number {
	if (a.ordinal !== undefined && b.ordinal !== undefined && a.ordinal !== b.ordinal) {
		return a.ordinal - b.ordinal;
	}
	if (a.ordinal !== undefined && b.ordinal === undefined) return -1;
	if (a.ordinal === undefined && b.ordinal !== undefined) return 1;
	return compareTaskIds(a.id, b.id);
}

/**
 * Ids of every non-container task that descends from a container (direct children and deeper).
 * These tasks render as cards or in-place expansion rows only; none of them are lane members, so
 * a container's grandchildren never leak into the "No epic" lane. Traversal stops at container
 * descendants — an epic below an epic (or under an initiative) is a lane root of its own.
 */
export function buildEpicDescendantIds(tasks: Task[]): Set<string> {
	const byParent = new Map<string, Task[]>();
	for (const task of tasks) {
		if (isContainerTask(task)) continue;
		const parent = task.parentTaskId?.trim().toLowerCase() ?? "";
		if (!parent) continue;
		const bucket = byParent.get(parent);
		if (bucket) bucket.push(task);
		else byParent.set(parent, [task]);
	}

	const descendants = new Set<string>();
	let frontier = tasks.filter(isContainerTask).map((container) => container.id.trim().toLowerCase());
	while (frontier.length > 0) {
		const next: string[] = [];
		for (const parentId of frontier) {
			const children = byParent.get(parentId) ?? [];
			for (const child of children) {
				const childKey = child.id.trim().toLowerCase();
				if (descendants.has(childKey)) continue;
				descendants.add(childKey);
				if (!isContainerTask(child)) next.push(childKey);
			}
		}
		frontier = next;
	}
	return descendants;
}

/**
 * One lane per epic task (always visible, even when empty, so ordering stays possible) plus the
 * pinned "No epic" lane whenever any task would land in it. Epic tasks never become cards.
 */
export function buildEpicLanes(tasks: Task[]): EpicLane[] {
	const epics = tasks.filter(isEpicTask).sort(compareEpicTasks);
	const lanes: EpicLane[] = epics.map((epic) => ({ key: epicLaneKey(epic.id), epic, isNoEpic: false }));
	const hasNoEpicTasks = getNoEpicTasks(tasks).length > 0;
	if (hasNoEpicTasks) {
		lanes.push({ key: NO_EPIC_LANE_KEY, isNoEpic: true });
	}
	return lanes;
}

/** Direct children of an epic; container-typed children are excluded (they are lanes themselves). */
export function getEpicChildren(tasks: Task[], epicId: string): Task[] {
	return tasks.filter((task) => !isContainerTask(task) && sameTaskId(task.parentTaskId, epicId));
}

/** Tasks with no lane of their own: no parent, a missing parent, or a parent outside any container tree. */
export function getNoEpicTasks(tasks: Task[]): Task[] {
	const descendants = buildEpicDescendantIds(tasks);
	return tasks.filter((task) => {
		if (isContainerTask(task)) return false;
		return !descendants.has(task.id.trim().toLowerCase());
	});
}

/** The subtasks a card reveals when expanded, in stable id order. */
export function getSubtasks(tasks: Task[], taskId: string): Task[] {
	const subtasks = tasks.filter((task) => sameTaskId(task.parentTaskId, taskId));
	return subtasks.sort((a, b) => compareTaskIds(a.id, b.id));
}

/** Parent id (lowercased) -> its subtasks, so expansion lookups stay O(1) per render. */
export function buildSubtaskIndex(tasks: Task[]): Map<string, Task[]> {
	const index = new Map<string, Task[]>();
	for (const task of tasks) {
		const parent = task.parentTaskId?.trim().toLowerCase() ?? "";
		if (!parent) continue;
		const bucket = index.get(parent);
		if (bucket) bucket.push(task);
		else index.set(parent, [task]);
	}
	return index;
}

/** Lowercased lane key the task belongs to, or undefined when the task is not a lane member. */
export function laneKeyForTask(task: Task, lanes: EpicLane[], tasks: Task[]): string | undefined {
	if (isContainerTask(task)) return undefined;
	const parent = task.parentTaskId?.trim().toLowerCase() ?? "";
	if (!parent) return lanes.some((lane) => lane.isNoEpic) ? NO_EPIC_LANE_KEY : undefined;
	for (const lane of lanes) {
		if (lane.epic && lane.epic.id.trim().toLowerCase() === parent) return lane.key;
	}
	// Direct children of an initiative belong to that initiative's nested lanes, which the
	// initiative grouping handles separately; deeper descendants are expansion rows only.
	if (buildEpicDescendantIds(tasks).has(task.id.trim().toLowerCase())) {
		return undefined;
	}
	return lanes.some((lane) => lane.isNoEpic) ? NO_EPIC_LANE_KEY : undefined;
}

/**
 * Group tasks into (lane, status) cells: a task sits in its epic's lane only as a direct child;
 * deeper descendants are reachable through expansion, not as lane members. Every cell exists for
 * every configured status, and each list is sorted with the regular board's ordering.
 */
export function groupTasksByEpicLaneAndStatus(
	lanes: EpicLane[],
	statuses: string[],
	tasks: Task[],
): Map<string, Map<string, Task[]>> {
	const result = new Map<string, Map<string, Task[]>>();
	for (const lane of lanes) {
		const statusMap = new Map<string, Task[]>();
		for (const status of statuses) {
			statusMap.set(status, []);
		}
		result.set(lane.key, statusMap);
	}

	const laneKeyByEpicId = new Map<string, string>();
	for (const lane of lanes) {
		if (lane.epic) laneKeyByEpicId.set(lane.epic.id.trim().toLowerCase(), lane.key);
	}
	const descendantIds = buildEpicDescendantIds(tasks);

	for (const task of tasks) {
		if (isContainerTask(task)) continue;
		const parent = task.parentTaskId?.trim().toLowerCase() ?? "";
		const laneKey = parent && laneKeyByEpicId.has(parent) ? laneKeyByEpicId.get(parent) : undefined;
		if (!laneKey) {
			// Not an epic child: a "No epic" member, an initiative child (handled by the
			// initiative's own nested lanes), or a deeper descendant (expansion row only).
			if (!descendantIds.has(task.id.trim().toLowerCase()) && result.has(NO_EPIC_LANE_KEY)) {
				const status = task.status ?? "";
				const bucket = result.get(NO_EPIC_LANE_KEY)?.get(status);
				if (bucket) bucket.push(task);
			}
			continue;
		}
		const statusMap = result.get(laneKey);
		if (!statusMap) continue;
		const status = task.status ?? "";
		const bucket = statusMap.get(status);
		if (bucket) bucket.push(task);
	}

	for (const [, statusMap] of result) {
		for (const [status, list] of statusMap) {
			statusMap.set(status, sortTasksForStatus(list, status));
		}
	}
	return result;
}

export interface InitiativeGroup {
	/** Stable key of the initiative's own lane header. */
	key: string;
	initiative: Task;
	/** Epic lanes nested under this initiative, ordered by ordinal then id. */
	childLanes: EpicLane[];
	/** Present when the initiative has direct non-epic children; a nested "Tasks" lane. */
	directLaneKey?: string;
}

/**
 * Group the swim view's lanes under their initiatives. One group per initiative task, ordered by
 * the shared ordinal field (then id), always present even when the initiative is empty so the
 * container stays visible and reorderable. Epic lanes whose epic is a child of an initiative nest
 * beneath it; everything else stays top-level.
 */
export function buildInitiativeGroups(tasks: Task[], lanes: EpicLane[]): InitiativeGroup[] {
	const groups: InitiativeGroup[] = [];
	const initiatives = tasks.filter(isInitiativeTask).sort(compareEpicTasks);
	for (const initiative of initiatives) {
		const childLanes = lanes
			.filter(
				(lane): lane is EpicLane & { epic: Task } =>
					Boolean(lane.epic) && sameTaskId(lane.epic?.parentTaskId, initiative.id),
			)
			.sort((a, b) => compareEpicTasks(a.epic, b.epic));
		const hasDirectChildren = tasks.some(
			(task) => !isContainerTask(task) && sameTaskId(task.parentTaskId, initiative.id),
		);
		groups.push({
			key: initiativeLaneKey(initiative.id),
			initiative,
			childLanes,
			directLaneKey: hasDirectChildren ? initiativeDirectLaneKey(initiative.id) : undefined,
		});
	}
	return groups;
}

/**
 * (status) cells for an initiative's nested "Tasks" lane: its direct non-epic children, sorted
 * with the regular board's ordering. Keys match the initiative's directLaneKey.
 */
export function groupInitiativeDirectTasks(tasks: Task[], statuses: string[]): Map<string, Map<string, Task[]>> {
	const result = new Map<string, Map<string, Task[]>>();
	for (const task of tasks) {
		if (isContainerTask(task)) continue;
		const parent = task.parentTaskId?.trim().toLowerCase() ?? "";
		if (
			!parent ||
			!tasks.some((candidate) => isInitiativeTask(candidate) && candidate.id.trim().toLowerCase() === parent)
		) {
			continue;
		}
		const laneKey = initiativeDirectLaneKey(parent);
		let statusMap = result.get(laneKey);
		if (!statusMap) {
			statusMap = new Map<string, Task[]>();
			for (const status of statuses) statusMap.set(status, []);
			result.set(laneKey, statusMap);
		}
		const status = task.status ?? "";
		const bucket = statusMap.get(status);
		if (bucket) bucket.push(task);
	}
	for (const [, statusMap] of result) {
		for (const [status, list] of statusMap) {
			statusMap.set(status, sortTasksForStatus(list, status));
		}
	}
	return result;
}
