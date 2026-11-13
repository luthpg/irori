# Approved Patterns (`irori`)

## 1. React Router Loaders, Actions & Browser Decryption

- **Server Auth Guard First**: Every protected `loader` and `action` calls `requireAuth` from `app/lib/auth/session.server.ts` before invoking Durable Object RPC stubs.
- **`clientLoader.hydrate` + `HydrateFallback`**: Encrypted views (e.g., `app/routes/chat.$spaceId.$channelId.tsx`) fetch ciphertext in SSR `loader`, then decrypt in browser memory via `clientLoader` (`clientLoader.hydrate = true`). Always keep a calm `HydrateFallback` so SSR hydration never flashes unstyled or encrypted ciphertext.
- **No Unfiltered Client Error Leaks**: Keep production errors generic in `app/root.tsx` `ErrorBoundary`; expose verbose stack/error details only when `import.meta.env.DEV` is true.

## 2. Real-Time WebSockets (`useSpaceWebSocket`)

- **Stable Callback Refs**: Store WebSocket event handlers inside refs (`onServerEventRef` in `app/hooks/useSpaceWebSocket.ts`) so reconnect effects depend solely on space/channel identity, never tearing down sockets on parent re-renders.
- **Typed Protocol**: Add new client/server events strictly in `app/lib/schemas/index.ts` (`ClientToServerWsEvent`, `ServerToClientWsEvent`) before implementing handlers in `workers/actors/space.actor.ts` and `app/hooks/useSpaceWebSocket.ts`.

## 3. UI, Typography & Input Ergonomics

- **1 Message = 1 Independent Bubble**: Render each `MessageEntity` in `app/components/chat/message-bubble.tsx` / `app/components/chat/chat-timeline.tsx` as its own standalone bubble; do not compact consecutive posts into headerless chains.
- **Japanese Readability (`BudouX` + No Italics)**: Use `app/hooks/useBudouX.ts` and `.budoux-text` (`app/app.css`) for natural phrase-boundary line breaking, and preserve `font-style: normal` globally.
- **Keyboard & IME Safety**: Always delegate textarea `Enter` handling to `resolveEnterKeyAction` (`app/lib/keyboard.ts`) so IME composition (`isComposing`, `justEndedComposition`, `keyCode === 229`, `which === 229`) and mobile touch newlines remain bug-free.
- **Calm Contrast & Focus**: Preserve `.docs/DESIGN.md` dark canvas tokens and explicit `2px solid #ff5722` focus indicators (`app/app.css`).

## 4. Coding Style & Biome Conventions

- Format and lint with `biome.json`: single quotes (`'...'`), 2-space indent, sorted imports (`organizeImports: "on"`), `recommended` lint rules.
- Always use `===` and `!==`, reserving `==` / `!=` solely for nullish checks (`value == null` or `value != null`).
- Avoid `while ((match = ...) !== null)` (`noAssignInExpressions` in Biome); prefer `for (const match of text.matchAll(pattern))`.
- Use `node:` prefixes (`node:fs`, `node:path`) in Node tooling scripts (`scripts/`).
