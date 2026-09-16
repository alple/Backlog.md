/**
 * Fork-only status policy: which configured statuses surface where.
 *
 * - The Backlog status is a real, assignable status, but it is not a column on the Kanban board or
 *   the Kanban Swim view; its tickets live on the Backlog page (/backlog) instead.
 * - The Backlog page gathers the not-started work queue: Draft tickets plus every configured
 *   planning status (Backlog, To Do).
 *
 * Pure data only: no API calls, no React. Adjust the constants to reshape the fork's behavior.
 */

export const HIDDEN_BOARD_STATUSES = ["backlog"];

export const PLANNING_STATUSES = ["Draft", "Backlog", "To Do"];

export const DRAFT_STATUS = "Draft";

/**
 * Initiative = the fork's umbrella container (Jira initiative/theme analog): a long-running task
 * that groups related, independently specced work. It carries no spec or end state of its own, so
 * it never participates in status semantics: boards, the swim view, and the Backlog view skip it
 * entirely, while All Tasks keeps it listed and editable. Retirement = archiving the task.
 */
export const INITIATIVE_TYPE = "initiative";

export const isInitiativeTask = (task: { type?: string }): boolean =>
	(task.type ?? "").trim().toLowerCase() === INITIATIVE_TYPE;

export const isHiddenBoardStatus = (status: string): boolean =>
	HIDDEN_BOARD_STATUSES.includes(status.trim().toLowerCase());

/** Configured statuses minus the ones that never render as board columns. */
export const filterBoardStatuses = (statuses: string[]): string[] =>
	statuses.filter((status) => !isHiddenBoardStatus(status));

export const isPlanningStatus = (status: string): boolean => {
	const normalized = status.trim().toLowerCase();
	return PLANNING_STATUSES.some((candidate) => candidate.trim().toLowerCase() === normalized);
};

export const isDraftStatus = (status: string): boolean => status.trim().toLowerCase() === DRAFT_STATUS.toLowerCase();

/** Draft first (it is a pseudo-status outside the config list), then the configured planning statuses. */
export const planningStatusOptions = (configuredStatuses: string[]): string[] => [
	DRAFT_STATUS,
	...configuredStatuses.filter((status) => isPlanningStatus(status) && !isDraftStatus(status)),
];
