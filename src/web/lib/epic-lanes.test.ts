import { describe, expect, it } from "bun:test";
import type { Task } from "../../types";
import {
	buildEpicLanes,
	buildInitiativeGroups,
	buildSubtaskIndex,
	compareEpicTasks,
	epicLaneKey,
	getEpicChildren,
	getNoEpicTasks,
	getSubtasks,
	groupInitiativeDirectTasks,
	groupTasksByEpicLaneAndStatus,
	initiativeDirectLaneKey,
	initiativeLaneKey,
	isEpicTask,
	laneKeyForTask,
	NO_EPIC_LANE_KEY,
} from "./epic-lanes";
import { isInitiativeTask } from "./status-policy";

const makeTask = (overrides: Partial<Task>): Task => ({
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2024-01-01",
	...overrides,
});

describe("isEpicTask", () => {
	it("matches the epic type case-insensitively and ignores untyped tasks", () => {
		expect(isEpicTask(makeTask({ type: "epic" }))).toBe(true);
		expect(isEpicTask(makeTask({ type: "Epic" }))).toBe(true);
		expect(isEpicTask(makeTask({ type: "feature" }))).toBe(false);
		expect(isEpicTask(makeTask({}))).toBe(false);
	});
});

describe("buildEpicLanes", () => {
	it("creates one lane per epic ordered by ordinal, then by task id", () => {
		const tasks = [
			makeTask({ id: "task-3", type: "epic" }),
			makeTask({ id: "task-1", type: "epic", ordinal: 20 }),
			makeTask({ id: "task-2", type: "epic", ordinal: 10 }),
		];
		const lanes = buildEpicLanes(tasks);
		expect(lanes.map((lane) => lane.epic?.id)).toEqual(["task-2", "task-1", "task-3"]);
		expect(lanes.map((lane) => lane.key)).toEqual([
			epicLaneKey("task-2"),
			epicLaneKey("task-1"),
			epicLaneKey("task-3"),
		]);
	});

	it("breaks ordinal ties by numeric task id, not string order", () => {
		expect(compareEpicTasks(makeTask({ id: "task-10" }), makeTask({ id: "task-9" }))).toBeGreaterThan(0);
	});

	it("appends the No epic lane only when a task needs it, pinned last", () => {
		const withOrphan = [
			makeTask({ id: "task-1", type: "epic" }),
			makeTask({ id: "task-1.1", parentTaskId: "task-1" }),
			makeTask({ id: "task-2" }),
		];
		expect(buildEpicLanes(withOrphan).map((lane) => lane.key)).toEqual([epicLaneKey("task-1"), NO_EPIC_LANE_KEY]);

		const allAssigned = [
			makeTask({ id: "task-1", type: "epic" }),
			makeTask({ id: "task-1.1", parentTaskId: "task-1" }),
		];
		expect(buildEpicLanes(allAssigned).map((lane) => lane.key)).toEqual([epicLaneKey("task-1")]);
	});

	it("keeps empty epic lanes visible", () => {
		const lanes = buildEpicLanes([makeTask({ id: "task-1", type: "epic" })]);
		expect(lanes).toHaveLength(1);
		expect(lanes[0]?.isNoEpic).toBe(false);
	});
});

describe("lane membership", () => {
	const tasks = [
		makeTask({ id: "task-1", type: "epic" }),
		makeTask({ id: "task-2", type: "epic" }),
		makeTask({ id: "task-1.1", parentTaskId: "task-1" }),
		makeTask({ id: "task-1.2", parentTaskId: "task-1", type: "epic" }),
		makeTask({ id: "task-2.1", parentTaskId: "task-2" }),
		makeTask({ id: "task-3", parentTaskId: "task-1.1" }),
		makeTask({ id: "task-4" }),
		makeTask({ id: "task-5", parentTaskId: "task-99" }),
	];

	it("returns only non-epic direct children for an epic", () => {
		expect(getEpicChildren(tasks, "task-1").map((task) => task.id)).toEqual(["task-1.1"]);
		expect(getEpicChildren(tasks, "task-2").map((task) => task.id)).toEqual(["task-2.1"]);
	});

	it("routes parentless, missing-parent, and non-epic-parent tasks to No epic, but not epic descendants", () => {
		expect(getNoEpicTasks(tasks).map((task) => task.id)).toEqual(["task-4", "task-5"]);
	});

	it("excludes epic grandchildren from the No epic lane so expansion rows stay unique", () => {
		const tree = [
			makeTask({ id: "task-1", type: "epic" }),
			makeTask({ id: "task-1.1", parentTaskId: "task-1" }),
			makeTask({ id: "task-1.1.1", parentTaskId: "task-1.1" }),
		];
		const lanes = buildEpicLanes(tree);
		expect(lanes.map((lane) => lane.key)).toEqual([epicLaneKey("task-1")]);
		const grouped = groupTasksByEpicLaneAndStatus(lanes, ["To Do"], tree);
		const cells = Array.from(grouped.values()).flatMap((statusMap) => Array.from(statusMap.values()).flat());
		expect(cells.map((task) => task.id)).toEqual(["task-1.1"]);
	});

	it("returns subtasks one level deep", () => {
		expect(getSubtasks(tasks, "task-1.1").map((task) => task.id)).toEqual(["task-3"]);
		expect(getSubtasks(tasks, "task-4")).toEqual([]);
	});

	it("indexes subtasks by lowercased parent id", () => {
		const index = buildSubtaskIndex(tasks);
		expect(index.get("task-1.1")?.map((task) => task.id)).toEqual(["task-3"]);
		expect(index.get("task-1")).toHaveLength(2);
	});
});

describe("groupTasksByEpicLaneAndStatus", () => {
	const tasks = [
		makeTask({ id: "task-1", type: "epic" }),
		makeTask({ id: "task-2", type: "epic" }),
		makeTask({ id: "task-1.2", parentTaskId: "task-1", status: "Done" }),
		makeTask({ id: "task-1.1", parentTaskId: "task-1" }),
		makeTask({ id: "task-3", status: "In Progress" }),
	];

	it("groups direct children under their epic and sorts cells by board ordering", () => {
		const lanes = buildEpicLanes(tasks);
		const grouped = groupTasksByEpicLaneAndStatus(lanes, ["To Do", "In Progress", "Done"], tasks);
		const lane = grouped.get(epicLaneKey("task-1"));
		expect(lane?.get("To Do")?.map((task) => task.id)).toEqual(["task-1.1"]);
		expect(lane?.get("Done")?.map((task) => task.id)).toEqual(["task-1.2"]);
		expect(lane?.get("In Progress")).toEqual([]);
	});

	it("fills the No epic lane with tasks outside epics", () => {
		const lanes = buildEpicLanes(tasks);
		const grouped = groupTasksByEpicLaneAndStatus(lanes, ["To Do", "In Progress", "Done"], tasks);
		expect(
			grouped
				.get(NO_EPIC_LANE_KEY)
				?.get("In Progress")
				?.map((task) => task.id),
		).toEqual(["task-3"]);
	});

	it("never places epic tasks as cards", () => {
		const lanes = buildEpicLanes(tasks);
		const grouped = groupTasksByEpicLaneAndStatus(lanes, ["To Do", "In Progress", "Done"], tasks);
		for (const [, statusMap] of grouped) {
			for (const [, list] of statusMap) {
				for (const task of list) {
					expect(isEpicTask(task)).toBe(false);
				}
			}
		}
	});
});

describe("laneKeyForTask", () => {
	it("resolves the owning lane, tolerates id case differences, and skips epic descendants", () => {
		const tasks = [
			makeTask({ id: "TASK-1", type: "epic" }),
			makeTask({ id: "TASK-1.1", parentTaskId: "task-1" }),
			makeTask({ id: "TASK-1.1.1", parentTaskId: "task-1.1" }),
			makeTask({ id: "TASK-2" }),
		];
		const lanes = buildEpicLanes(tasks);
		expect(laneKeyForTask(makeTask({ id: "task-1.1", parentTaskId: "TASK-1" }), lanes, tasks)).toBe(
			epicLaneKey("TASK-1"),
		);
		expect(laneKeyForTask(makeTask({ id: "TASK-1.1.1", parentTaskId: "task-1.1" }), lanes, tasks)).toBeUndefined();
		expect(laneKeyForTask(makeTask({ id: "TASK-2" }), lanes, tasks)).toBe(NO_EPIC_LANE_KEY);
	});
});

describe("initiative containers", () => {
	const initiatives = [
		makeTask({ id: "task-5", type: "initiative", title: "Migration", ordinal: 500 }),
		makeTask({ id: "task-11", type: "initiative", title: "Later", ordinal: 900 }),
		makeTask({ id: "task-6", type: "epic", title: "Nested One", parentTaskId: "task-5", ordinal: 100 }),
		makeTask({ id: "task-7", type: "epic", title: "Nested Two", parentTaskId: "task-5", ordinal: 200 }),
		makeTask({ id: "task-8", title: "Direct child", parentTaskId: "task-5" }),
		makeTask({ id: "task-9", title: "Orphan" }),
		makeTask({ id: "task-10", type: "epic", title: "Standalone", ordinal: 300 }),
	];

	it("detects initiatives case-insensitively", () => {
		expect(isInitiativeTask(makeTask({ type: "Initiative" }))).toBe(true);
		expect(isInitiativeTask(makeTask({ type: "epic" }))).toBe(false);
		expect(isInitiativeTask(makeTask({}))).toBe(false);
	});

	it("excludes initiative children from the No epic lane", () => {
		expect(getNoEpicTasks(initiatives).map((task) => task.id)).toEqual(["task-9"]);
	});

	it("keeps initiative children out of epic lane cells", () => {
		const lanes = buildEpicLanes(initiatives);
		const grouped = groupTasksByEpicLaneAndStatus(lanes, ["To Do"], initiatives);
		const cells = Array.from(grouped.values()).flatMap((statusMap) => Array.from(statusMap.values()).flat());
		// Only the orphan lands in a lane cell (No epic); the initiative's direct child does not.
		expect(cells.map((task) => task.id)).toEqual(["task-9"]);
	});

	it("groups nested epic lanes and direct cells under each initiative", () => {
		const lanes = buildEpicLanes(initiatives);
		const groups = buildInitiativeGroups(initiatives, lanes);

		expect(groups.map((group) => group.initiative.id)).toEqual(["task-5", "task-11"]);
		expect(groups[0]?.childLanes.map((lane) => lane.epic?.id)).toEqual(["task-6", "task-7"]);
		expect(groups[0]?.directLaneKey).toBe(initiativeDirectLaneKey("task-5"));
		expect(groups[1]?.childLanes).toEqual([]);
		expect(groups[1]?.directLaneKey).toBeUndefined();

		const direct = groupInitiativeDirectTasks(initiatives, ["To Do", "Done"]);
		expect(
			direct
				.get(initiativeDirectLaneKey("task-5"))
				?.get("To Do")
				?.map((task) => task.id),
		).toEqual(["task-8"]);
		expect(direct.get(initiativeDirectLaneKey("task-5"))?.get("Done")).toEqual([]);
		expect(direct.has(initiativeDirectLaneKey("task-11"))).toBe(false);
		expect(direct.get(initiativeLaneKey("task-5"))).toBeUndefined();
	});

	it("never renders containers as cards anywhere", () => {
		const lanes = buildEpicLanes(initiatives);
		const grouped = groupTasksByEpicLaneAndStatus(lanes, ["To Do", "Done"], initiatives);
		const direct = groupInitiativeDirectTasks(initiatives, ["To Do", "Done"]);
		for (const statusMap of [...grouped.values(), ...direct.values()]) {
			for (const list of statusMap.values()) {
				for (const task of list) {
					expect(isEpicTask(task)).toBe(false);
					expect(isInitiativeTask(task)).toBe(false);
				}
			}
		}
	});

	it("treats initiative children as descendants, not No epic members, in laneKeyForTask", () => {
		const lanes = buildEpicLanes(initiatives);
		expect(laneKeyForTask(makeTask({ id: "task-8", parentTaskId: "task-5" }), lanes, initiatives)).toBeUndefined();
		expect(laneKeyForTask(makeTask({ id: "task-9" }), lanes, initiatives)).toBe(NO_EPIC_LANE_KEY);
		expect(laneKeyForTask(makeTask({ id: "task-5", type: "initiative" }), lanes, initiatives)).toBeUndefined();
	});
});
