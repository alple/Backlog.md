import { afterEach, describe, expect, it, mock } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

// react-tooltip's Tooltip crashes under JSDOM's strict Event IDL checks on mount, so stub it
// before SideNavigation loads; the link assertions only need plain anchor markup.
mock.module("react-tooltip", () => ({ Tooltip: () => null }));

const { default: SideNavigation } = await import("../web/components/SideNavigation.tsx");

// DOM-level verification that the fork-only Kanban Swim link sits directly below Kanban Board in
// the sidebar, in both the expanded and collapsed modes.

let activeRoot: Root | null = null;

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost/board",
	});
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as unknown as Document;
	globalThis.navigator = dom.window.navigator as unknown as Navigator;
	// SideNavigation reads the bare localStorage global during render.
	(globalThis as { localStorage?: Storage }).localStorage = dom.window.localStorage;
};

const renderNav = (collapsed: boolean): HTMLElement => {
	setupDom();
	window.localStorage.setItem("sideNavCollapsed", JSON.stringify(collapsed));
	const container = document.getElementById("root") as HTMLElement;
	activeRoot = createRoot(container);
	act(() => {
		activeRoot?.render(
			<MemoryRouter initialEntries={["/board"]}>
				<SideNavigation taskCount={0} docs={[]} decisions={[]} isLoading={false} onRefreshData={async () => {}} />
			</MemoryRouter>,
		);
	});
	return container;
};

afterEach(() => {
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
});

describe("Side navigation Kanban Swim link", () => {
	it("appears directly below Kanban Board in the expanded sidebar", () => {
		const container = renderNav(false);

		const links = Array.from(container.querySelectorAll("a"));
		const boardIndex = links.findIndex((link) => link.textContent?.includes("Kanban Board"));
		const swimIndex = links.findIndex((link) => link.textContent?.includes("Kanban Swim"));
		const backlogIndex = links.findIndex((link) => link.textContent?.trim() === "Backlog");

		expect(boardIndex).toBeGreaterThanOrEqual(0);
		expect(swimIndex).toBe(boardIndex + 1);
		expect(backlogIndex).toBe(swimIndex + 1);
		expect(links[swimIndex]?.getAttribute("href")).toBe("/board/swim");
		expect(links[backlogIndex]?.getAttribute("href")).toBe("/backlog");
	});

	it("appears with its tooltip in the collapsed sidebar", () => {
		const container = renderNav(true);

		const swimLink = Array.from(container.querySelectorAll("a")).find(
			(link) => link.getAttribute("href") === "/board/swim",
		);
		const backlogLink = Array.from(container.querySelectorAll("a")).find(
			(link) => link.getAttribute("href") === "/backlog",
		);
		expect(swimLink).toBeTruthy();
		expect(swimLink?.getAttribute("data-tooltip-content")).toBe("Kanban Swim");
		expect(backlogLink).toBeTruthy();
		expect(backlogLink?.getAttribute("data-tooltip-content")).toBe("Backlog");
	});
});
