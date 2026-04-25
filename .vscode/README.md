# `.vscode/`

Shared VS Code settings + recommended extensions. **Empty for now** — populated during MVP build.

**Planned files:**

- `extensions.json` — recommended extensions: ESLint, Prettier, Tailwind CSS IntelliSense, Drizzle, Docker.
- `settings.json` — shared settings: format on save, default formatter Prettier, TypeScript SDK pinned to workspace `node_modules`.
- `launch.json` — debug configurations for the Next.js app and the Drizzle migration runner.

**Why commit `.vscode/`?** The shared settings prevent the "works on my machine because my Prettier rules differ" class of bug. User-specific settings still go in the user's own VS Code profile and are gitignored at the file level (see `.gitignore`).
