---
id: BACK-687
title: 'Web UI: Kanban Swim view with epic swim lanes at /board/swim'
status: Done
assignee:
  - kilo
created_date: '2026-09-15 09:12'
updated_date: '2026-09-15 09:51'
labels: []
dependencies: []
ordinal: 318000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fork-only feature (not intended for upstream). Alex wants a Jira-style epic swim-lane board: a new 'Kanban Swim' page reachable from the left sidebar below 'Kanban Board', rendered at /board/swim. Swim lanes are epic tasks (type 'epic'); each lane shows only the epic's direct children (parentTaskId = epic) as cards, with in-place expansion to reveal a card's subtasks without opening the details modal. A pinned 'No epic' lane holds tasks without an epic parent; epic tasks are never rendered as cards. Epic lane order persists through the existing task ordinal field via the existing updateTask API - no new fields or endpoints. Merge-friendliness with upstream is the top constraint: all new code lives in new files (src/web/lib/epic-lanes.ts, src/web/components/SwimBoard.tsx, src/web/components/SwimBoardPage.tsx + tests); among existing files only App.tsx (one import + one route) and SideNavigation.tsx (one nav link per mode) are touched, and only additively. The board's milestone lane mode (src/web/lib/lanes.ts + Board.tsx lane rendering) is the visual and behavioral pattern to mirror. Decision record: standalone page chosen over extending LaneMode with 'epic' specifically to keep Board.tsx/lanes.ts/BoardPage.tsx untouched; drag lane headers chosen for epic ordering; same filter toolbar as the board (assignee, labels, type, priority, project); direct children only with expandable subtasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A 'Kanban Swim' nav item appears in the left sidebar directly below 'Kanban Board' in both expanded and collapsed sidebar modes
- [x] #2 Visiting /board/swim renders a Kanban board whose columns are the configured statuses and whose swim lanes are epic tasks (type 'epic') ordered by their existing ordinal field (fallback: task id), with a pinned 'No epic' lane for tasks whose parentTaskId is absent or points at a non-epic task
- [x] #3 Each epic lane shows only direct children of that epic as cards; epic tasks themselves never appear as cards anywhere in the view; completed/archived tasks are excluded the same as the regular board (filterKanbanTasks)
- [x] #4 A card whose task has subtasks shows an expand/collapse toggle; expanding renders its subtask cards in place beneath it in the same status column, without opening the task details modal
- [x] #5 Epic lane headers can be drag-reordered; the resulting order persists through the epic tasks' existing ordinal field using the existing updateTask API, and no new fields, endpoints, or serialization changes are introduced
- [x] #6 Dragging a card between status columns updates the card's status; drops are confined to the card's own lane (no cross-lane re-parenting); lane collapse state persists across reloads via localStorage
- [x] #7 The view exposes the same filter toolbar as the Kanban board (assignee, labels, type, priority, project) and filtering behaves like the board's
- [x] #8 Diff on existing files is limited to: App.tsx (+1 import, +1 route element, +1 <Route path='board/swim'>), SideNavigation.tsx (additive nav links only); Board.tsx, BoardPage.tsx, lanes.ts, TaskColumn.tsx, TaskCard.tsx and all other existing files are unmodified
- [x] #9 bunx tsc --noEmit passes; bun run check . passes; scoped tests pass including new tests for epic lane building/ordering/grouping
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. epic-lanes.ts: pure lane logic - epic detection (type=epic), lane order (ordinal asc then id), 'No epic' pinned last, direct-child membership, status grouping reusing sortTasksForStatus patterns; tests in epic-lanes.test.ts.
2. SwimBoard.tsx: filter toolbar mirroring Board.tsx, epic lane shells (drag-reorderable header, collapse, done/total progress), status columns rendering TaskCard rows with expansion chevrons for tasks with subtasks (subtask cards indented in place), DnD for status change within the card's own lane only, ordinal persistence via apiClient.updateTask on lane reorder.
3. SwimBoardPage.tsx: URL-param-synced wrapper mirroring BoardPage (assignee/label/type/priority/project params).
4. App.tsx: +1 import, swimBoardPage element, <Route path='board/swim'> (v6 static segment outranks board/* catch-all).
5. SideNavigation.tsx: 'Kanban Swim' NavLink below 'Kanban Board' + collapsed-mode icon link.
6. Verify: bunx tsc --noEmit, bun run check ., scoped bun tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design bug found and fixed during testing: epic grandchildren (parent = a child card) leaked into the No epic lane while also being expansion rows. epic-lanes.ts now computes epic-descendant ids (BFS from epics, stopping at epic-typed descendants) and excludes them from lane membership, so they render only as in-place expansion rows.

Verification: bunx tsc --noEmit passes; biome check passes on all touched files (repo-wide bun run check . flags a pre-existing formatting error in the user's staged .kilo/jetbrains.json, untouched here); scoped tests pass (23 across epic-lanes.test.ts, web-swim-board.test.tsx, web-side-navigation-swim-link.test.tsx). Full suite: 2890 pass, 3 fail - one pre-existing on the clean tree (duplicate-task-repair, verified via git stash) and two parallel-load flakes that pass in isolation (server-tasks-spa-fallback, server-demote-endpoint).

react-tooltip's Tooltip crashes under JSDOM's Event IDL checks, so web-side-navigation-swim-link.test.tsx stubs it with mock.module before importing SideNavigation. The sidebar link test pins the Kanban Swim NavLink directly below Kanban Board in expanded mode and via tooltip in collapsed mode.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a fork-only Kanban Swim view (/board/swim, nav item 'Kanban Swim' below 'Kanban Board'): epic tasks become drag-reorderable swim lanes ordered by the existing task ordinal field through the existing reorder endpoint; each lane shows only the epic's direct children as cards with in-place subtask expansion, a pinned No epic catch-all lane, board-identical filter bar, column DnD confined to the card's own lane, collapse state in localStorage, and board-identical hide-empty-columns behavior. New files: src/web/lib/epic-lanes.ts (+tests), src/web/components/SwimBoard.tsx, SwimBoardPage.tsx, src/test/web-swim-board.test.tsx, src/test/web-side-navigation-swim-link.test.tsx. Existing-file diff is purely additive: App.tsx (+import, +swimBoardPage element, +1 route) and SideNavigation.tsx (+icon, +2 nav links). Verified with bunx tsc --noEmit, biome on touched files, and 23 new DOM-level tests; full-suite failures are pre-existing/flaky (unrelated).
<!-- SECTION:FINAL_SUMMARY:END -->
