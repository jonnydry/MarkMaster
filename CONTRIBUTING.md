# Contributing to MarkMaster

Thanks for your interest in contributing! This guide covers how to get started, our conventions, and how to submit changes.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. **Install** dependencies: `npm install`
4. **Set up** your environment: `cp .env.example .env` and fill in values
5. **Run** the database migrations: `npm run db:migrate`
6. **Start** the dev server: `npm run dev`

## Development Workflow

### Branch Naming

- `feature/description` — new features
- `fix/description` — bug fixes
- `docs/description` — documentation updates
- `refactor/description` — code refactoring

### Before Committing

Always run these checks before pushing:

```bash
npm run lint
npm run test
npm run typecheck
```

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add keyboard shortcut for bulk tagging`
- `fix: resolve race condition in sync worker`
- `docs: update DATABASE.md with Neon pooling notes`
- `refactor: simplify orbit map camera controls`

## Code Conventions

### TypeScript

- Strict mode enabled — no `any` without justification
- Prefer explicit return types on exported functions
- Use `const` / `let` appropriately; avoid `var`

### Validation Schemas

- **zod** is used for server-side request validation (`src/lib/validations.ts`).
- **valibot** is used for client-side response validation (`src/lib/api-response-schemas.ts`).
- This split is deliberate — valibot's smaller footprint keeps the client bundle lean, while zod stays server-only. Don't import zod in client code or move schemas between the two files without keeping this boundary.

### React / Next.js

- App Router conventions — read `AGENTS.md` for project-specific rules
- Server Components by default; `'use client'` only when needed
- Hooks go in `src/hooks/`; shared UI in `src/components/`

### Styling

- Tailwind CSS utility classes — no inline styles
- Use the `surface-*` utilities defined in `globals.css` (see `AGENTS.md`)
- Square aesthetic: `rounded-sm` for components, `rounded-[2px]` for micro-elements
- Borders, not shadows (except `surface-overlay` stage shadow)

### Testing

- Vitest for unit tests
- Test files: `*.test.ts` or `*.test.tsx` alongside the source
- Prefer testing behavior over implementation details

## Pull Request Process

1. Ensure all checks pass (`lint`, `test`, `typecheck`)
2. Update documentation if your change affects setup or usage
3. Fill out the PR template (if available) or describe:
   - What changed and why
   - How to test the change
   - Any breaking changes
4. Request review when ready

## Design Decisions

MarkMaster's UI is **sharp, flat, and technical**. Before adding new UI, check:

- `AGENTS.md` for the design language contract
- `src/lib/app-layout.ts` for viewport layout tokens
- Existing components for patterns (e.g., `AppPageShell`, `PageHeader`)

## Questions?

Open a [GitHub Discussion](https://github.com/jonnydry/MarkMaster/discussions) or reach out via [GitHub Issues](https://github.com/jonnydry/MarkMaster/issues).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
