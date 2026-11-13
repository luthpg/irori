# Pitfalls: UI, React Router & Client Interactions

### Japanese IME `Enter` Sending Unconfirmed Kanji Conversion
- **Symptom**: Pressing `Enter` to confirm an IME conversion candidate immediately sends the partial message if only `e.key === 'Enter'` is checked, or breaks Safari/Chrome composition-end ordering.
- **Fix & Guardrail**: Always route Enter key handling through `resolveEnterKeyAction` in `app/lib/keyboard.ts` (`isComposing`, `justEndedComposition`, `keyCode === 229`, `which === 229`) and cover regressions in `tests/keyboard.test.ts`.

### `useSpaceWebSocket` Reconnect Churn on Parent Re-Renders
- **Symptom**: Including caller callback props directly in WebSocket `useEffect` dependency arrays tears down and re-opens Durable Object sockets on every state update.
- **Fix & Guardrail**: Keep the `onServerEventRef` pattern intact in `app/hooks/useSpaceWebSocket.ts` so socket lifecycles depend strictly on room/space identity.

### Violating `1 Message = 1 Bubble` or Introducing Italics
- **Symptom**: Grouping consecutive messages omits timestamps/reactions per item, and `italic` styles hurt Japanese/dense glyph readability.
- **Fix & Guardrail**: Preserve `app/components/chat/message-bubble.tsx` single-bubble layout and global `font-style: normal` in `app/app.css`.

### Client Media Size & Encryption Order
- **Symptom**: Uploading raw `File` bytes or files `> 5MB` either fails server limits or leaks unencrypted payloads.
- **Fix & Guardrail**: Enforce the `5MB` upload limit and client-side Web Crypto encryption in `app/components/chat/chat-input.tsx` before calling `` `/api/media/:key` `` (`app/routes/api.media.$key.ts`).
