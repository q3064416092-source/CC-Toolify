# Repository Guidelines

## Project Structure & Module Organization
The backend lives in `src/` and is compiled to `dist/`. Keep protocol adapters in `src/protocols/`, business logic in `src/services/`, and shared helpers in `src/utils/`. Backend tests live in `tests/` and follow the `*.test.ts` pattern. The admin UI lives in `web/`: place React pages in `web/src/pages/`, reusable components in `web/src/components/`, API clients in `web/src/api/`, and Zustand stores in `web/src/stores/`. Runtime data is stored in `data/`. Treat `dist/` and `web/dist/` as generated output.

## Build, Test, and Development Commands
Run backend dev mode with `pnpm dev` and the frontend dev server with `pnpm dev:web`. Use `pnpm build` to build both apps, or `pnpm build:server` for the backend only. Start the compiled server with `pnpm start`. Run backend tests with `pnpm test`. For frontend-only work, use `cd web && pnpm build`, `cd web && pnpm lint`, and `cd web && pnpm preview`.

## Coding Style & Naming Conventions
Use TypeScript throughout and keep code compatible with strict compiler settings. Prefer 2-space indentation, semicolons, and ES module imports. Use `camelCase` for variables and functions, `PascalCase` for React components and page files, and descriptive kebab-case filenames for services such as `provider-service.ts`. Inside `web/`, prefer the `@/*` path alias over deep relative imports when it improves clarity.

## Testing Guidelines
Vitest is the current test framework. Add or update `tests/*.test.ts` files for protocol behavior, service logic, SSE handling, and XML shim changes. Every bug fix should include a regression test when practical. Before opening a PR, run `pnpm test`; for frontend changes, also run `cd web && pnpm lint` and `cd web && pnpm build`.

## Commit & Pull Request Guidelines
Follow the repository's existing commit style: short, scoped messages, often written in Chinese and focused on a single change. Keep each commit focused on one change. PRs should include a brief summary, affected area (`backend` or `web`), test evidence, linked issues when applicable, and screenshots for visible UI changes.

## Configuration & Agent Notes
Copy `.env.example` to `.env` for local setup and never commit real secrets. Docker workflows are defined by `Dockerfile` and `docker-compose.yml`. When reading or editing files that contain Chinese text, preserve the original encoding and avoid rewriting the file with the wrong charset.
