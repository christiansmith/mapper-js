# Mapper quick reference

One page for daily use. Normative text: [`SPEC.md`](../SPEC.md). Section
numbers below point into it.

## How MAP works (§5.4)

A mapping is an **ordered** map of pairings `targetPointer ← descriptor`.
MAP walks them **sequentially, in document order** — order is semantics
(§3.2): later pairings can read what earlier ones wrote.

1. Normalize the document; wrap array inputs as `{ items }` (§5.3).
2. For each pairing, in order: resolve references → evaluate the descriptor
   through GET → if it's structural, nest with a **fresh target** (arrays fan
   out in parallel, one element per branch) → write the result at the target
   pointer (undefined never writes).
3. After each pairing: any accumulated error **short-circuits** the whole
   invocation (§5.8).

Full pseudocode: [`algorithm-map.svg`](figures/algorithm-map.svg).

## How GET works (§5.5)

Every descriptor evaluates through six fixed stages:

![GET pipeline](figures/pipeline-get.svg)

## Descriptor forms (§3.3)

| Form | Example | Meaning |
|---|---|---|
| Pointer string | `"/a/b"` | read from current source |
| Relative reference | `"../sibling"` | resolve against source path, read from root input (Extended) |
| Name string | `"mapping:Person"` | registry reference |
| Object | `{ "source": "/a", "as": "number" }` | keyword descriptor |
| Array | `["/a", "/b"]` | variants — first defined result wins |

## Keywords (§6)

| Keyword | Tier | Stage | In one line |
|---|---|---|---|
| `source` | Core | locate | read from current source; scopes descendants |
| `target` | Core | locate | read what earlier pairings wrote at this level |
| `input` | Core | locate | read from the root input |
| `output` | Core | locate | read from the root output |
| `mapping` | Core | structure | ordered pairings; nests with a fresh target |
| `each` | Core | structure | alias of `mapping`; parallel over array elements |
| `$id` | Core | registry | name a mapping |
| `$ref` | Core | registry | substitute a registered mapping |
| `$extend` | Core | registry | inherit pairings (ancestor-first; overrides in child position) |
| `description` | Core | inert | documentation only |
| `first` / `last` / `all` | Core | locate | evaluate a list; pick first/last/every defined result |
| `concat` | Core | shape | flatten an array one level |
| `switch` | Core | dispatch | select a case by a branch key from source/input/output scope |
| `find` | Core | shape | select an array member by `eq` equality; narrow by `pointer` |
| `init` | Core | shape | named initializer supplies/transforms the value |
| `constant` | Core | shape | replace the value unconditionally |
| `random` / `unique` | Experimental | shape | random member selection (nondeterministic) |
| `template` | Core | shape | map the value, substitute `{{param}}` placeholders |
| `transform` | Core | shape | ordered named-transformer steps |
| `type` `minimum` `maximum` `multipleOf` `minLength` `maxLength` `enum` `pattern` `required` | Core | validate | accumulate error objects; value passes through |
| `default` | Core | finalize | fill undefined (after validation) |
| `regexp_i` | Experimental | finalize | wrap as `/value/i` |
| `as` | Core | finalize | coerce: string \| number \| boolean \| json |
| *plugin keys* | Core | plugins | async; chain in document order; `pointer` narrows result |
| `stdout` | Experimental | after MAP | diagnostic print; never affects the result |

## The context (§5.2)

A **context** is the evaluator's working state. There is one per nesting
level, and it is just this record:

```yaml
input:   <the input>       # shared — the same object at every level
output:  <the output>      # shared — the top-level target
errors:  []                # shared — one accumulator per invocation
mappings/initializers/transformers/plugins:      # shared registries
source:  <where reads point>   # rebound when evaluation descends
target:  <where writes land>   # rebound — nested mappings get a fresh {}
paths:   { source: /, target: / }   # rebound — each scope's absolute position
```

`shift` makes a child context from a parent by one rule: **share everything,
rebind `source`/`target`/`paths`.** Watch it run on example 6.2-2 (`each`
over `/items` with input `{ items: [{n: 1}, {n: 2}] }`):

| level | `source` | `target` | `paths.source` |
|---|---|---|---|
| top | the input | the output | `/` |
| `/out` pairing | `[{n: 1}, {n: 2}]` | the output | `/items` |
| `each` element 0 | `{n: 1}` | fresh `{}` | `/items/0` |

Because `errors` and the roots are shared, a deep validation failure reaches
the envelope, and `output:` reads see everything written so far. The
`paths.source` column is what `../` references resolve against.

## Result and errors (§5.3, §5.8)

The invocation returns the output with two bookkeeping keys merged in:

```yaml
descriptor: { mapping: { /name: { source: /n, required: true } } }
input:      {}                        # /n is missing
returns:
  valid:  false
  errors:
    - { source: /n, required: true, message: required value }
```

Error objects are `{ source?, value?, <keyword>: operand, message }`. Any
error short-circuits: **no partial output**, `valid: false`, all accumulated
errors reported. Extensions reject values the same way — by appending to
`context.errors` (§7.5); a *throwing* plugin instead escapes as a host
exception, outside this model (§7.4).

## Extensions (§7)

Three host-function registries, passed at evaluator construction and shared
with every scope:

```
initializer(value, context)            → value          # sync — `init`
transformer(value, context, options?)  → value          # sync — `transform` steps
async plugin(options, value, context)  → value          # any descriptor key that names one
```

**Plugins are the only asynchronous stage** — all I/O enters here, and `each`
/variant fan-out is where plugin calls parallelize (§5.7). Multiple plugin
keys on one descriptor **chain in document order**, each replacing the value;
`pointer` in a plugin's options narrows its result.

What an extension can do with the shared context (§7.5): read any scope
(`source`/`target`/`input`/`output`); **append errors** (short-circuits like
validation); **call other registered extensions** (cache/throttle
composition); **recursively evaluate a sub-mapping** with a derived context —
the engine is re-entrant, so a plugin can map its own request body:

```yaml
descriptor:
  /params/id: /request/id             # pairings accumulate plugin parameters…
  /row: { output: /params, db: { pointer: /0 } }   # …the plugin reads them back
```

## Tiers (§2.2)

**Core** = required · **Extended** = optional, exact if present (relative
references) · **Experimental** = unstable (`regexp_i`, `random`/`unique`,
`stdout`). Deviations of the reference implementation: SPEC Appendix A.
Requirement↔test traceability: SPEC Appendix D.
