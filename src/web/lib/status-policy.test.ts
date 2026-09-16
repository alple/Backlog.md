import { describe, expect, it } from "bun:test";
import {
	DRAFT_STATUS,
	filterBoardStatuses,
	isDraftStatus,
	isHiddenBoardStatus,
	isPlanningStatus,
	planningStatusOptions,
} from "./status-policy";

describe("filterBoardStatuses", () => {
	it("drops Backlog case-insensitively and keeps every other status in order", () => {
		expect(filterBoardStatuses(["Backlog", "To Do", "In Progress", "Done"])).toEqual(["To Do", "In Progress", "Done"]);
		expect(filterBoardStatuses(["backlog", "To Do"])).toEqual(["To Do"]);
		expect(filterBoardStatuses(["To Do", "Done"])).toEqual(["To Do", "Done"]);
	});
});

describe("isHiddenBoardStatus", () => {
	it("matches trimmed, lowercased status names", () => {
		expect(isHiddenBoardStatus(" Backlog ")).toBe(true);
		expect(isHiddenBoardStatus("To Do")).toBe(false);
	});
});

describe("planning statuses", () => {
	it("treats Draft, Backlog, and To Do as planning statuses", () => {
		expect(isPlanningStatus("Draft")).toBe(true);
		expect(isPlanningStatus("backlog")).toBe(true);
		expect(isPlanningStatus("To Do")).toBe(true);
		expect(isPlanningStatus("In Progress")).toBe(false);
		expect(isPlanningStatus("Done")).toBe(false);
	});

	it("builds Draft-first options from configured statuses without duplicates", () => {
		expect(planningStatusOptions(["Backlog", "To Do", "In Progress", "Done"])).toEqual([
			DRAFT_STATUS,
			"Backlog",
			"To Do",
		]);
		expect(planningStatusOptions(["Draft", "To Do"])).toEqual([DRAFT_STATUS, "To Do"]);
	});

	it("recognizes draft status case-insensitively", () => {
		expect(isDraftStatus("Draft")).toBe(true);
		expect(isDraftStatus("draft")).toBe(true);
		expect(isDraftStatus("To Do")).toBe(false);
	});
});
