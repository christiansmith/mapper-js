# mapper-js

Declarative JSON-to-JSON transformation: a mapping document pairs target
JSON Pointers with source descriptors; `Mapper.map(descriptor, input)` builds
the output. Published to JSR and npm as `@christiansmith/mapper-js`.

## Layout

- `src/Mapper.js` — the entire engine: `map`/`get`/`set`/`read`/`nest`/`shift`/
  `deref`/`extend` plus the `Mapper` class.
- `src/JSONPointer.js` — RFC 6901 implementation with extensions (URI fragment
  form, recover-mode container creation, `-` append).
- `test/run.test.js` — data-driven runner; executes every YAML suite in
  `test/cases/` (format documented in `test/cases/README.md`).
- `test/extensions.js` — deterministic initializers/transformers/plugins for
  test cases.

## Conventions

- Plain JavaScript (ESM), no build step, no runtime dependencies.
- Format with **Prettier** using the repo `.prettierrc` (no semicolons, single
  quotes, width 110) — not `deno fmt`.
- Tests: `deno task test`. Test cases are data — prefer adding a YAML case
  over an ad-hoc test. The suite is a **characterization suite**: it pins what
  the implementation actually does, including cases marked `deviation:` that
  document known quirks. Never change observable behavior casually; when a
  behavior changes deliberately, update the affected cases (and their
  `deviation` markers) in the same commit.
- `deno.json` `publish.exclude` keeps `test/` out of the JSR tarball.

## Authorship

This engine is the maintainer's original work, and source changes are his to
write. Agents working in this repo:

- **Do not edit source files by default.** Contribute questions that probe how
  the code should work, proposals clearly framed as proposals, and test cases
  (YAML cases in `test/cases/`) for the maintainer to edit and review.
- **The maintainer writes the changes that satisfy the tests.** He may
  delegate a specific edit explicitly, per change; absent that grant, leave
  the source untouched.
- **Nothing commits without maintainer review and sign-off** — this applies to
  delegated edits too.
