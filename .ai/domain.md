# Domain Model & Cryptography (`irori`)

## 1. Core Domain Entities

Canonical TypeScript types live in `app/lib/schemas/index.ts`; persistent Durable Object tables live in `workers/db/space.schema.ts` and `workers/db/user.schema.ts`:

- **User (`UserProfileEntity` / `UserActor`)**:
  - Authenticated via Google OAuth 2.0 PKCE S256 (`app/lib/auth/oauth.server.ts`).
  - Session stored in HMAC-SHA256 signed `HttpOnly` cookie `irori_session` (`30d` TTL with `<15d` rolling refresh in `app/lib/auth/session.server.ts`).
- **Space (`SpaceMetaEntity` / `SpaceActor`)**:
  - Isolated community workspace backed by one `SpaceActor` instance per `spaceId`.
  - Contains `ChannelSettings`, memberships, invite links (`app/routes/join.$spaceId.tsx`), custom emojis (`app/routes/api.spaces.$spaceId.emojis.ts`), incoming webhooks (`app/routes/api.webhooks.$token.ts`), and encrypted Space Key envelopes.
- **Channel & Ephemeral Room**:
  - Channels can operate as persistent rooms or ephemeral timed rooms (`expires_at` on messages and `auto_close_hours` on channels).
  - Expired messages and R2 attachments are reclaimed deterministically by `SpaceActor.alarm()` (`workers/actors/space.actor.ts`).
- **Message (`MessageEntity`)**:
  - Always follows the **1 message = 1 independent bubble** UI invariant (`app/components/chat/message-bubble.tsx`, `.docs/DESIGN.md`) rather than Slack-style grouped consecutive messages, ensuring clean scannability and unambiguous reaction/bookmark targets.

## 2. Cryptographic Key Hierarchy

| Key Type | Lifecycle & Storage | Algorithm | Source Module |
| :--- | :--- | :--- | :--- |
| **Device Identity Keypair (ECDH / Signing)** | Browser IndexedDB `irori_e2ee_keystore_v1` (`extractable: false`) | Web Crypto API (P-256) | `app/lib/crypto/e2ee.client.ts` |
| **Space Key (Symmetric)** | Generated client-side; wrapped per member device via ECDH key envelopes (`envelope.client.ts`) | AES-GCM 256-bit | `app/lib/crypto/envelope.client.ts` |
| **Media Blob Key** | Random content/message encryption before upload to R2 (`IRORI_BUCKET`) | AES-GCM 256-bit | `app/routes/api.media.$key.ts`, `app/components/chat/chat-input.tsx` |
| **Backup Vault PIN Key** | User PIN + server `IRORI_PEPPER` (`ENV`) + PBKDF2 (`310,000` iters) -> wraps key material in `UserActor` | PBKDF2 + `AES-KW` | `app/lib/crypto/backup-pin.client.ts`, `app/routes/restore-key.tsx`, `workers/actors/user.actor.ts` |
| **QR Cross-Device Sync** | Ephemeral ECDH P-256 session to transfer wrapped key material between logged-in user devices | ECDH P-256 + AES-GCM | `app/lib/crypto/qr-sync.client.ts`, `app/routes/settings.tsx` |

## 3. Domain Terminology

- **Envelope**: Per-recipient encrypted copy of a Space Key stored server-side without revealing plaintext key bytes.
- **Pepper (`IRORI_PEPPER`)**: Worker secret mixed into backup PIN authorization so offline brute-force against `UserActor` backup state cannot succeed without server participation.
- **Ephemeral Purge**: Scheduled deletion in `SpaceActor.alarm()` covering SQLite rows and R2 keys whose `expires_at <= nowIso`.
- **Ambient Irori Mode**: Built-in Web Audio ASMR synthesizer (`app/hooks/useAmbientSound.ts`) supporting calm/focus reading acoustics.
