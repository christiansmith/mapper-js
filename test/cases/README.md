# Test case format

Each `.yaml` file in this directory is a suite of data-expressed test cases,
executed by `test/run.test.js` (`deno task test`). The format is designed to be
implementation-neutral so the same case data can eventually drive conformance
suites for other implementations.

## Suite shape

```yaml
suite: <name>            # display name
level: mapper            # default invocation level for the suite (optional)
tests:
  - description: <what this case shows>
    tier: core           # proposed conformance tier: core | extended | experimental
    level: map           # per-case override: mapper | map | get | extend
    mappings: {}         # optional named-mapping registry
    descriptor: <descriptor under test>
    id: <registered id>  # mapper level only: map by $id instead of descriptor
    input: <input document>
    expected:
      value: <expected>  # get level: deep equality over the JSON data model
      result: <expected> # map/mapper/extend level: deep equality
      errors: []         # exact error list, or an integer count
      valid: true        # mapper level envelope flag
      stdout: <ops>      # assertion ops over captured console output
    assert:              # pointer-wise assertions for partial/nondeterministic results
      /json/pointer: { <op>: <operand>, ... }
    throws: <substring>  # the invocation must throw an error containing this text
    deviation: <id>      # marks a characterization of known-deviation behavior
    only: true           # run only this case (debugging)
```

## Invocation levels

- `mapper` (default) — `new Mapper({ mappings }, options)` then
  `mapper.map(id ?? descriptor, input)`; asserts against the returned envelope
  (`{ ...target, valid, errors }`).
- `map` — the exported `map(descriptor, context)` with a fresh context;
  asserts against the returned target.
- `get` — `shift` + the exported `get(descriptor, context)`; asserts against
  the returned value.
- `extend` — the exported `extend(descriptor, { mappings })`; asserts against
  the merged descriptor.

Extension functions available to cases (initializers `uuid`, `date-time`,
`counterfactual`; transformers `trim`, `upcase`, `split`, `slice`, `last`,
`pluck`; plugins `echo`, `wrap`, `delayed`) are the deterministic set defined
in `test/extensions.js`.

## Equality and undefined

`value`/`result`/`errors` comparisons are deep equality over the JSON data
model: actual and expected are round-tripped through JSON first, so an
undefined-valued property and a missing property compare as equal. The string
sentinel `__undefined__` asserts that a value is `undefined` (YAML cannot
express undefined).

## Assertion ops

Usable under `assert:` (keyed by JSON Pointer into the actual value, `/` for
the whole value) and under `expected.stdout`:

- `equals` — deep equality (sentinel-aware)
- `defined` — `true`/`false`
- `type` — `array`, `null`, or a `typeof` result
- `length` — exact length
- `pattern` — regular expression over the stringified value
- `contains` — substring (strings) or deep membership (arrays)
- `oneOf` — value is deep-equal to one of the operand's items
- `subsetOf` — every item of the (array) value appears in the operand

## Deviations

Cases with a `deviation` key pin behavior of the reference implementation that
the specification may define differently (see the specification's "Known
Deviations of the Reference Implementation" appendix once published). These
cases always assert what the implementation actually does today; when a
deviation is fixed, the case is updated alongside the fix.
