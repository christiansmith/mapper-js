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
