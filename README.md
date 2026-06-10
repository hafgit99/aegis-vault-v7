# Aegis Vault 7

Aegis Vault 7 is a local-first secure vault application for passwords, cards, identities, secure notes, TOTP secrets, imports, exports, attachments, and security auditing.

The current codebase is the web foundation for the desktop application. The desktop target will be built first, followed by the Android target once the shared storage, crypto, and test layers are stable.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Lucide React

## Local Development

Prerequisite: Node.js 22 or newer.

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:3000`.

## Quality Commands

```bash
npm run typecheck
npm run build
npm run test:unit
```

## Project Priorities

- Stabilize the desktop codebase and repository structure.
- Replace AI Studio scaffolding with product-specific configuration.
- Add unit, integration, and end-to-end tests.
- Refactor the large UI surface into focused components and hooks.
- Harden cryptography, storage, import/export, attachments, and lock/unlock flows.
- Add Tauri desktop packaging.
- Prepare a shared core for the future Android version.
