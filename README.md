# CC-Toolify

Single-user proxy that adapts non-native-tool-calling models for Claude Code CLI and other Anthropic/OpenAI-compatible clients.

## Features

- Anthropic-compatible `/v1/messages` endpoint for Claude Code
- OpenAI-compatible `/v1/chat/completions` endpoint
- Built-in XML tool-call shim for upstream models without native tool support
- Upstream requests forced to stream mode, with downstream stream and non-stream compatibility
- Single-file SQLite storage via `sql.js` for provider/model config and recent request logs
- Minimal admin UI for provider setup and health checks
- Docker deployment

## Quick Start

1. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD` and `APP_SECRET`.
2. Install dependencies with `pnpm install`.
3. Start development mode with `pnpm dev`.
4. Open `http://localhost:3000/admin`.

## Docker

```bash
docker build -t cc-toolify .
docker run -p 3000:3000 --env-file .env -v ./data:/app/data cc-toolify
```

## Docker Compose

1. Copy `.env.example` to `.env`.
2. Set at least `ADMIN_PASSWORD` and `APP_SECRET`.
3. Start the service:

```bash
docker compose up -d --build
```

4. Check logs if needed:

```bash
docker compose logs -f
```

5. Open `http://<your-server-ip>:3000/admin`.

The compose setup mounts `./data` into `/app/data` so the single SQLite file and logs persist across container restarts.

## Notes

- Upstream APIs are expected to be OpenAI-compatible or Anthropic-compatible.
- Non-stream downstream requests are internally upgraded to upstream streaming and buffered before returning.
- The XML shim is intentionally opinionated in v1 to maximize parser stability.
- Persistence uses `sql.js` to write a single SQLite database file at `/app/data/cc-toolify.sqlite`, which avoids native Node bindings inside Docker.
