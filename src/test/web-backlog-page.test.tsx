import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { Task } from "../types/index.ts";
import BacklogPage from "../web/components/BacklogPage.tsx";

const STATUSES = ["Backlog", "To Do", "In Progress", "Done"];

let activeRoot: Root | null = null;
const restore: Array<() => void> = [];

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

const DRAFT = makeTask({ id: "task-9", title: "Draft idea", status: "Draft" });
const BACKLOG_TASK = makeTask({ id: "task-2", title: "Queued", status: "Backlog" });
const TODO_TASK = makeTask({ id: "task-3", title: "Ready", status: "To Do" });
const WIP_TASK = makeTask({ id: "task-4", title: "Started", status: "In Progress" });
const DONE_TASK = makeTask({ id: "task-5", title: "Finished", status: "Done" });

function assignGlobals(values: Record<string, unknown>) {
	const globals = globalThis as unknown as Record<string, unknown>;
	const previous = Object.fromEntries(Object.keys(values).map((key) => [key, globals[key]]));
	Object.assign(globals, values);
	restore.push(() => Object.assign(globals, previous));
}

const setupDom = (drafts: Task[]): HTMLElement => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost/backlog",
	});
	const jsdomWindow = dom.window;
	assignGlobals({
		IS_REACT_ACT_ENVIRONMENT: true,
		window: jsdomWindow,
		document: jsdomWindow.document,
		navigator: jsdomWindow.navigator,
		localStorage: jsdomWindow.localStorage,
		Element: jsdomWindow.Element,
		HTMLElement: jsdomWindow.HTMLElement,
		MouseEvent: jsdomWindow.MouseEvent,
		Node: jsdomWindow.Node,
		getComputedStyle: jsdomWindow.getComputedStyle.bind(jsdomWindow),
		requestAnimationFrame: (callback: FrameRequestCallback) => jsdomWindow.setTimeout(callback, 0),
		cancelAnimationFrame: (handle: number) => jsdomWindow.clearTimeout(handle),
		fetch: (async (input: string | URL | Request) =>
			({
				ok: String(input).includes("/api/drafts"),
				statusText: String(input),
				json: async () => drafts,
			}) as unknown as Response) as typeof fetch,
	});
	window.matchMedia = () =>
		({
			matches: false,
			media: "",
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;

	const container = document.getElementById("root") as HTMLElement;
	activeRoot = createRoot(container);
	return container;
};

const renderBacklog = (
	options: {
		tasks?: Task[];
		drafts?: Task[];
		onEditTask?: (task: Task) => void;
		onEditDraft?: (draft: Task) => void;
	} = {},
): HTMLElement => {
	const container = setupDom(options.drafts ?? [DRAFT]);
	act(() => {
		activeRoot?.render(
			<MemoryRouter initialEntries={["/backlog"]}>
				<BacklogPage
					onEditTask={options.onEditTask ?? (() => {})}
					onEditDraft={options.onEditDraft ?? (() => {})}
					onNewTask={() => {}}
					tasks={options.tasks ?? [BACKLOG_TASK, TODO_TASK, WIP_TASK, DONE_TASK]}
					statuses={STATUSES}
					availableLabels={[]}
					availableMilestones={[]}
					milestoneEntities={[]}
					archivedMilestones={[]}
				/>
			</MemoryRouter>,
		);
	});
	return container;
};

const waitForText = async (container: HTMLElement, text: string) => {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (container.textContent?.includes(text)) return;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
	}
};

const clickRow = async (container: HTMLElement, taskId: string) => {
	const row = Array.from(container.querySelectorAll("tr")).find((element) => element.textContent?.includes(taskId));
	expect(row).toBeTruthy();
	await act(async () => {
		(row as HTMLElement).dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
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
	for (const undo of restore) undo();
	restore.length = 0;
});

describe("Backlog page", () => {
	it("is titled Backlog and shows only Draft, Backlog, and To Do tickets", async () => {
		const container = renderBacklog();

		const heading = Array.from(container.querySelectorAll("h1")).find(
			(element) => element.textContent?.trim() === "Backlog",
		);
		expect(heading).toBeTruthy();

		await waitForText(container, "task-9");
		expect(container.textContent).toContain("task-9");
		expect(container.textContent).toContain("task-2");
		expect(container.textContent).toContain("task-3");
		expect(container.textContent).not.toContain("task-4");
		expect(container.textContent).not.toContain("task-5");
	});

	it("opens the draft editor for draft rows and the task editor for task rows", async () => {
		const openedTasks: string[] = [];
		const openedDrafts: string[] = [];
		const container = renderBacklog({
			onEditTask: (task) => openedTasks.push(task.id),
			onEditDraft: (draft) => openedDrafts.push(draft.id),
		});

		await waitForText(container, "task-9");
		await clickRow(container, "task-9");
		await clickRow(container, "task-2");

		expect(openedDrafts).toEqual(["task-9"]);
		expect(openedTasks).toEqual(["task-2"]);
	});
});
