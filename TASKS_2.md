# TASKS_2 - NovaAI Extension Migration Plan

## Goal

Move the current NovaAI workflow from the web app into the VS Code extension so the extension becomes the primary product surface.

The extension must support:
(basically the stuff from the  frontend and backend ), nothing to think about, just move 

- User authentication
- Project list and project CRUD
- Project-scoped AI chat for IdeationAI and ComponentsAI
- Mobile-optimized sidebar UI
- Hardware repo selection with `.ino` and related project files (looks at all files and its extension, not fixed like only 2 files or only 3 files)
- Code generation inside ComponentsAI ( thr a button, and ai can edit, so keep context )
- Writing generated changes back into the selected local repo
- Wokwi simulator launch and sync
- Auto-minimizing the chat UI while the simulator is active
- A new ProjectAI agent with `.ino`, `.json`, and related project context
- A chip catalog and chip designer interface backed by JSON metadata

This document describes the implementation plan only. It is not the code change itself.

## Current State Summary

- The extension already has a basic chat view and a Wokwi simulator panel.
- The extension currently has limited UI and is not designed as the primary end-user workflow.
- The web app already contains the richer auth, project, and AI flow that needs to be migrated.

## Target Product Shape

The extension should replace the web app as the main workflow entry point.

The intended flow is:

1. User signs in inside the extension.
2. User sees projects.
3. User creates, edits, deletes, and opens a project.
4. Inside an open project, the user can chat with IdeationAI and ComponentsAI.
5. The user selects a local hardware repo containing `.ino`, `diagram.json`, config files, and related assets.
6. ComponentsAI can generate code and update the selected repo.
7. ProjectAI can inspect the selected hardware context and produce project-level guidance.
8. The Wokwi simulator starts from the selected local project.
9. The chat area collapses or minimizes while the simulator takes focus.

## Workstreams

### 1. Extension Shell And Navigation

Create a real extension shell that can host auth, projects, chats, and simulator state instead of a single simple panel.

Tasks:

- Define the extension entry points for auth, project browser, project workspace, and simulator workspace.
- Replace the current one-view experience with a multi-section layout or panel stack.
- Ensure the sidebar can collapse into a narrow mode for mobile-sized windows.
- Preserve the existing Wokwi integration while making it feel like a first-class part of the extension.

Implementation notes:

- Reuse the existing extension activation and Wokwi panel patterns where useful.
- Prefer a single extension state store to coordinate auth, project selection, active agent, repo path, and simulator state.
- Keep the default view lightweight so it loads quickly and does not overwhelm the sidebar.

Acceptance criteria:

- The extension opens into a usable shell rather than a single-purpose panel.
- Users can move between auth, projects, chat, and simulator without leaving the extension.
- Narrow windows still render correctly.

### 2. Authentication Flow

Bring auth into the extension so the user does not need to depend on the web app for sign-in.

Tasks:

- Implement sign-in and sign-out flow inside the extension.
- Persist the authenticated session in extension-safe storage.
- Handle token refresh or session revalidation if the backend supports it.
- Show clear unauthenticated and authenticated states.

Implementation notes:

- Use the backend auth API that already exists or expose a dedicated extension-friendly auth endpoint if the current contract is not sufficient.
- Keep cookie and session behavior compatible with local development and HTTP vs HTTPS differences.
- Surface auth errors clearly in the extension UI.

Acceptance criteria:

- A user can log in without opening the web app.
- The extension knows whether the user is authenticated on reload.
- Failed auth states are visible and recoverable.

### 3. Project Browser And CRUD

Move project listing and project management into the extension.

Tasks:

- Show the user’s projects after auth.
- Add create, read, update, delete actions for projects.
- Open a project into the project workspace view.
- Keep project selection and active project state persistent across sessions.

Implementation notes:

- Reuse backend project APIs if they already exist.
- Keep project cards or rows compact and readable in sidebar form.
- Include loading, empty, and error states.

Acceptance criteria:

- The user can manage projects entirely in the extension.
- Opening a project switches the extension into the project workspace.
- Project state survives extension reloads.

### 4. Project Workspace Chat

Build the in-project chat experience around the two existing AI roles.

Tasks:

- Add IdeationAI chat for product and feature brainstorming.
- Add ComponentsAI chat for hardware and code generation tasks.
- Keep the two agents distinct in UI and in backend routing.
- Make the chat usable in a narrow sidebar, not just a wide web page.

Implementation notes:

- Use tabs, segmented controls, or a stacked agent switcher so the user can move between agents quickly.
- Keep the composer compact and touch-friendly.
- Support streaming or progressive response rendering if the backend already provides it.

Acceptance criteria:

- A user can talk to IdeationAI and ComponentsAI from inside an open project.
- The chat does not break when the panel is narrow.
- The active agent is always obvious.

### 5. Hardware Repo Selection

Add a local project path picker so the extension can work against the user’s actual hardware repo.

Tasks:

- Let the user choose a local folder containing `.ino` and companion files.
- Detect and remember the selected repo path.
- Validate the path before using it.
- Scan for expected hardware files such as `.ino`, `diagram.json`, `wokwi.toml`, `wokwi.ini`, and related source files.

Implementation notes:

- The picker should work on Windows paths reliably.
- The extension should present a helpful error if the folder does not contain a usable project layout.
- The selected path should be separate from the project metadata so a project can map to a local repo.

Acceptance criteria:

- The user can select a local hardware repo from the extension.
- The extension can locate the primary sketch and config files.
- The selected repo is visible in the UI.

### 6. ComponentsAI Code Generation And Local File Updates

Extend ComponentsAI so it can generate code and commit the result into the selected repo.

Tasks:

- Define the code-generation contract for ComponentsAI.
- Allow ComponentsAI to return structured output that includes code changes and file targets.
- Apply generated changes to the selected local repo.
- Show a review step before overwriting files when needed.

Implementation notes:

- Prefer file-targeted updates over raw monolithic text replacement.
- Add safety checks for path traversal, missing files, and partial writes.
- Keep a clear distinction between generated suggestions and actual file writes.

Acceptance criteria:

- ComponentsAI can generate code for the selected project.
- The extension can write those changes into the local repo.
- The user can see what was changed.

### 7. ProjectAI Agent

Add a third agent, ProjectAI, focused on project-wide context rather than a single feature.

Tasks:

- Create a ProjectAI mode in the chat UI.
- Feed it the selected project context, including `.ino`, `.json`, config, and any other relevant files.
- Make it useful for reasoning about overall project structure, missing pieces, and integration issues.
- Keep it separate from IdeationAI and ComponentsAI.

Implementation notes:

- ProjectAI should assemble context from the local repo plus the active project metadata.
- Avoid passing unnecessary files so prompts stay focused.
- Make the context selection rules explicit and testable.

Acceptance criteria:

- The user can open ProjectAI from the project workspace.
- ProjectAI sees the project-level hardware context.
- Its responses are clearly positioned as project-wide guidance.

### 8. Chip Catalog And Chip Designer

Add a chip inventory and a design interface so users can select or define hardware parts more efficiently.

Tasks:

- Create a JSON file that stores chip metadata.
- Include fields such as chip name, type, pins, categories, aliases, default wiring hints, and Wokwi compatibility data.
- Add a dropdown or searchable picker for selecting chips.
- Add a design surface for defining new chips or editing chip metadata.

Implementation notes:

- Keep the JSON structure stable and versionable.
- Use the chip catalog as the source of truth for UI pickers.
- If a chip is not in the catalog, allow a safe custom-chip creation flow.

Acceptance criteria:

- The extension can show a list of chips from JSON metadata.
- The user can choose a chip from a dropdown where space allows.
- The user can define or edit a custom chip design.

### 9. Wokwi Simulator Integration

Keep the simulator flow, but make it part of the extension workflow rather than a separate distraction.

Tasks:

- Launch the Wokwi simulator from the selected local repo.
- Load the appropriate config and sketch files into the simulator flow.
- Keep the existing Wokwi extension compatibility path working.
- Sync simulator state with the current project and selected repo.

Implementation notes:

- Reuse the current Wokwi command bridge where possible.
- Make the simulator launch feel like the next step after code generation or repo selection.
- Preserve the current scan logic as a fallback, but move toward explicit project metadata.

Acceptance criteria:

- The simulator can be launched from the extension.
- The selected repo and simulator stay aligned.
- Existing Wokwi extension behavior is not broken.

### 10. Chat Minimization During Simulation

The chat panel should shrink or minimize when the simulator is active so it does not block the workspace.

Tasks:

- Add a minimize state for chat while the simulator is running.
- Make simulator view the primary focus when active.
- Restore the prior chat state when the simulator closes or loses focus.
- Ensure the layout still works on smaller screens.

Implementation notes:

- Favor a collapsible split view or compact rail over a hard hide.
- Preserve unread state and current agent when minimized.
- The simulator should never be blocked by the chat pane in the default flow.

Acceptance criteria:

- Starting the simulator makes the chat less dominant.
- The user can still return to the chat easily.
- The mobile/narrow view remains usable.

## Suggested File-Level Work Areas

- Extension host and command wiring in `vscode-extension/src/extension.ts`
- Extension manifest and command/view contributions in `vscode-extension/package.json`
- Chat and workspace UI structure in a new extension webview module or component layer
- Project/auth state management in a shared extension state service
- Chip catalog data in a dedicated JSON file under the extension source tree
- Simulator orchestration in the existing Wokwi integration path

## Implementation Order

1. Define the extension shell and navigation model.
2. Port auth into the extension.
3. Port project browsing and CRUD into the extension.
4. Add the project workspace with IdeationAI and ComponentsAI.
5. Add repo selection and local file update support.
6. Add ProjectAI with project-level context loading.
7. Add the chip JSON catalog and chip designer UI.
8. Polish simulator launching and chat minimization.
9. Add validation, error states, and persistence.
10. Test the full flow end to end.

## Risks And Constraints

- Extension UI space is limited, so the design must be compact and responsive.
- File writes to local repos need guardrails to avoid accidental data loss.
- The AI response format should tolerate non-JSON fallback output.
- The simulator and chat should not compete for the same layout space.
- Auth and backend contracts may need small adjustments to work well inside the extension.

## Definition Of Done

- The extension can replace the web app for the main workflow.
- Auth, projects, chat, repo selection, code generation, and simulator launch all work from the extension.
- ComponentsAI can write changes into a selected local repo.
- ProjectAI can reason over `.ino`, `.json`, and related files.
- The chip catalog and chip designer exist in the extension.
- The UI is usable in narrow/sidebar form and degrades gracefully on smaller screens.

## Approval Notes

Please review this task list and correct:

- The preferred order of implementation
- Any backend contracts that should be called out more explicitly
- Whether chip design should be a separate screen or part of ComponentsAI
- Whether the project browser should live in the Activity Bar, sidebar webview, or both


IMPORTANT: most stuff already exists, dont recode and rethink