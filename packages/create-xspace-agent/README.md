# create-xspace-agent

Scaffold a ready-to-run AI voice agent for X (Twitter) Spaces, built on the
[`xspace-agent`](https://www.npmjs.com/package/xspace-agent) SDK.

## Usage

```bash
npm create xspace-agent@latest my-agent
# or
npx create-xspace-agent my-agent
```

Answer the prompts, or pass everything as flags:

```bash
npx create-xspace-agent my-agent --provider claude --template multi-agent --ts
```

| Flag | Values | Default |
|---|---|---|
| `[project-name]` | Directory to create | prompted |
| `-p, --provider <provider>` | `openai`, `claude`, `groq` | `openai` |
| `-t, --template <template>` | `basic`, `multi-agent`, `server` | `basic` |
| `--ts` / `--js` | TypeScript or JavaScript | TypeScript |
| `--no-install` | Skip `npm install` | installs |

## Templates

| Template | What you get |
|---|---|
| `basic` | A single agent that joins a Space and talks. |
| `multi-agent` | A team of agents with distinct personalities and turn management. |
| `server` | An agent server with an admin panel (Express and Socket.IO). |

Every project gets a `.env` with `AI_PROVIDER` and the matching API key variable, a
`tsconfig.json` for TypeScript projects, and a README.

## Next steps

```bash
cd my-agent
# fill in X_AUTH_TOKEN and your provider API key in .env
npm start
```

See the [`xspace-agent` README](https://www.npmjs.com/package/xspace-agent) for authentication
options and the full SDK.

## License

Proprietary. See [LICENSE](LICENSE).
