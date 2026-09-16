---
id: BACK-689
title: >-
  Web UI: initiative containers - status-ignored umbrella tasks with swim-lane
  grouping
status: Done
assignee:
  - kilo
created_date: '2026-09-15 17:40'
updated_date: '2026-09-15 18:09'
labels: []
dependencies: []
ordinal: 320000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fork-only follow-up to BACK-687/688 implementing the Jira-style container split Alex approved: an umbrella/initiative is a task with type 'initiative' (added per-repo via config types) that never participates in status semantics - it is filtered off the Kanban board, Kanban Swim, and the Backlog view exactly like the Backlog status column is (status-policy.ts + additive App.tsx filters), while remaining fully editable (description/notes/--doc references) and visible in All Tasks; retirement = archiving the task. Feature roots stay epic tasks carrying their spec via --doc/description. The Kanban Swim view gains the board visual: initiative lanes (drag-reorderable among siblings via the existing ordinal/reorder endpoint, collapsible, no progress bar of their own, rollup count/progress over their subtree) that nest their child epic lanes plus a nested 'Tasks' lane for direct non-epic children. Epic lane drag-reorder becomes sibling-scoped (within the same parent initiative, or among standalone epics). Existing-file changes stay additive (App.tsx only); all other code lives in our fork files (status-policy.ts, epic-lanes.ts, SwimBoard.tsx) with tests updated.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tasks with type 'initiative' (case-insensitive) never render as cards on the Kanban board, the Kanban Swim view, or the Backlog view, and never appear in any status column; they remain listed in All Tasks and fully editable
- [x] #2 The swim view renders one initiative lane per initiative task, ordered by ordinal then id, always visible even when empty, draggable among sibling initiatives through the existing reorder endpoint, and collapsible with state persisted in localStorage
- [x] #3 Each initiative lane nests its child epic lanes (ordered by ordinal then id) plus a nested 'Tasks' lane whenever the initiative has direct non-epic children; nested epic lanes behave exactly like top-level epic lanes (columns, DnD confined to the lane, expansion, progress)
- [x] #4 Tasks whose parent is an initiative appear only in that initiative's nested lanes and never leak into the 'No epic' lane; deeper descendants render only as expansion rows
- [x] #5 Epic lane drag-reorder persists through the existing ordinal field and endpoint, scoped to siblings within the same parent (initiative or standalone)
- [x] #6 Initiative lane headers show a rollup task count and progress computed over the initiative's subtree; no progress claim is made for the initiative's own status
- [x] #7 bunx tsc --noEmit passes; biome passes on touched files; scoped tests pass including updated epic-lanes/status-policy tests and new swim-view initiative tests; existing-file diff remains additive (App.tsx only)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. status-policy.ts: INITIATIVE_TYPE='initiative', isInitiativeTask(task); tests.
2. epic-lanes.ts: containers = epics + initiatives (never cards); descendant BFS roots include initiatives and stop at containers so initiative children never leak into No epic; getEpicChildren excludes initiative children; new buildInitiativeGroups(tasks, lanes) (ordered by ordinal then id, child epic lanes + directKey when direct non-epic children exist) and groupTasksForLaneCells extended so initiative direct children get their own cells; laneKeyForTask returns undefined for initiative children (direct buckets handle them).
3. SwimBoard.tsx: extract reusable lane shell; render initiative groups (nested epic lanes + 'Tasks' lane, nested collapse via same localStorage map, initiative header with subtree count + rollup progress, drag-reorder among sibling initiatives); sibling-scoped epic lane reorder (bucket = sibling epic ids within same parent).
4. App.tsx (additive): boardPage + swimBoardPage tasks exclude initiatives; backlogPage tasks exclude initiatives.
5. Tests: status-policy, epic-lanes (nesting/leak prevention/ordering), web-swim-board (initiative lane nesting, direct tasks lane, sibling drag). Verify tsc/biome/scoped + full suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design choices: container detection is type-based (type 'initiative', config-driven per repo) rather than label-based for robustness; suppression rides the proven App-level filter pattern (boardTasks/planningTasks memos) so Board.tsx/TaskList.tsx stay untouched; lane drag reorder became sibling-scoped - epic lanes within the same parent, initiatives among initiatives - with cross-sibling drops rejected by the sibling lookup; the initiative's direct non-epic children get a nested 'Tasks' lane so plain tasks under an umbrella remain visible without forcing them into an epic.

Verification: bunx tsc --noEmit passes; biome passes on all touched files (2 auto-format fixes applied); scoped tests 83 pass across status-policy, epic-lanes, swim board, backlog page, sidebar, board suites - includes new initiative tests (nesting order, direct Tasks cells, no-epic leak prevention, sibling-scoped and initiative drag reorder, cross-sibling rejection). Full suite 2920 tests: failures are the known pre-existing duplicate-task-repair and the SPA-fallback parallel flakes (29/29 pass in isolation).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added initiative containers (Jira initiative/theme analog) to the fork: an initiative is a task with type 'initiative' that never participates in status semantics - App.tsx filters it off both boards and the Backlog view (additive memos boardTasks/planningTasks) while All Tasks keeps it listed and fully editable (description/notes/--doc references), and archiving the task retires it. The Kanban Swim view gained the two-level visual: violet initiative lanes (drag-reorderable among siblings via the existing ordinal endpoint, collapsible via the shared localStorage map, rollup count + progress over their subtree, an 'initiative' marker chip) nesting child epic lanes plus a nested 'Tasks' lane for direct non-epic children; epic lane drag is now sibling-scoped. Per-repo enablement is pure config: add 'initiative' to the project's config types. New/updated fork files: status-policy.ts, epic-lanes.ts (buildInitiativeGroups, groupInitiativeDirectTasks, container-aware descendants), SwimBoard.tsx, with tests; existing-file diff for this task is App.tsx-only and additive.
<!-- SECTION:FINAL_SUMMARY:END -->
