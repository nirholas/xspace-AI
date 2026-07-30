# Getting started with xspace-AI

AI agents that join, listen, and speak in X/Twitter Spaces — TypeScript SDK plus server, dashboard, and voice pipeline.

## Install

```bash
npm install
```

## Verify the install

Clone the repository and run its checks to confirm everything works on your machine:

```bash
git clone https://github.com/nirholas/xspace-AI.git
cd xspace-AI
```

Available commands:

| Command | Runs |
|---|---|
| `npm run build` | `turbo build` |
| `npm run dev` | `npx tsx watch packages/server/src/index.ts` |
| `npm run start` | `node dist/server/index.js` |
| `npm run lint` | `npx eslint src/` |
| `npm run typecheck` | `npx tsc --noEmit && npx tsc -p tsconfig.client.json --noEmit` |
| `npm run test` | `cd packages/core && npx --no-install vitest run` |

## Next steps

- [Examples](./examples.md) shows runnable snippets.
- The [README](https://github.com/nirholas/xspace-AI#readme) is the complete reference.
- Found a problem? [Open an issue](https://github.com/nirholas/xspace-AI/issues).
