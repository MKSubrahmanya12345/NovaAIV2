# NeuroBoard AI - Alden Branch Change Notes

This document summarizes what was added or changed in this mixed local version compared to `mkhardcode/main`.

## Branch baseline

- Compared against remote baseline: `mkhardcode/main`
- This branch keeps local feature work and merges it with the original mainline content.

## Major feature additions

1. Board-aware Arduino intelligence
- Added canonical board definition module for board pin mapping and prompt context.
- New file: `backend/src/lib/arduino-boards.js`
- Supports board-aware behavior for Arduino Uno and ESP32 DevKit V1 in AI flows.

2. AI workflow upgrades
- Extended ideation/components/design generation logic to use selected board context.
- Improved fallback component inference for board-specific cases.
- Updated: `backend/src/services/ai.services.js`

3. Design and simulation flow enhancements
- Updated design, project, and Wokwi-related controllers/routes for the new workflow.
- Added smoke test workspace for Wokwi validation.
- Added files:
  - `backend/wokwi-smoke/diagram.json`
  - `backend/wokwi-smoke/sketch.ino`
  - `backend/wokwi-smoke/smoke.test.yaml`
  - `backend/wokwi-smoke/wokwi.toml`

4. Frontend workspace and diagram UX improvements
- Upgraded project workspace and chat flow to support richer design/code collaboration.
- Added and integrated richer chat rendering.
- Added board-aware diagram generation and export model alignment.
- Added zoom/pan and improved wire label box readability in circuit preview.
- Key updates:
  - `frontend/src/components/ProjectChat.jsx`
  - `frontend/src/components/DesignChat.jsx`
  - `frontend/src/components/ProjectMainPage.jsx`
  - `frontend/src/components/ChatRichText.jsx`
  - `frontend/src/components/CreateProjectModal.jsx`
  - `frontend/src/index.css`

5. Auth and platform integration updates
- Authentication and project flow improvements across backend and frontend.
- Firebase client integration added on frontend.
- Key updates:
  - `frontend/src/lib/firebase.js`
  - `frontend/src/store/useAuthStore.js`
  - `frontend/src/pages/AuthPage.jsx`
  - Backend auth, middleware, user/project model and route/controller updates.

6. Dependency and lockfile updates
- Added lockfiles and updated package dependencies for both backend and frontend.
- Files:
  - `backend/package-lock.json`
  - `frontend/package-lock.json`
  - `backend/package.json`
  - `frontend/package.json`

## Additional repository changes

- Removed `.github` directory from this mixed local line of development.

## Validation snapshot

- Frontend production build passes with Vite.
- Backend exposes `dev` script and runs via `nodemon src/index.js`.

## Intent of this branch

The goal of this branch is to preserve all local feature work while staying compatible with the original upstream main branch content, so both sets of changes exist together without feature loss.
