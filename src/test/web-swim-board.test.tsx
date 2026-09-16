import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Task } from "../types/index.ts";
import SwimBoard from "../web/components/SwimBoard.tsx";
import { apiClient } from "../web/lib/api.ts";
import { epicLaneKey } from "../web/lib/epic-lanes.ts";

const STATUSES = ["To Do", "In Progress", "Done"];

const makeTask = (overrides: Partial<Task>): Task => ({
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-01-01",
	...overrides,
});

const EPIC_ONE = makeTask({ id: "TASK-10", title: "Epic One", type: "epic", status: "In Progress", ordinal: 2000 });
const EPIC_TWO = makeTask({ id: "TASK-20", title: "Epic Two", type: "epic", status: "To Do", ordinal: 1000 });
const CHILD_ONE = makeTask({ id: "TASK-10.1", title: "Child one", parentTaskId: "TASK-10" });
const CHILD_TWO = makeTask({ id: "TASK-10.2", title: "Child two", parentTaskId: "TASK-10", status: "Done" });
const SUBTASK = makeTask({ id: "TASK-10.1.1", title: "Sub of child", parentTaskId: "TASK-10.1" });
const ORPHAN = makeTask({ id: "TASK-30", title: "Orphan" });

const TASKS = [EPIC_ONE, EPIC_TWO, CHILD_ONE, CHILD_TWO, SUBTASK, ORPHAN];

let activeRoot: Root | null = null;

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost/board/swim",
	});
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as unknown as Document;
	globalThis.navigator = dom.window.navigator as unknown as Navigator;
};

const renderSwim = (
	tasks: Task[] = TASKS,
	onEditTask: (task: Task) => void = () => {},
	extra: { filterAssignee?: string } = {},
): HTMLElement => {
	setupDom();
	const container = document.getElementById("root");
	expect(container).toBeTruthy();
	activeRoot = createRoot(container as HTMLElement);
	act(() => {
		activeRoot?.render(
			<SwimBoard
				onEditTask={onEditTask}
				onNewTask={() => {}}
				tasks={tasks}
				statuses={STATUSES}
				isLoading={false}
				availableLabels={[]}
				filterAssignee={extra.filterAssignee}
			/>,
		);
	});
	return container as HTMLElement;
};

const laneHeadings = (container: HTMLElement): string[] =>
	Array.from(container.querySelectorAll("h3"))
		.map((heading) => heading.textContent?.trim() ?? "")
		.filter((text) => text === "Epic One" || text === "Epic Two" || text === "No epic");

const getLaneColumn = (container: HTMLElement, laneTitle: string, status: string): HTMLElement => {
	const lane = Array.from(container.querySelectorAll("h3")).find(
		(heading) => heading.textContent?.trim() === laneTitle,
	);
	expect(lane).toBeTruthy();
	const laneRoot = lane?.closest(".rounded-lg.border") as HTMLElement | null;
	expect(laneRoot).toBeTruthy();
	const column = Array.from((laneRoot as HTMLElement).querySelectorAll("h3"))
		.find((heading) => heading.textContent === status)
		?.closest(".rounded-lg");
	expect(column).toBeTruthy();
	return column as HTMLElement;
};

const getLaneHeader = (container: HTMLElement, laneTitle: string): HTMLElement => {
	const heading = Array.from(container.querySelectorAll("h3")).find(
		(element) => element.textContent?.trim() === laneTitle,
	);
	const header = heading?.closest('[draggable="true"]');
	expect(header).toBeTruthy();
	return header as HTMLElement;
};

const findButton = (container: HTMLElement, label: string): HTMLButtonElement => {
	const button = Array.from(container.querySelectorAll("button")).find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	expect(button).toBeTruthy();
	return button as HTMLButtonElement;
};

const clickButton = async (button: HTMLElement) => {
	await act(async () => {
		button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
		await Promise.resolve();
	});
};

const dispatchDrop = (target: HTMLElement, data: Record<string, string>) => {
	const event = new window.Event("drop", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: { setData: () => {}, getData: (key: string) => data[key] ?? "", effectAllowed: "" },
	});
	target.dispatchEvent(event);
};

const dispatchLaneDragStart = async (header: HTMLElement) => {
	const event = new window.Event("dragstart", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: { setData: () => {}, getData: () => "", effectAllowed: "" },
	});
	await act(async () => {
		header.dispatchEvent(event);
		await Promise.resolve();
	});
};

const dispatchLaneDragOver = async (header: HTMLElement) => {
	const event = new window.Event("dragover", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: { setData: () => {}, getData: () => "", effectAllowed: "" },
	});
	await act(async () => {
		header.dispatchEvent(event);
		await Promise.resolve();
	});
};

afterEach(() => {
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
});

describe("Web Kanban Swim board", () => {
	it("orders epic lanes by ordinal, pins No epic last, and never renders epics as cards", () => {
		const container = renderSwim();

		const headings = laneHeadings(container);
		expect(headings).toEqual(["Epic Two", "Epic One", "No epic"]);

		// Cards carry their task id in a .font-mono node; lane headers show the epic id only in a
		// plain chip. No card may carry an epic id, while children of epics appear exactly once.
		const cardIds = Array.from(container.querySelectorAll('[draggable="true"]'))
			.map((element) => element.querySelector(".font-mono")?.textContent ?? "")
			.filter(Boolean);
		expect(cardIds).not.toContain("TASK-10");
		expect(cardIds).not.toContain("TASK-20");
		expect(cardIds.filter((id) => id === "TASK-10.1")).toHaveLength(1);
	});

	it("shows only direct children and expands subtasks in place", async () => {
		const container = renderSwim();

		expect(container.textContent).toContain("TASK-10.1");
		expect(container.textContent).not.toContain("TASK-10.1.1");

		await clickButton(findButton(container, "1 subtask"));
		expect(container.textContent).toContain("TASK-10.1.1");

		await clickButton(findButton(container, "1 subtask"));
		expect(container.textContent).not.toContain("TASK-10.1.1");
	});

	it("persists lane collapse state in localStorage", async () => {
		const container = renderSwim();

		const collapse = Array.from(container.querySelectorAll("button")).find(
			(candidate) => candidate.getAttribute("aria-label") === "Collapse Epic One lane",
		);
		expect(collapse).toBeTruthy();

		await clickButton(collapse as HTMLButtonElement);

		expect(window.localStorage.getItem("backlog.swim.collapsedLanes")).toBe(
			JSON.stringify({ [epicLaneKey("TASK-10")]: true }),
		);
	});

	it("sends a same-lane status drop through the existing reorder endpoint", async () => {
		const originalReorderTask = apiClient.reorderTask.bind(apiClient);
		const calls: Array<{ taskId: string; targetStatus: string; orderedTaskIds: string[] }> = [];
		apiClient.reorderTask = async (payload) => {
			calls.push(payload);
			return { success: true, task: { ...CHILD_ONE, status: "Done" }, changedTasks: [] };
		};

		try {
			const container = renderSwim();
			await act(async () => {
				dispatchDrop(getLaneColumn(container, "Epic One", "Done"), {
					"text/plain": "TASK-10.1",
					"text/status": "To Do",
					"text/lane": epicLaneKey("TASK-10"),
				});
				await Promise.resolve();
			});

			expect(calls).toEqual([
				{ taskId: "TASK-10.1", targetStatus: "Done", orderedTaskIds: ["TASK-10.2", "TASK-10.1"] },
			]);
		} finally {
			apiClient.reorderTask = originalReorderTask;
		}
	});

	it("rejects a drop into another epic's lane without calling the API", async () => {
		const originalReorderTask = apiClient.reorderTask.bind(apiClient);
		const calls: unknown[] = [];
		apiClient.reorderTask = async (payload) => {
			calls.push(payload);
			return { success: true, task: CHILD_ONE, changedTasks: [] };
		};

		try {
			const container = renderSwim();
			await act(async () => {
				dispatchDrop(getLaneColumn(container, "Epic Two", "To Do"), {
					"text/plain": "TASK-10.1",
					"text/status": "To Do",
					"text/lane": epicLaneKey("TASK-10"),
				});
				await Promise.resolve();
			});

			expect(calls).toEqual([]);
			expect(container.textContent).toContain("Cards can only move within their own lane");
		} finally {
			apiClient.reorderTask = originalReorderTask;
		}
	});

	it("reorders epic lanes through the ordinal field with a single reorder request", async () => {
		const originalReorderTask = apiClient.reorderTask.bind(apiClient);
		const calls: Array<{ taskId: string; targetStatus: string; orderedTaskIds: string[] }> = [];
		apiClient.reorderTask = async (payload) => {
			calls.push(payload);
			return { success: true, task: EPIC_TWO, changedTasks: [] };
		};

		try {
			const container = renderSwim();

			// Drag Epic Two onto Epic One's header: JSDOM rects are zero, so the drop resolves to "after".
			await dispatchLaneDragStart(getLaneHeader(container, "Epic Two"));
			await dispatchLaneDragOver(getLaneHeader(container, "Epic One"));
			await act(async () => {
				dispatchDrop(getLaneHeader(container, "Epic One"), {});
				await Promise.resolve();
			});

			expect(calls).toEqual([{ taskId: "TASK-20", targetStatus: "To Do", orderedTaskIds: ["TASK-10", "TASK-20"] }]);
		} finally {
			apiClient.reorderTask = originalReorderTask;
		}
	});

	it("renders an empty-state hint when the project has no epics", () => {
		const container = renderSwim([ORPHAN]);

		expect(container.textContent).toContain("No epics or initiatives yet");
		expect(laneHeadings(container)).toEqual(["No epic"]);
	});

	const INITIATIVE = makeTask({ id: "TASK-5", title: "Big Migration", type: "initiative", status: "To Do", ordinal: 500 });
	const NESTED_EPIC_ONE = makeTask({ id: "TASK-6", title: "Nested Epic One", type: "epic", parentTaskId: "TASK-5", ordinal: 100 });
	const NESTED_EPIC_TWO = makeTask({ id: "TASK-7", title: "Nested Epic Two", type: "epic", parentTaskId: "TASK-5", ordinal: 200 });
	const STANDALONE_EPIC = makeTask({ id: "TASK-8", title: "Standalone Epic", type: "epic", ordinal: 300 });
	const DIRECT_TASK = makeTask({ id: "TASK-9", title: "Direct child", parentTaskId: "TASK-5" });

	const initiativeFixtures = () => [INITIATIVE, NESTED_EPIC_ONE, NESTED_EPIC_TWO, STANDALONE_EPIC, DIRECT_TASK, ORPHAN];

	it("nests child epic lanes and a direct Tasks lane under the initiative lane", () => {
		const container = renderSwim(initiativeFixtures());

		const text = container.textContent ?? "";
		const initiativeIndex = text.indexOf("Big Migration");
		const nestedOneIndex = text.indexOf("Nested Epic One");
		const nestedTwoIndex = text.indexOf("Nested Epic Two");
		const directTaskIndex = text.indexOf("TASK-9");
		const noEpicIndex = text.indexOf("No epic");

		expect(initiativeIndex).toBeGreaterThanOrEqual(0);
		expect(nestedOneIndex).toBeGreaterThan(initiativeIndex);
		expect(nestedTwoIndex).toBeGreaterThan(nestedOneIndex);
		expect(directTaskIndex).toBeGreaterThan(initiativeIndex);
		expect(noEpicIndex).toBeGreaterThan(directTaskIndex);

		// The initiative's direct child renders once, in the nested Tasks lane - never in No epic.
		expect(text.split("TASK-9")).toHaveLength(2);
		// The initiative chip and marker are present.
		expect(text).toContain("initiative");
	});

	it("reorders sibling epic lanes within an initiative but rejects cross-sibling drops", async () => {
		const originalReorderTask = apiClient.reorderTask.bind(apiClient);
		const calls: Array<{ taskId: string; targetStatus: string; orderedTaskIds: string[] }> = [];
		apiClient.reorderTask = async (payload) => {
			calls.push(payload);
			return { success: true, task: NESTED_EPIC_ONE, changedTasks: [] };
		};

		try {
			const container = renderSwim(initiativeFixtures());

			await dispatchLaneDragStart(getLaneHeader(container, "Nested Epic One"));
			await dispatchLaneDragOver(getLaneHeader(container, "Nested Epic Two"));
			await act(async () => {
				dispatchDrop(getLaneHeader(container, "Nested Epic Two"), {});
				await Promise.resolve();
			});

			expect(calls).toEqual([{ taskId: "TASK-6", targetStatus: "To Do", orderedTaskIds: ["TASK-7", "TASK-6"] }]);

			calls.length = 0;
			await dispatchLaneDragStart(getLaneHeader(container, "Nested Epic One"));
			await dispatchLaneDragOver(getLaneHeader(container, "Standalone Epic"));
			await act(async () => {
				dispatchDrop(getLaneHeader(container, "Standalone Epic"), {});
				await Promise.resolve();
			});

			expect(calls).toEqual([]);
		} finally {
			apiClient.reorderTask = originalReorderTask;
		}
	});

	it("reorders initiatives among themselves through the same endpoint", async () => {
		const originalReorderTask = apiClient.reorderTask.bind(apiClient);
		const calls: Array<{ taskId: string; targetStatus: string; orderedTaskIds: string[] }> = [];
		apiClient.reorderTask = async (payload) => {
			calls.push(payload);
			return { success: true, task: INITIATIVE, changedTasks: [] };
		};

		try {
			const secondInitiative = makeTask({
				id: "TASK-11",
				title: "Second Initiative",
				type: "initiative",
				status: "To Do",
				ordinal: 900,
			});
			const container = renderSwim([...initiativeFixtures(), secondInitiative]);

			await dispatchLaneDragStart(getLaneHeader(container, "Big Migration"));
			await dispatchLaneDragOver(getLaneHeader(container, "Second Initiative"));
			await act(async () => {
				dispatchDrop(getLaneHeader(container, "Second Initiative"), {});
				await Promise.resolve();
			});

			expect(calls).toEqual([
				{ taskId: "TASK-5", targetStatus: "To Do", orderedTaskIds: ["TASK-11", "TASK-5"] },
			]);
		} finally {
			apiClient.reorderTask = originalReorderTask;
		}
	});

	it("applies the assignee filter to lane cards like the regular board", () => {
		const tasks = [EPIC_ONE, { ...CHILD_ONE, assignee: ["@amy"] }, { ...CHILD_TWO, assignee: ["@bob"] }];
		const container = renderSwim(tasks, () => {}, { filterAssignee: "@amy" });

		expect(container.textContent).toContain("TASK-10.1");
		expect(container.textContent).not.toContain("TASK-10.2");
	});
});
