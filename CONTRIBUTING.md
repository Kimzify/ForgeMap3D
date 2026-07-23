# Contributing to Forge Map 3D

Thanks for helping improve Forge Map 3D. Bug reports, focused fixes,
documentation, tests, and thoughtful feature proposals are all welcome.

By participating, you agree to follow the
[Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Before You Start

- Search existing issues before opening a new one.
- Use an issue to discuss changes with a broad product or data-source impact.
- Keep pull requests focused. Unrelated cleanup is easier to review separately.
- Never include API keys, private map data, generated models, or user location
  histories in commits or issue attachments.

## Development Setup

Forge Map 3D requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No environment variables are required today. If that changes, document new
variables in `.env.example` and never commit their values.

## Making a Change

1. Create a branch from the current default branch.
2. Follow the patterns and ownership boundaries already used in the codebase.
3. Add or update tests for behavior that can regress.
4. Run `npm run check`.
5. Explain the user-facing result and important implementation choices in the
   pull request.

For visual changes, include before/after screenshots at desktop and mobile
sizes. Do not commit generated STL, OBJ, MTL, or ZIP files.

For map-data changes, identify the affected source and geographic coverage.
Test representative locations inside the Netherlands, including one where
3DBAG building meshes are available and one where OpenStreetMap fallback
building footprints may be used. Preserve required attribution and document any
new upstream terms or rate limits.

## Testing

The main release gate is:

```bash
npm run check
```

It must work without contacting live map services. Network-dependent checks are
useful for manual verification, but they should not make the default test suite
unreliable.

Geometry regressions should use small deterministic fixtures. Prefer assertions
about output geometry and boundaries over screenshots alone.

## Reporting Bugs

Use the bug report template and include:

- The location or coordinates, selection shape, and radius
- What you expected and what happened
- Browser, operating system, and Node.js version when relevant
- A screenshot or short recording for rendering problems
- Console/server errors with secrets and personal data removed

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## Pull Request Review

Maintainers may ask for changes when a pull request affects printability,
upstream service usage, accessibility, or licensing. A contribution can be
declined when its maintenance cost or reliability impact is larger than its
benefit; that decision should still be explained respectfully.

Contributions are accepted under the repository's
[AGPL-3.0-only license](LICENSE).
