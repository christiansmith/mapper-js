# Changelog

Notable changes to `@christiansmith/mapper-js`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org). Pre-1.0, the public API may change between
minor versions.

## [0.3.0] — unreleased

## [0.2.0]

The conformance release: the reference implementation now conforms to
`SPEC.md` everywhere the suite probes. The twelve deviations recorded in
Appendix A (A1–A12) are resolved; the probes that pinned them are now
conformance cases. Two narrow diagnostics remain deferred and are recorded
in Appendix A.

### Added

- `$extend` accepts a list of ids as well as a single id. Ancestors merge in
  list order with the extending mapping last; later layers override earlier
  ones, and an overridden pairing evaluates at the overriding layer's
  position. Shared ancestry needs no special treatment.

### Changed

- **Behavior changes from the deviation fixes** — the most likely to be
  noticed:
  - An unrecognized string descriptor (not a pointer, relative reference, or
    registered name — bare `#/…` fragment strings included) now yields a
    diagnostic instead of silently evaluating to the whole source scope (A6).
  - A falsy `each` element (`0`, `""`, `false`, `null`) now evaluates in its
    own position instead of against the parent scope (A12).
  - Variant lists select the first **defined** result, matching the `first`
    combinator; defined-but-falsy results are no longer skipped (A5).
  - `switch.input` and `switch.output` read the branch key from the root
    input and root output respectively; documents pairing the locate keyword
    with the matching switch scope are unaffected (A10).
  - Validators skip undefined values (except `required`) and check only
    values of their own type; `minimum: 0`/`maximum: 0` are honored; decimal
    `multipleOf` operands work; `as` on an absent value yields undefined (A4).
  - Booleans and `null` are written through the mapping dispatch (A1); an
    empty array maps to an empty array (A2).
  - Recovering writes infer arrays from non-negative-integer or `-` next
    tokens, and a beyond-length index clamps to the array end (A3).
  - Slash-prefixed pointers containing `..` segments are diagnosed as
    invalid in every read position (A8).
  - `$ref` to an unregistered id yields a diagnostic naming the id instead
    of an unrelated type error (A7).
  - `unique` selection terminates: requesting more unique members than the
    array's distinct count is diagnosed (A9).
  - `$extend` resolves for mappings registered at evaluation time, exactly
    as at construction, including the unknown-ancestor error (A11).
  - Validation error objects carry only defined keys, keyed by the failing
    keyword and the descriptor's locate keyword.
- **Contract change:** resolving `$extend` now consumes it — the registered,
  flattened mapping no longer retains the keyword, so a flattened mapping
  stands alone and can be re-registered without its ancestors present. The
  `extend()` return shape changed accordingly.

### Fixed

- String transform steps apply correctly in array pipelines.

## [0.1.1]

Initial published release: the ~30-keyword vocabulary, ordered pairings,
extensions (initializers, transformers, async plugins), and the YAML
characterization suite.
