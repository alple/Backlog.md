---
id: BACK-688
title: >-
  Web UI: hide Backlog column from both boards and add a Backlog view for
  Draft/Backlog/To Do
status: Done
assignee:
  - kilo
created_date: '2026-09-15 14:14'
updated_date: '2026-09-15 14:30'
labels: []
dependencies: []
ordinal: 319000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fork-only follow-up to BACK-687. Decisions (Alex): (1) The Backlog status column is hidden from BOTH the Kanban board and the Kanban Swim view - it stays a real status, assignable from the task editor, visible in All Tasks/Milestones. (2) A new 'Backlog' nav item below 'Kanban Swim' (route /backlog) shows tickets in Draft + Backlog + To Do, reusing the existing TaskList table via a thin wrapper. Drafts are a separate corpus (loaded by DraftsList via /api/drafts and the drafts-updated event), so the wrapper fetches drafts itself and merges them with the planning-status tasks. Existing-file changes stay additive: App.tsx (status filter import + statuses prop change + route), SideNavigation.tsx (nav links), TaskList.tsx (one optional title prop defaulting to the current heading). Status policy lives in one new testable module (src/web/lib/status-policy.ts) so hidden/planning statuses are easy to adjust later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Kanban board at /board renders no Backlog column; tasks with status Backlog are not rendered as board cards, while the task edit modal, All Tasks, and Milestones still offer Backlog as a status
- [x] #2 The Kanban Swim view at /board/swim renders no Backlog column either; its other configured status columns are unchanged
- [x] #3 A 'Backlog' nav item sits directly below 'Kanban Swim' in both expanded and collapsed sidebar modes, linking to /backlog
- [x] #4 The /backlog view renders the existing TaskList table titled 'Backlog' showing only tasks whose status is Draft, Backlog, or To Do (case-insensitive); tasks in other statuses never appear there
- [x] #5 The /backlog view merges in drafts fetched from /api/drafts (refreshed on the drafts-updated event like DraftsList), and clicking a draft row opens the draft editor while clicking a task row opens the task editor
- [x] #6 Backlog filtering/planning-status policy lives in src/web/lib/status-policy.ts with unit tests; existing-file diffs remain additive (App.tsx, SideNavigation.tsx, TaskList.tsx title prop)
- [x] #7 bunx tsc --noEmit passes; biome passes on touched files; scoped tests pass including new status-policy and BacklogPage tests
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. status-policy.ts: HIDDEN_BOARD_STATUSES=['backlog'], PLANNING_STATUSES=['Draft','Backlog','To Do'], filterBoardStatuses(), isPlanningStatus(), planningStatusOptions() (Draft + configured planning statuses); tests.
2. TaskList.tsx: add optional title prop defaulting to 'All Tasks' (one additive prop; h1 uses it).
3. BacklogPage.tsx: fetch /api/drafts on mount + drafts-updated listener (mirrors DraftsList); merge drafts with tasks filtered to planning statuses; pass discriminating onEditTask (Draft -> onEditDraft else onEditTask) into TaskList with availableStatuses=planning options and title='Backlog'.
4. App.tsx: filterBoardStatuses(statuses) for boardPage AND swimBoardPage; backlogPage element (onEditTask=handleEditTask, onEditDraft=openDraftModal, tasks, statuses, list props); Route path='backlog'.
5. SideNavigation.tsx: 'Backlog' NavLink below Kanban Swim (expanded + collapsed icon).
6. Tests: web-backlog-page.test.tsx (stub globalThis.fetch for /api/drafts; assert only planning statuses render; title 'Backlog'; draft vs task editor callbacks). Verify tsc/biome/scoped tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Case-sensitivity bug caught by tests: isPlanningStatus used Array.includes against display-case constants with lowercased input, silently filtering every planning status out; fixed with a normalized comparison.

Verification: bunx tsc --noEmit passes; biome passes on all touched files; scoped tests pass (status-policy 5, BacklogPage DOM 2, sidebar nav 2, plus existing board/swim/task-list suites - 82 across the 8 affected files). Full suite 2901 pass / 2 fail: duplicate-task-repair (pre-existing, verified on clean tree earlier) and one SPA-fallback parallel-load flake that passes in isolation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backlog status is now excluded from the columns of both the Kanban board and the Kanban Swim view (statuses={filterBoardStatuses(statuses)} in App.tsx) while remaining assignable in the task editor and visible in All Tasks/Milestones. Added the fork-only Backlog view (/backlog, nav item below Kanban Swim): a thin BacklogPage wrapper that reuses the All Tasks table (TaskList gained one optional title prop, default unchanged) with tasks pre-filtered to Draft + Backlog + To Do via the new src/web/lib/status-policy.ts policy module, and merges drafts fetched from /api/drafts with drafts-updated refresh (mirroring DraftsList); draft rows open the draft editor, task rows the task editor. New files: status-policy.ts (+tests), BacklogPage.tsx, web-backlog-page.test.tsx. Existing-file diff strictly additive (App.tsx, SideNavigation.tsx, TaskList.tsx). Verified with tsc, biome, and the scoped test run noted above.
<!-- SECTION:FINAL_SUMMARY:END -->
