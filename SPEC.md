# Mapper Specification

**Declarative JSON-to-JSON transformation**

| | |
|---|---|
| **Status** | Draft 0.1 |
| **Reference implementation** | `@christiansmith/mapper-js` 0.1.1 (git `fa4de6f`) |
| **Test suite** | `test/cases/` (see [Appendix B](#appendix-b-test-suite-and-case-format-informative)) |

---

## 1. Introduction

### 1.1 Purpose and scope

This document specifies the behavior of the Mapper transformation algorithm: a
declarative system in which a **mapping document** — itself plain data — pairs
target locations with source descriptors, and an evaluator applies the
document to an input value to produce an output value.

The specification is a contract for implementation in any programming
language. It defines interfaces and observable behaviors, not implementation
technique; where the reference implementation's internal structure is
described, it is to fix semantics, and implementations MAY organize themselves
differently provided observable behavior is identical. Performance
characteristics are described only where they are consequences of required
semantics; optimization strategies are explicitly out of scope, though
opportunities are signposted where the semantics permit them.

The mapping language is deliberately data-shaped: mapping documents can be
stored, transmitted, generated, and queried like any other JSON/YAML data.
Combined with asynchronous **plugin** keywords (§7), mapping documents can
describe not just data reshaping but entire input→effect→output flows — a
style akin to flow-based programming in which the document wires value flows
through pure and effectful nodes. This usage is specified through the same
evaluation model as plain transformation.

### 1.2 Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in BCP 14 [RFC 2119] [RFC 8174]
when, and only when, they appear in all capitals.

Pseudocode in this document is normative. Typeset renderings of the same
algorithms are provided under `docs/figures/`.

**Requirement identifiers.** Individually testable normative requirements
carry bracketed identifiers — **[MAP-1]**, **[PTR-3]**, **[KW-as-1]**, … —
prefixed by the area that owns them (`DOC` documents, `REG` registry, `EXT`
extensions, `PTR` pointers, `CTX` context and invocation, `MAP`/`GET`
evaluation, `SEQ` concurrency, `ERR` errors, `KW` the keyword catalog in
general and `KW-<keyword>` keyword-specific). Identifiers are stable: they are never
renumbered or reused; a retired requirement's identifier stays reserved.
Each requirement is stated once, at its identifier; other sections refer to
it. Appendix D maps requirements to test cases and deviations.

**Deviation notes.** This specification defines *intended* behavior. Where the
reference implementation is known to behave differently, the text carries a
note — *Deviation An, see Appendix A* — and the actual behavior is pinned by
an executable characterization case in the test suite. Implementations MUST
follow the specification text, not the deviation, except where compatibility
with the reference implementation is explicitly required.

### 1.3 Status of this document

All sections (1–9) and appendices are complete in this draft, which covers
the full behavior of the reference implementation. Revision is expected as
deviations are resolved and open questions (Appendix C) are decided.

## 2. Conformance

### 2.1 Conformance targets

Two artifacts can conform to this specification:

- An **implementation**: an evaluator that applies mapping documents to
  inputs.
- A **mapping document**: a data structure meeting the grammar of §3.

An implementation conforms at a given **tier** (§2.2) when it implements every
requirement of that tier and every tier below it, as observable through the
test suite (§2.3).

### 2.2 Feature tiers

Keywords and behaviors are assigned one of three tiers:

| Tier | Meaning | Members |
|---|---|---|
| **Core** | REQUIRED for every conforming implementation. | All keywords and behaviors not listed below, including: reads (`source`, `target`, `input`, `output`, pointer strings), structure (`mapping`, `each`, descriptor variants), registry (`$id`, `$ref`, `$extend`), combinators (`first`, `last`, `all`, `concat`), dispatch (`switch`), selection (`find`), value pipeline (`init`, `constant`, `default`, `template`, `transform`, `as`), validation keywords, extension interfaces, the error model, and the evaluation order of §5. |
| **Extended** | OPTIONAL; if implemented, MUST behave as specified. | Relative source references (§4.4). |
| **Experimental** | OPTIONAL; semantics may change in future revisions; MUST NOT be relied on for interoperability. | `regexp_i`, `random`/`unique`, `stdout`. |

### 2.3 Test suite

The data-expressed test suite under `test/cases/` accompanies this
specification. Cases are tagged with `tier:` and exercise the reference
implementation. A `deviation:` tag marks a case as a **characterization
probe** — it pins a specific reference-implementation behavior for regression
purposes. Where that behavior differs from this specification the probe's tag
value names an Appendix A row (`F2`…`F14`), and a conforming implementation is
expected to *fail* the probe in its literal form and satisfy the
specification text instead; where the probe merely documents behavior the
specification also requires (e.g. `F1` key-order, `F6` random, `F8` stdout),
it has no Appendix A row and a conforming implementation passes it. All
non-probe cases are conformance cases for any implementation, subject to the
case format documented in `test/cases/README.md`.

## 3. Data model and terminology

### 3.1 Values

Mapper operates on the JSON data model: `null`, booleans, finite numbers,
strings, arrays, and maps ("objects"). In addition, evaluation distinguishes
the out-of-band state **undefined** — the result of reading an absent
location. Undefined is not a JSON value: writing undefined to a target
location MUST be a no-op (§4.3), and serialized outputs never contain it.

### 3.2 Ordered maps (portability requirement)

**[DOC-1]** Objects in mapping documents MUST be processed as **ordered
maps**: an implementation MUST preserve and honor the document order of keys.
This is load-bearing, not cosmetic:

- Pairings within a `mapping` evaluate sequentially in document order (§5.4),
  and later pairings can observe earlier writes through `target`/`output`
  reads — order is semantics.
- Plugin keywords on one descriptor chain in document order (§5.5).
- Transform steps are an ordered list; multi-key step objects apply their keys
  in document order.

Languages whose native maps are unordered (e.g. Go) MUST use an
order-preserving representation for descriptors. JSON and YAML parsers that
reorder or sort keys are unsuitable for mapping documents.

### 3.3 Mapping documents and descriptors

A **descriptor** describes how to produce a value. It takes one of five forms:

| Form                          | Example                              | Meaning                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pointer string**            | `"/a/b"`                             | Read from the current source (§4).                                                                                                                                                        |
| **Relative reference string** | `"../sibling"`                       | Extended tier: resolve against the current source path, read from the root input (§4.4).                                                                                                  |
| **Name string**               | `"mapping:Person"`                   | A registry reference: the named mapping is substituted (§3.5). A string that is none of the above is invalid — implementations SHOULD raise a diagnostic **[DOC-2]**. *Deviation A6, see Appendix A.* |
| **Object**                    | `{ "source": "/a", "as": "number" }` | Keyword descriptor: keywords configure reading, transformation, validation, and structure.                                                                                                |
| **Array**                     | `["/a", "/b", {"constant": 1}]`      | Variant list: each element is evaluated and one result is selected (§5.4).                                                                                                                |

A **mapping** is an ordered map from **target pointers** to descriptors. Each
entry is a **pairing** — written `target ← descriptor` in this document. A
descriptor that carries a `mapping` (or its alias `each`) keyword is a
**structural descriptor**: it builds an object or array rather than a single
value.

A **mapping document** is either a bare mapping, a descriptor object with
`$id`/`description`/`mapping`, or a compound document
`{ "mappings": { <id>: <descriptor>, … } }` registering several named
mappings.

### 3.4 Pairings

The left side of a pairing is a JSON Pointer into the **target** under
construction. The right side is any descriptor form. Evaluation of pairings is
specified in §5.4.

### 3.5 The registry

Named mappings live in a **registry** keyed by `$id`.

- `$id` — names a mapping for reference.
- `$ref` — substitutes the referenced mapping for the descriptor carrying it.
  **[REG-1]** A `$ref` to an unregistered id is an error; implementations
  SHOULD produce a diagnostic naming the missing id. *Deviation A7, see
  Appendix A.*
- `$extend` — single inheritance between named mappings, resolved when
  mappings are registered (not at evaluation time). **[REG-2]** The derived
  mapping's pairing map is the ancestor chain's pairings merged with the
  descendant's: ancestor-only pairings first in ancestor order, then every
  descendant pairing in descendant order — an overridden key evaluates in the
  **descendant's position**, not the ancestor's. Inheritance merges **only
  the pairing map**: any other descriptor keyword on ancestor or descendant
  (e.g. `source`, `each`) is discarded by the merge. **[REG-3]** `$extend`
  naming an unregistered id MUST raise an error. *Deviation A11, see
  Appendix A: the
  reference implementation resolves `$extend` only at evaluator
  construction — mappings registered at evaluation time (§5.3) are neither
  resolved nor checked for unknown ancestors.*

Registration order and re-registration: registering a mapping with an
existing `$id` replaces it. Note that the reference implementation's
evaluator API also registers mappings presented inline at evaluation time,
mutating the evaluator's registry as a side effect (§5.3); **[REG-4]**
implementations MUST reproduce the observable resolution behavior.

### 3.6 Extension points

An implementation accepts three named-function registries alongside the
mapping registry (full interface contract in §7):

- **initializers** — `fn(value, context) → value`, invoked by `init`.
- **transformers** — `fn(value, context, options?) → value`, invoked by
  `transform` steps.
- **plugins** — `async fn(options, value, context) → value`, invoked when a
  descriptor key matches a registered plugin name. Plugins are the asynchrony
  and effect boundary: fetches, queries, and other I/O enter mappings here.

Extension names share the descriptor keyword namespace; a plugin whose name
collides with a built-in keyword is unreachable. **[EXT-1]** Implementations
SHOULD warn on such registrations.

## 4. JSON Pointer profile

Mapper uses JSON Pointer [RFC 6901] for all location addressing, with the
extensions and clarifications in this section.

### 4.1 Syntax and read semantics

Pointers use RFC 6901 syntax, including `~0`/`~1` escaping. The empty pointer
and the pointer `/` both denote the whole document on read. In this profile
*any* pointer whose first token is empty (e.g. `//a`) also reads as the whole
document — empty-string keys are unreachable on read, a departure from
RFC 6901.

**[PTR-1]** Reading a location whose path does not exist MUST yield
undefined (§3.1) — never an error. This "recovering read" is what gives `first`/`last`/`all`,
`default`, and `required` their meaning.

### 4.2 URI fragment form

**[PTR-2]** A pointer beginning with `#` is interpreted as an RFC 6901 URI
fragment identifier: the remainder is percent-decoded and MUST then parse as
a JSON string pointer.

### 4.3 Write semantics

Writing `value` to `target` at a pointer:

- **[PTR-3]** Writing undefined MUST be a no-op (the location is left
  untouched; no intermediate containers are created).
- **[PTR-4]** Missing intermediate containers are created ("recovering
  write"). The container kind is inferred from the *next* token: a token that
  is a non-negative integer creates an array; any other token creates an
  object.
  *Deviation A3, see Appendix A: the reference implementation creates an
  object for token `"0"` and arrays only for tokens whose integer value is
  non-zero.*
- **[PTR-5]** The final token `-` on an array appends.
- A non-negative-integer final token on an array **inserts** at that index
  (splice semantics), shifting subsequent elements. **[PTR-6]** Writing a
  non-integer final token on an array location is invalid; implementations
  SHOULD raise a diagnostic. *Deviation A3: the reference implementation
  coerces such tokens to index 0 and inserts.*
- On objects, the final token sets the property, replacing any existing value.
- Writing **through** an existing non-container value: the reference
  implementation silently replaces falsy intermediates (`0`, `""`, `false`,
  `null`) with a fresh container, and raises a host error on truthy
  primitives. **[PTR-7]** Implementations SHOULD diagnose both instead of
  relying on either behavior. *Cases: `13-audit-probes`.*

### 4.4 Relative source references (Extended)

**[PTR-8]** A descriptor string that does **not** begin with `/` and
contains the substring `../` is a **relative reference** (a string merely
*ending* in `..` does not qualify and falls to the name-string rule of §3.3). It is resolved by path arithmetic against
the evaluation context's current *source path* (§5.2): segments are appended,
`.` and empty segments are dropped, and `..` pops one segment. The resolved
absolute pointer is then read **from the root input** (not from the current
source value).

**[PTR-9]** A pointer string beginning with `/` MUST NOT contain `..`
segments; such strings are invalid and implementations SHOULD raise a
diagnostic.
*Deviation A8, see Appendix A: the reference implementation reads them as
literal token sequences (`".."` as a key), which yields undefined in
practice.*

## 5. Evaluation model

### 5.1 Overview

Evaluation is a **target-wise recursive descent**: the evaluator walks the
mapping document (not the input), and for each pairing produces a value from
the source side and writes it into the target side. Descent happens through
structural descriptors (`mapping`/`each`), which open a nested scope with a
fresh target; ascent merges nothing — each nested target is written into its
parent by the pairing that created it.

Two functions define the model:

Typeset figures: [`algorithm-map.svg`](docs/figures/algorithm-map.svg),
[`algorithm-get.svg`](docs/figures/algorithm-get.svg) with its keyword-to-stage
companion [`pipeline-get.svg`](docs/figures/pipeline-get.svg), and
[`algorithm-shift.svg`](docs/figures/algorithm-shift.svg) for context
derivation (§5.2).

- **MAP** (§5.4) applies a structural descriptor: it iterates pairings and
  dispatches on the shape of each right-hand descriptor and value.
- **GET** (§5.5) evaluates a single descriptor to a value through a fixed
  pipeline: *locate → dispatch → plugins → shape → validate → finalize*.

### 5.2 The context

Evaluation threads a **context** — the complete evaluation state. Fields fall
in two classes:

| Field                                                 | Class   | Meaning                                                                                                                                                                                               |
| ----------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input`                                               | shared  | The root input value. Never rebound.                                                                                                                                                                  |
| `output`                                              | shared  | The root target. Never rebound; identical to the top-level `target`.                                                                                                                                  |
| `errors`                                              | shared  | The mutable validation-error accumulator (§5.8). One array per top-level invocation.                                                                                                                  |
| `mappings`, `initializers`, `transformers`, `plugins` | shared  | The four registries (§3.5, §3.6).                                                                                                                                                                     |
| `source`                                              | rebound | The current read scope. Rebound on descent by `source` keywords, `each` elements, `switch`/`find` selections, and nested mappings.                                                                    |
| `target`                                              | rebound | The current write scope. Rebound to a fresh empty object on nested-mapping descent.                                                                                                                   |
| `paths.source`, `paths.target`                        | rebound | Absolute pointer strings tracking the current scopes' positions from the roots. `paths.source` is the base for relative references (§4.4); an `each` element contributes its index as a path segment. |

Deriving a child context from a parent ("shifting") resolves, in order:
explicit overrides (e.g. a new source value for an `each` element), then the
parent's bindings, then the roots. **[CTX-1]** Overrides apply for **any
defined value**, including falsy ones. *Deviation A12, see Appendix A: the
reference
implementation's resolution is truthiness-gated — a falsy override (`0`,
`""`, `false`, `null`) silently falls back to the parent binding, so e.g. an
`each` element whose value is `0` is evaluated against the parent scope
instead of the element.* **[CTX-2]** Shared fields are propagated **by
reference**: writes to `errors` and registry mutations are visible to every
scope of the invocation.

The context is internal state; only `input`, the produced output, `valid`,
and `errors` are part of an implementation's public result contract (§5.3).

### 5.3 Top-level invocation and the result envelope

An evaluator invocation `map(document, input)` proceeds:

1. **Document normalization.**
   - A compound document (`mappings` key) registers each contained mapping;
     the *last* one (in document order) is the entry mapping.
   - A bare mapping (object without `mapping`) is wrapped as
     `{ mapping: <document> }`.
   - A string is resolved through the registry.
2. **Array-input wrapping.** If the input is an array, it is wrapped as
   `{ "items": <input> }` and the entry mapping is rewrapped as
   `{ "mapping": { "/items": { "source": "/items", "each": <entry> } } }`,
   so the result carries the mapped array at `items`.
3. **Context creation.** A fresh context with empty output and errors.
4. **Evaluation.** MAP (§5.4) is applied. If it short-circuits (§5.8) the
   partial output is discarded.
5. **Envelope.** The result is
   `{ ...output, valid: errors.length === 0, errors }`.

The envelope merges bookkeeping keys into the output's own key space; a
mapping that writes top-level keys named `valid` or `errors` collides with
them. **[CTX-3]** Mapping documents SHOULD NOT write those keys at the top
level; a future revision may separate the envelope.

The reference implementation's invocation additionally accepts a third
argument merged into the fresh context (able to override scopes and
registries); it is **not part of this contract** and **[CTX-4]** portable
callers MUST NOT rely on it.

Step 1's registration into a live evaluator is observable state (§3.5): a
subsequent invocation can `$ref` mappings registered by an earlier one.

### 5.4 MAP — applying a structural descriptor

```text
MAP(descriptor, context):
  descriptor ← DEREF(descriptor, context)                     # §5.6
  context    ← SHIFT(descriptor, context)                     # §5.2
  scope      ← GET(descriptor, context)                       # evaluate this level's source scope
  for each (left ← right) in context.pairings, in order:      # sequential; order is semantics
    rightDesc ← DEREF(right, context)
    rightCtx  ← SHIFT(rightDesc, context, source := scope)
    if rightDesc has pairings or switch:                      # structural / dispatching right side
      value ← GET(rightDesc, rightCtx)
      case value of:
        string | number        → SET(left, target, value)
        non-empty array        → SET(left, target,
                                     parallel for (item, i) in value:
                                       NEST(rightDesc, rightCtx, source := item, index := i))
        object                 → SET(left, target, NEST(rightDesc, rightCtx, source := value))
        boolean | null         → SET(left, target, value)     # Deviation A1: ref. impl. drops these
        undefined              → (nothing)
      # empty arrays: SET(left, target, [])                   # Deviation A2: ref. impl. nests → {}
    else if rightDesc is an array:                            # variant list
      results ← parallel READ each variant in rightCtx
      SET(left, target, first defined result)                 # Deviation A5: ref. impl. takes first truthy
    else:
      SET(left, target, GET(rightDesc, rightCtx))             # undefined never writes (§4.3)
    if context.errors is non-empty: return NULL               # short-circuit (§5.8)
  return context.target
```

Requirements:

- **[MAP-1]** Pairings MUST evaluate sequentially in document order; element
  fan-out under `each` and variant-list evaluation MAY proceed concurrently
  (§5.7).
- **[MAP-2]** The value dispatch MUST write every defined value; booleans and
  `null` are values. *Deviation A1.*
- **[MAP-3]** An empty array MUST map to an empty array. *Deviation A2.*
- **[MAP-4]** Variant lists MUST select the first **defined** result in list
  order. *Deviation A5: the reference implementation selects the first truthy
  result, skipping defined-but-falsy values such as `0`, `""`, and `false`.*

`each` is an exact alias of `mapping`; if both appear, `mapping` wins. The
alias exists for readability: `each` signals element-wise application to an
array-valued scope.

### 5.5 GET — the value pipeline

GET evaluates one descriptor to one value through a **fixed, normative
pipeline**. Stages act only when their keyword is present (except locate);
each stage receives the previous stage's value.

```text
GET(descriptor, context):
  # 1. locate
  value ← case descriptor of:
    string starting with "/"        → pointer read from context.source
    string containing "../"         → relative read from context.input (§4.4)
    object with source              → pointer read from context.source
    object with target              → pointer read from context.target
    object with input               → pointer read from context.input
    object with output              → pointer read from context.output
    object with first: [d…]         → parallel READ all; first defined
    object with last:  [d…]         → parallel READ all; last defined
    object with all:   [d…]         → parallel READ all; defined results, in order
    otherwise                       → context.source            # scope pass-through

  # 2. dispatch
  if switch: scope  ← case of: switch.source → value            # Deviation A10
                              switch.input  → context.input
                              switch.output → context.output
             branch ← pointer read from scope
             value  ← READ(cases[branch] ?? cases.default, context, source := value)
                       (undefined when branch matches nothing)

  # 3. plugins — for each descriptor key registered as a plugin, in document order:
  value ← await plugin(descriptor[key], value, context)
  if descriptor[key].pointer: value ← pointer read from value

  # 4. shape
  find      → select first member of value (wrapped as list if not an array)
              whose properties equal every find.eq entry; narrow by find.pointer
  concat    → flatten one level (array values)
  init      → value ← initializers[init](value, context)
  constant  → value ← constant                                  # unconditional
  random    → Experimental: select random member(s) (unique: distinct)
  template  → map value with descriptor.mapping, then substitute {{param}}
  transform → apply named transformer steps in order (string or step-object list)

  # 5. validate — in order, each appends errors, value passes through:
  type, maximum, minimum, multipleOf, minLength, maxLength, enum, pattern, required

  # 6. finalize
  default   → value ← default, if value is undefined
  regexp_i  → Experimental: value ← "/" + value + "/i"
  as        → coerce: string | number | boolean | json
  return value
```

Requirements and notes:

- **[GET-1]** The stage order above is observable behavior and MUST be
  preserved. Consequences implementations must reproduce: `constant`
  overrides plugin and `init` results; validation sees the *transformed*
  value; `default` applies **after** validation (an absent value with a
  `default` still fails `required`); `as` coerces last.
- **[GET-2]** The `switch` keywords name the **scope the branch key is read
  from** — they are not aliases: `switch.source` reads the branch key from
  the value being switched on; `switch.input` reads it from the root input;
  `switch.output` reads it from the root output. This allows a document to switch on context
  the switched value does not itself carry. When more than one is present,
  `source` takes precedence, then `input`, then `output`. Whichever scope
  selects the branch, the chosen case always evaluates the *switched value*.
  *Deviation A10: the reference implementation reads the branch key from the
  switched value regardless of which keyword supplies the pointer.*
- When the selected case has no `mapping`, the case descriptor is evaluated
  against the *enclosing* context (the value override applies only to
  mapping-bearing cases). A falsy branch key leaves the value unswitched.
- Plugin daisy-chaining: every descriptor key matching a registered plugin
  fires, in document order, each replacing the value — this is the wiring
  mechanism of flow-style documents.
- **[GET-3]** Validators MUST treat undefined uniformly: absent values are
  validated only by `required`, and validators check only values of their own
  type.
  *Deviation A4 (validator and coercion edge cases): in the reference
  implementation `minLength`/`maxLength` throw on undefined and also
  length-check arrays; `minimum: 0`/`maximum: 0` are ignored (falsy keyword
  guard); `multipleOf` fires on undefined and non-numeric values, and its
  decimal handling produces false errors (e.g. `0.3` vs `multipleOf: 0.1`);
  `type: integer` accepts anything numerically coercible (`"5"`, `true`,
  `null`).* **[GET-4]** `as` on undefined MUST yield undefined. *Deviation
  A4: `as: string` throws, `as: number` yields NaN, `as: boolean` yields
  `false`.*
- Unknown `init`/`transform` names are skipped silently in the reference
  implementation; **[GET-5]** implementations SHOULD offer a diagnostic mode.

### 5.6 READ, NEST, and DEREF

- **DEREF(d)** — resolves references: a string that names a registered
  mapping resolves to it; `{$ref: id}` resolves to the registered mapping
  (§3.5); everything else passes through. Note the string fallback: an
  unregistered name string passes through as a literal and eventually
  evaluates as scope pass-through. *Deviation A6.*
- **READ(d, ctx, overrides)** — evaluates any descriptor form: if the
  (dereferenced) descriptor is structural, it MAPs it in a shifted context
  with a fresh target and the given overrides; otherwise it GETs it. In the
  reference implementation the overrides (e.g. a source value) are applied
  **only** on the structural path; plain descriptors evaluate in the caller's
  context (see §5.5 switch note).
- **NEST(d, ctx, overrides)** — applies the descriptor's `mapping`/`each` to
  a new scope: fresh empty target, source from overrides (an `each` element
  contributes its index to `paths.source`). If the descriptor has no mapping,
  NEST returns the override source unchanged (pass-through).

### 5.7 Sequencing and concurrency

The unit of sequencing is the pairing: within one mapping level, pairings
form a strict sequential chain (each may read the accumulated target/output).
All fan-out *within* one pairing is unordered and MAY be concurrent:

- element mappings under `each` (results reassembled in element order),
- variant-list evaluation (selection is by list order regardless of
  completion order),
- the descriptor lists of `first`/`last`/`all` (ditto).

Because plugins are asynchronous, this concurrency is where I/O parallelism
arises: an `each` over n items issuing one fetch per item runs its fetches
concurrently. **[SEQ-1]** Implementations MUST NOT let concurrent branches
observe each other's partial writes; each branch writes only its own fresh
target. **[SEQ-2]** Implementations MAY additionally parallelize independent
pairings only if no descriptor in the level reads `target`/`output` — a
static analysis this specification permits but does not require (optimization
signpost).

### 5.8 Errors

**[ERR-1]** Validation keywords append **error objects** to the shared
`errors` accumulator and never interrupt the pipeline mid-descriptor. Error
objects carry the failing keyword, the offending value, the descriptor's read
keyword(s) for provenance, and a human-readable `message` (exact shapes in
§6, pinned by the validation cases in the test suite).

**[ERR-2]** After each pairing, MAP checks the accumulator: if non-empty, the
current MAP returns NULL immediately (short-circuit), abandoning the rest of
the level and propagating outward — enclosing levels observe the shared
accumulator and short-circuit in turn. The envelope (§5.3) then reports
`valid: false` with all accumulated errors and no partial output.

Errors raised by extensions (thrown/rejected) are not part of this error
model: they propagate to the caller as exceptions. A future revision may
define structured extension-error capture.

## 6. Keywords

One section per keyword. Each entry states the keyword's **tier** (§2.2), the
**stage** at which it acts (§5.4 MAP, §5.5 GET, or registration §3.5/§5.3),
its **value grammar**, and its behavior. *Cases* names the suite file(s) in
`test/cases/` exercising the keyword. Keywords not listed here are not part of
this specification; **[KW-1]** implementations MUST NOT assign behavior to
unknown descriptor keys other than registered plugin names (§6.8).

### 6.1 Reading

#### `source`
**Core · GET locate · value: JSON Pointer string.**
Reads from the current source scope (§5.2). On a structural descriptor,
`source` additionally rebinds the source scope and extends the source *path*
for descendants (§5.6 SHIFT) — reading and scoping are the same keyword.
An absent location reads as undefined. *Cases: `01-source-reads`.*

Note the asymmetry with `target` below: `source` is the only keyword that
rebinds a scope on structural descent. Nested mappings always write into a
fresh target placed at their pairing's left pointer; a structural
descriptor's `target` keyword affects only what its pairings *read*.

#### `target`
**Core · GET locate · value: JSON Pointer string.**
Reads from the current target scope — the object under construction at this
nesting level. Because pairings evaluate in document order (§3.2), a `target`
read observes only writes made by earlier pairings. On a structural
descriptor, `target` selects the *read* scope for its pairings; it does
**not** rebind where they write — nested mappings always write into the fresh
target created for their pairing (an internal target path is tracked but
never consumed). *Cases: `01-source-reads`.*

#### `input`
**Core · GET locate · value: JSON Pointer string.**
Reads from the root input, regardless of the current scope. *Cases:
`01-source-reads`.*

#### `output`
**Core · GET locate · value: JSON Pointer string.**
Reads from the root output (the top-level target), regardless of the current
scope. With `output: /` the whole output-so-far becomes the value — the
common way to post-process accumulated results. *Cases: `01-source-reads`.*

String-form descriptors (pointer strings, relative references, registry
names) are specified in §3.3 and §4; they are equivalent to the corresponding
keyword forms.

### 6.2 Structure

#### `mapping`
**Core · MAP · value: ordered map of pairings, or a registry reference.**
Declares the pairings this descriptor builds (§5.4). As a nested keyword it
opens a child scope with a fresh target; the produced object is the pairing's
value. The value may be `{ "$ref": id }` or (equivalently) a registry
reference resolved at evaluation time. *Cases: `05-mapping-core`,
`06-references`.*

#### `each`
**Core · MAP · value: as `mapping`.**
Exact alias of `mapping`; when both are present, `mapping` takes precedence.
Idiomatically used when the scope value is an array: each element is mapped
in parallel with the element as source and its index appended to the source
path (§5.4, §5.7). *Cases: `05-mapping-core`, `06-references`,
`08-extensions`.*

### 6.3 Registry

#### `$id`
**Core · registration · value: string.**
Names a mapping in the registry (§3.5). Re-registration replaces.

#### `$ref`
**Core · evaluation-time resolution · value: string.**
Substitutes the registered mapping for the descriptor carrying it. Unknown
ids are diagnostics. *Deviation A7.* *Cases: `06-references`,
`09-probes-deviations` (F11).*

#### `$extend`
**Core · registration · value: string.**
Single inheritance, resolved transitively when mappings are registered:
ancestor-only pairings first in ancestor order, then all descendant pairings
in descendant order (overridden keys evaluate in the descendant's position —
observable through `target`/`output` reads). Only the pairing map is merged;
other descriptor keywords are discarded (§3.5). Unknown ids MUST raise an
error at registration. *Deviation A11.* *Cases: `06-references`,
`10-catalog-gaps`, `13-audit-probes`.*

#### `description`
**Core · inert · value: string.**
Documentation; carried through inheritance merges; no runtime effect.

### 6.4 Combinators

#### `first`, `last`, `all`
**Core · GET locate · value: array of descriptors.**
Evaluate every listed descriptor (concurrently permitted, §5.7) and select:
`first` — the first defined result in list order; `last` — the last defined
result; `all` — every defined result, in list order. Contrast with variant
arrays (§5.4), whose selection is currently truthiness-based in the reference
implementation (*Deviation A5*). *Cases: `02-combinators`,
`09-probes-deviations` (F10).*

#### `concat`
**Core · GET shape · value: `true`.**
When the pipeline value is an array, flattens it one level (an array of
arrays becomes one array). Non-array values pass through unchanged. Usually
paired with `all`. *Cases: `02-combinators`, `10-catalog-gaps`.*

### 6.5 Dispatch and selection

#### `switch`
**Core · GET dispatch · value: `{ source | input | output: pointer, cases: map }`.**
Selects a case descriptor by reading a **branch key**: `switch.source` reads
it from the pipeline value; `switch.input` from the root input;
`switch.output` from the root output (precedence `source` > `input` >
`output`). *Deviation A10 — see also the note in Appendix A.* The matched
case (or `cases.default`; a `cases` map with only `default` is a valid
"always" form) is evaluated with the *pipeline value* as its source when it
carries a `mapping`; a plain-pointer case evaluates against the enclosing
context (open question, Appendix C). No matching case and no `default`
yields undefined; a falsy branch key leaves the value unswitched. *Cases:
`07-switch`, `09-probes-deviations` (F12), `10-catalog-gaps`.*

#### `find`
**Core · GET shape · value: `{ eq: map, pointer?: pointer }`.**
Selects the first member of the pipeline value (a non-array **object** is
treated as a one-member list; non-object values — including `null` — skip
`find` and pass through unchanged) whose properties strictly equal every `eq`
entry (shallow comparison). `pointer` then narrows the selected member. No
match yields undefined. *Cases: `02-combinators`, `10-catalog-gaps`.*

### 6.6 Value pipeline

#### `init`
**Core · GET shape · value: string (initializer name).**
Applies the named initializer `fn(value, context)` (§3.6). Unknown names are
skipped silently in the reference implementation; a diagnostic mode is
RECOMMENDED. *Cases: `08-extensions`, `10-catalog-gaps`.*

#### `constant`
**Core · GET shape · value: any JSON value.**
Replaces the pipeline value unconditionally (unlike `default`). Anything the
locate stage read is discarded. *Cases: `03-finalize`.*

#### `random`, `unique`
**Experimental · GET shape · value: positive integer / `true`.**
Selects `random` members of an array value at random (`random: 1` yields the
member itself, larger counts an array). **[KW-random-1]** `unique` requires
distinct members and MUST terminate (*Deviation A9*). Nondeterministic by design — conformance
cases use shape assertions. *Cases: `09-probes-deviations` (F6).*

#### `template`
**Core · GET shape · value: string with `{{param}}` placeholders (requires `mapping`).**
When the pipeline value is an object, applies the descriptor's `mapping` to
it and substitutes each `{{param}}` with the mapped result's top-level
`param` property; placeholders whose mapped value is **falsy** (absent, `0`,
`""`, `false`, `null`) render as the empty string. Non-object values pass
through unchanged — but note `null` counts as an object here and triggers the
template (evaluating against the parent scope via Deviation A12). *Cases:
`08-extensions`, `10-catalog-gaps`, `13-audit-probes`.*

#### `transform`
**Core · GET shape · value: transformer name, or ordered array of steps.**
Applies named transformers (§3.6) in order. A string step invokes
`fn(value, context)`; an object step invokes each of its keys' transformers
(document order) as `fn(value, context, step)` — the step object itself is
the options argument. Unknown names are skipped silently in the reference
implementation; a diagnostic mode is RECOMMENDED. *Cases: `08-extensions`.*

#### `default`
**Core · GET finalize · value: any JSON value.**
Replaces the value only when it is undefined, **after** validation — an
absent-but-defaulted value still fails `required`. *Cases: `03-finalize`.*

#### `regexp_i`
**Experimental · GET finalize · value: `true`.**
Wraps the value as the string `/value/i` (a case-insensitive regular
expression literal for downstream query languages). *Cases: `03-finalize`.*

#### `as`
**Core · GET finalize · value: `"string" | "number" | "boolean" | "json"`.**
Coerces the final value: string conversion, numeric conversion, boolean
conversion, or JSON serialization. Applied to undefined it MUST yield
undefined (*Deviation A4*). **[KW-as-1]** A numeric coercion that does not
produce a finite number (e.g. `as: number` of a non-numeric string) is a
diagnostic; implementations MUST NOT emit non-JSON numbers (*the reference
implementation
produces NaN, which serializes as `null` — Deviation A4*). *Cases:
`03-finalize`, `09-probes-deviations` (F5), `10-catalog-gaps`.*

### 6.7 Validation

All validation keywords act at the GET validate stage (§5.5): each appends an
**error object** to the shared accumulator and passes the value through
unchanged. Except for `required`, validators MUST skip undefined values
(*Deviation A4*). The error object carries the failing keyword and operand,
the offending `value`, provenance (the descriptor's read keyword, e.g.
`source`), and a human-readable `message`:

```json
{ "source": "/a", "value": 3, "maximum": 2 the area that owns them (￼￼DOC￼￼ documents, , "message": "cannot be greater than 2" }
```

Exact shapes per keyword are pinned by `04-validation`.

| Keyword | Value | Constraint checked |
|---|---|---|
| `type` | `"array" \| "boolean" \| "integer" \| "null" \| "number" \| "object" \| "string"` | the value's JSON type; `integer` accepts integral numbers (*A4: ref. impl. accepts anything numerically coercible*) |
| `minimum` / `maximum` | number | numeric lower/upper bound (inclusive); zero-valued bounds are honored (*Deviation A4*) |
| `multipleOf` | number | divisibility of numeric values (*A4: ref. impl. fires on undefined/non-numbers and false-errors on decimal operands*) |
| `minLength` / `maxLength` | non-negative integer | string length bounds (*A4: ref. impl. throws on undefined and length-checks arrays*) |
| `enum` | array | membership (strict equality) |
| `pattern` | regular-expression string | match anywhere in a string value; non-strings skipped |
| `required` | boolean | when `true`, an undefined value is an error (checked before `default`) |

### 6.8 Plugins

#### *plugin keys*
**Core · GET plugins · value: options object (plugin-defined).**
Any descriptor key matching a registered plugin name invokes
`await plugin(options, value, context)`, replacing the pipeline value. All
matching keys fire, in document order — plugins chain (§3.2, §5.5). This is
the asynchrony and effect boundary (§3.6) and the wiring mechanism of
flow-style documents. *Cases: `08-extensions`, `09-probes-deviations` (F1).*

#### `pointer` (within a plugin's options)
**Core · GET plugins · value: JSON Pointer string.**
When present in a plugin's options object, the plugin's result is narrowed by
this pointer before the pipeline continues. *Cases: `08-extensions`.*

### 6.9 Diagnostics

#### `stdout`
**Experimental · MAP, after pairings · value: `true` or JSON Pointer string.**
Writes the completed target (or the value at the pointer, JSON-serialized) to
the implementation's diagnostic output channel. **[KW-stdout-1]** It MUST NOT
affect the result.
*Cases: `09-probes-deviations` (F8).*

## 7. Extension interfaces

Extensions are host-language functions registered with the evaluator (§3.6).
They are how mapping documents reach beyond pure reshaping: generated values,
custom transformations, and effectful operations (I/O) all enter through
these three interfaces. Test cases exercise them through the deterministic
set in `test/extensions.js`.

### 7.1 Registration

An evaluator accepts three named-function registries at construction:
`initializers`, `transformers`, and `plugins`. Registries are part of the
shared context (§5.2): every scope of an invocation sees the same functions.
Plugin names share the descriptor keyword namespace — a plugin named like a
built-in keyword is unreachable, and implementations SHOULD warn at
registration (§3.6). Initializer and transformer names inhabit their own
value namespaces (`init:` and `transform:` operands) and cannot collide with
keywords.

### 7.2 Initializers

```
initializer(value, context) → value
```

Invoked by the `init` keyword at the shape stage (§6.6). Receives the current
pipeline value — often undefined, since a common idiom is generating a value
for a target location with no source (identifiers, timestamps) — and the full
context (§7.5). The return value replaces the pipeline value.

**[EXT-2]** Initializers MUST be synchronous. The reference implementation
does not await
them: an asynchronous initializer's promise flows through the `constant` and
`random` stages, which then misbehave — `random`, for example, silently
passes the promise through instead of selecting — before the template stage's
internal await incidentally resolves it, so `transform`, validation, and
finalize see the resolved value. **[EXT-3]** Portable documents MUST NOT
rely on that artifact. *Cases: `11-extension-interfaces`.*

### 7.3 Transformers

```
transformer(value, context, options?) → value
```

Invoked by `transform` steps in order (§6.6). A string step passes no
options; an object step passes **the step object itself** as `options` — the
transformer reads its parameters from its own name's key (e.g. a step
`{ "split": ", " }` invokes `split` with `options.split === ", "`).
**[EXT-6]** Transformers MUST be synchronous, for the same reason as
initializers.
*Cases: `08-extensions`.*

### 7.4 Plugins

```
async plugin(options, value, context) → value
```

Invoked at the plugins stage (§5.5, §6.8) for every descriptor key matching a
registered plugin name, in document order; each replaces the pipeline value,
and `options.pointer` narrows the result. `options` is the descriptor entry's
value — the plugin's configuration authored in the mapping document. Note the
role reversal relative to transformers: the pipeline *value* frequently acts
as the plugin's runtime **parameters** (identifiers to fetch, variables to
substitute) while `options` carries the static shape of the operation
(endpoints, methods, templates).

Plugins are the asynchrony boundary: they are awaited, and concurrent
fan-out (§5.7) is where plugin I/O parallelizes. A plugin that throws (or
rejects) propagates to the caller as a host exception — it does **not**
participate in the validation error model (§5.8); structured capture is
future work (Appendix C). *Cases: `08-extensions`, `11-extension-interfaces`.*

### 7.5 Context capabilities

Extensions receive the evaluation context (§5.2) and MAY:

- **read any scope** — `source`, `target`, `input`, `output`, and `paths`;
- **append error objects** to `context.errors`; appended errors participate
  in short-circuiting and the envelope exactly like validation errors —
  this is the supported way for an extension to reject a document or value;
- **invoke other registered extensions** through the context's registries —
  plugin composition (a fetch plugin consulting cache and throttle plugins,
  for example) is an intended pattern;
- **recursively invoke evaluation** on a sub-descriptor with a derived
  context (e.g. mapping a request body before sending it). **[EXT-4]**
  Implementations MUST be re-entrant: a nested evaluation started by an
  extension follows this specification with its own scopes while sharing the
  invocation's roots, registries, and error accumulator.

**[EXT-5]** Extensions MUST NOT rebind the context's shared fields and SHOULD
treat the input as immutable. Nothing in this section grants extensions influence over
pairing order or pipeline stage order — those remain fixed (§3.2, §5.5).

### 7.6 Determinism and portability

The extension names a document uses are part of that document's contract: a
document is only portable to deployments providing compatible functions under
the same names. Deployments SHOULD document their extension set (a
declaration mechanism in the document itself is future work — Appendix C).
**[EXT-7]** Conformance test cases MUST use deterministic extensions;
**[EXT-8]** effectful plugins SHOULD be idempotent per evaluation so retries
and concurrent fan-out (§5.7) are safe.

## 8. Algorithmic characteristics

This section characterizes required cost and shape consequences of the
semantics in §5. Everything here follows from observable behavior;
implementations MAY do better wherever the semantics permit (signposts
below).

### 8.1 Cost model

Let **|D|** be the number of pairings in the (inheritance-resolved) document,
**depth(p)** the token length of a pointer, and **fan-out** the element count
wherever `each`, variant lists, or `first`/`last`/`all` multiply work.

- **Evaluation units.** The work of an invocation is the number of
  (descriptor, scope) evaluations: every pairing evaluates once per scope it
  is applied to, so an `each` over *n* elements evaluates its nested pairings
  *n* times. Total time is
  **O(Σ evaluations × per-evaluation cost)** — linear in document size and in
  the portions of the input actually addressed, with nesting multiplying by
  fan-out at each level. The evaluator never scans unaddressed input: cost is
  driven by the *document*, not the input's total size (target-wise descent,
  §5.1).
- **Per-evaluation cost.** A pointer read/write is O(depth). An array
  splice-insert is O(array length) (§4.3). Validators are O(1) except `enum`
  (O(members)), `pattern` (regular-expression cost over the string), and type
  checks on aggregates (O(1) — type inspection only, no traversal). `find` is
  O(members × eq-entries). `concat` is O(elements). `template` adds one
  nested evaluation plus O(template length).
- **Registry operations.** `$extend` resolution is performed at registration
  (§3.5; Deviation A11 for evaluation-time registration): evaluation-time
  `deref` is a single map lookup.
- **Short-circuiting** (§5.8) bounds wasted work after the first error to the
  remainder of the pairing in flight; concurrent fan-out branches already
  started MAY run to completion (their writes land in discarded targets).

### 8.2 Space and data-structure evolution

An invocation holds: the input (never copied — reads alias it), the output
under construction, one **context per active nesting level** (each O(1):
bindings and two path strings — shared fields are references, §5.2), and the
error accumulator. Peak context count equals the nesting depth of the
document times the concurrent fan-out width. Nested targets are built as
fresh objects and connected to their parents by a single write — there is no
merge step, so no intermediate copies (§5.1).

The evolution of the two mutable structures — target accretion (pairing by
pairing, in document order) and context derivation (rebind `source`/`target`/
`paths`, share the rest) — is illustrated in
[`context-evolution.svg`](docs/figures/context-evolution.svg).

### 8.3 Concurrency width

Sequencing is fixed by §5.7: pairings are strictly sequential; fan-out within
a pairing is unordered. The maximum concurrency width at any moment is the
product of the fan-out sizes along one descent path (an `each` of *n*
elements whose element mapping issues an `all` of *k* plugin calls may have
*n × k* operations in flight). Since plugins are the only asynchronous
stage, effective parallelism is plugin parallelism — pure documents gain
nothing from concurrency, and implementations MAY evaluate them entirely
synchronously.

### 8.4 Optimization signposts

Permitted by the semantics, required by nothing:

- **Document compilation.** Parse pointers, resolve inheritance and
  references, and fix pairing plans once per document, then apply the
  compiled plan to many inputs — the natural server-mode optimization.
- **Independent-pairing parallelism.** Pairings that provably never read
  `target`/`output` (statically visible in the document) may run
  concurrently (§5.7).
- **Iterative traversal.** The recursive descent of §5 can be driven by an
  explicit work stack; nothing observable depends on host-stack recursion.
- **Structural sharing.** Values passed through unchanged may alias the
  input; only written targets need be fresh.

## 9. Worked examples

Both examples are executable: they appear verbatim as cases in
`test/cases/12-worked-examples.yaml`, evaluated against the reference
implementation with the deterministic extensions of `test/extensions.js`.

### 9.1 Reshaping: bibliographic record → citation

A pure transformation exercising nested targets, `each`, `find`, combinators,
validation, and finalization.

**Document:**

```yaml
mapping:
  /citation/title: /title
  /citation/doi:
    source: /ids
    find:
      eq: { idType: doi }
      pointer: /value
    required: true
  /citation/year: { first: ['/issued/year', '/created/year'], as: number }
  /citation/authors:
    source: /contributors
    each:
      /family: /surname
      /given: { source: /forename, default: '' }
  /citation/source: { constant: 'import' }
```

**Input:**

```yaml
title: On Mapping
ids:
  - { idType: issn, value: '2049-3630' }
  - { idType: doi, value: '10.1000/xyz123' }
issued: { year: '2024' }
contributors:
  - { surname: Hopper, forename: Grace }
  - { surname: Noether }
```

**Result** (envelope):

```yaml
citation:
  title: On Mapping
  doi: '10.1000/xyz123'
  year: 2024
  authors:
    - { family: Hopper, given: Grace }
    - { family: Noether, given: '' }
  source: import
valid: true
errors: []
```

Walkthrough: five pairings evaluate in order. The `doi` pairing locates
`/ids`, `find` selects the member whose `idType` equals `doi` and narrows to
`/value`; `required` validates the outcome. The `year` pairing shows the
pipeline order doing work: `first` locates a string, and `as: number`
finalizes it. The `authors` pairing fans out over `/contributors` — the two
element mappings may evaluate concurrently; results reassemble in element
order — and the `given` default fills the missing forename. Deep target
pointers create the `citation` object on first write (§4.3).

### 9.2 Flow: a lookup-and-respond document

A flow-style document: sequential pairings accumulate request state in the
output, a plugin performs the effect, and later pairings shape the response —
the whole route handler is data.

**Document:**

```yaml
mapping:
  /params/table: { constant: people }
  /params/id: /request/id
  /row:
    output: /params
    db: { pointer: /0 }
  /response:
    output: /
    switch:
      output: /row/role
      cases:
        admin: { source: /, mapping: { /name: /row/name, /admin: { constant: true } } }
        default: { source: /, mapping: { /name: /row/name } }
```

**Input:** `{ request: { id: '42' } }` — with a `db` plugin that looks up
rows by `params` (the test extension returns
`{ id: '42', name: Ada, role: admin }` for `people/42`).

**Result** (envelope):

```yaml
params: { table: people, id: '42' }
row: { id: '42', name: Ada, role: admin }
response: { name: Ada, admin: true }
valid: true
errors: []
```

Walkthrough: the first two pairings *write the plugin's parameters into the
output*; the third reads them back (`output: /params`) as the pipeline value
— the value-as-parameters pattern of §7.4 — and the `db` plugin performs the
lookup, narrowed by `pointer`. The final pairing follows the idiom of the
A10 note (Appendix A): its locate keyword `output: /` pairs with
`switch.output`, so the branch key comes from the accumulated output under
both the specified semantics and the reference implementation's actual
behavior; the selected case then maps the output into the response shape.
Pairing order is the program: reordering these pairings changes (or breaks)
the flow (§3.2).

## Appendix A. Known deviations of the reference implementation (normative)

Each row records a place where `@christiansmith/mapper-js` 0.1.1 differs from
this specification. The *probe* column names the characterization cases in
`test/cases/09-probes-deviations.yaml` that pin the actual behavior. A
deviation is retired by fixing the implementation and updating its probes in
the same change.

| ID      | Specification                                                                                                                                                                                                     | Reference implementation                                                                                                                                                                                                                                                                                                    | Probes                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **A1**  | Booleans and `null` are values; the MAP dispatch writes them (§5.4).                                                                                                                                              | Dropped silently on the structural/switch dispatch path (written correctly on the plain path).                                                                                                                                                                                                                              | `F2-boolean-null-loss`           |
| **A2**  | An empty array maps to an empty array (§5.4).                                                                                                                                                                     | Takes the object branch and nests to `{}`.                                                                                                                                                                                                                                                                                  | `F3-empty-array`                 |
| **A3**  | Non-negative-integer tokens (including `0`) infer arrays on recovering writes; non-integer final tokens on arrays are diagnostics (§4.3).                                                                         | Token `"0"` creates an object; non-integer final tokens on arrays coerce to index 0 and splice-insert.                                                                                                                                                                                                                      | `F4-recover-container-inference` |
| **A4**  | Validators skip undefined except `required` and check only values of their own type; zero-valued numeric bounds are honored; decimal `multipleOf` operands work; `as` on undefined yields undefined (§5.5, §6.7). | `minLength`/`maxLength` throw on undefined and length-check arrays; `minimum: 0`/`maximum: 0` ignored; `multipleOf` fires on undefined and non-numbers and false-errors on decimal operands; `type: integer` accepts numerically coercible values; `as` of undefined: `string` throws, `number` → NaN, `boolean` → `false`. | `F5-validator-edge-cases`        |
| **A5**  | Variant lists select the first **defined** result (§5.4).                                                                                                                                                         | Selects the first **truthy** result; defined-but-falsy results are skipped.                                                                                                                                                                                                                                                 | `F10-variant-truthiness`         |
| **A6**  | A string descriptor that is not a pointer, relative reference, or registered name is a diagnostic (§3.3).                                                                                                         | Passes through as a literal and evaluates to the whole source scope.                                                                                                                                                                                                                                                        | `F7-deref-ambiguity`             |
| **A7**  | `$ref` to an unregistered id is a diagnostic naming the id (§3.5).                                                                                                                                                | Resolves to undefined; evaluation fails with an unrelated type error.                                                                                                                                                                                                                                                       | `F11-unknown-ref`                |
| **A8**  | Slash-prefixed pointers MUST NOT contain `..`; relative resolution applies only to relative references (§4.4).                                                                                                    | Slash-prefixed pointers containing `..` are read as literal tokens (yielding undefined).                                                                                                                                                                                                                                    | `F9-relative-pointer-gating`     |
| **A9**  | `unique` selection MUST terminate; requesting more unique members than exist is a diagnostic (§5.5, Experimental).                                                                                                | Loops indefinitely when `random` exceeds the number of distinct members.                                                                                                                                                                                                                                                    | *(not probed — nonterminating)*  |
| **A10** | `switch.source`/`switch.input`/`switch.output` read the branch key from the switched value, the root input, and the root output respectively (§5.5).                                                              | All three read the branch key from the switched value.                                                                                                                                                                                                                                                                      | `F12-switch-scope`               |
| **A11** | `$extend` resolves (and unknown-ancestor errors surface) whenever a mapping is registered, including evaluation-time registration (§3.5, §5.3).                                                                   | Only evaluator construction resolves `$extend`; mappings registered at evaluation time keep it unresolved (ancestor pairings silently missing) and unknown ancestors raise no error.                                                                                                                                        | `F13-late-registration`          |
| **A12** | Context-derivation overrides apply for any defined value (§5.2).                                                                                                                                                  | Truthiness-gated: falsy overrides (`0`, `""`, `false`, `null`) fall back to the parent binding — e.g. a falsy `each` element evaluates against the parent scope.                                                                                                                                                            | `F14-falsy-scope`                |

**Note on A10.** Observed mapping documents pair the
descriptor's locate keyword with the matching switch scope — e.g.
`output: /` with `switch.output`, or a root-input source with `switch.input`.
Under that idiom the switched value *is* the named scope, so the specified and
actual behaviors coincide; they diverge only when the switched value differs
from the named scope (the construction the `F12` probes use). Adopting the
specified semantics therefore does not change the behavior of documents
following the idiom.

## Appendix B. Test suite and case format (informative)

The YAML case files under `test/cases/` are both the reference
implementation's regression suite and the seed of a cross-implementation
conformance suite. The case format — invocation levels, deep-equality rules,
the `__undefined__` sentinel, pointer-wise assertion ops for nondeterministic
results, `throws`, and `deviation` markers — is documented in
`test/cases/README.md`. Case data is deliberately implementation-neutral:
descriptors, inputs, and expectations are plain JSON-compatible data, and the
deterministic extension functions cases rely on are described in
`test/extensions.js`.

## Appendix C. Design considerations (informative)

Recorded for future revisions, not requirements of this draft:

- **Open question — plain-pointer case scope (§5.5):** a switch case without
  a `mapping` is evaluated against the enclosing context rather than the
  switched value. Whether this is intended or a deviation is undecided; no
  observed document exercises the distinction.

- **Result envelope separation** — moving `valid`/`errors` out of the output
  key space (§5.3).
- **Vocabulary candidates** observed in historical drafts but never
  implemented: `greatest`, `least`, `longest`, `shortest`, `flatten`,
  `format`, `times`.
- **Alternative traversal strategies** — source-wise or bidirectional
  traversal as alternatives to target-wise descent.
- **Alternative addressing** — XPath-style selection as an alternative to
  JSON Pointer reads.
- **Error-model rework** — the present model (§5.8) is captured as-is, and
  is known to need substantial design work. Flagged areas: structured capture
  of extension failures (today host exceptions, §7.4); error provenance
  (error objects carry the read keyword but not the full source/target
  paths); short-circuit granularity (all-or-nothing today — no partial
  results or error-tolerant modes); mapping errors to responses (letting a
  document declare how its own failures become output); and separating
  diagnostics from validation.
- **Diagnostic mode** — surfacing unknown transformer/initializer names,
  unreachable plugin registrations, and invalid pointer strings.
- **Extraction candidates** — `stdout` and `regexp_i` are deployment-shaped
  conveniences living in the core engine (their Experimental tier reflects
  this); a future revision may remove them from the core keyword set in favor
  of the extension interfaces (§7).
- **Extension-requirements declaration** — a way for a mapping document to
  declare the extension names (and versions) it depends on, so deployments
  can validate a document's portability before evaluating it (§7.6).

## Appendix D. Requirement traceability (informative)

Every identified requirement (§1.2), the section that states it, the suite
files that exercise it, and the Appendix A deviation that applies to the
reference implementation, if any. *(gap)* marks requirements with no covering
case yet.

| Req         | Section | Cases                                                           | Deviation |
| ----------- | ------- | --------------------------------------------------------------- | --------- |
| DOC-1       | §3.2    | `01-source-reads`, `09-probes-deviations` (F1)                  | —         |
| DOC-2       | §3.3    | `09-probes-deviations` (F7)                                     | A6        |
| REG-1       | §3.5    | `09-probes-deviations` (F11)                                    | A7        |
| REG-2       | §3.5    | `06-references`, `10-catalog-gaps`, `13-audit-probes`           | —         |
| REG-3       | §3.5    | `13-audit-probes` (F13)                                         | A11       |
| REG-4       | §3.5    | `13-audit-probes` (F13)                                         | A11       |
| EXT-1       | §3.6    | *(gap — not suite-testable as data)*                            | —         |
| EXT-2       | §7.2    | `11-extension-interfaces`                                       | —         |
| EXT-3       | §7.2    | `11-extension-interfaces`                                       | —         |
| EXT-4       | §7.5    | *(gap)*                                                         | —         |
| EXT-5       | §7.5    | *(gap)*                                                         | —         |
| EXT-6       | §7.3    | `08-extensions`                                                 | —         |
| EXT-7       | §7.6    | *(meta-requirement on suites themselves)*                       | —         |
| EXT-8       | §7.6    | *(gap — behavioral guidance)*                                   | —         |
| PTR-1       | §4.1    | `01-source-reads`, `02-combinators`, `04-validation`            | —         |
| PTR-2       | §4.2    | *(gap)*                                                         | —         |
| PTR-3       | §4.3    | `05-mapping-core` (language map)                                | —         |
| PTR-4       | §4.3    | `09-probes-deviations` (F4)                                     | A3        |
| PTR-5       | §4.3    | *(gap)*                                                         | —         |
| PTR-6       | §4.3    | `09-probes-deviations` (F4)                                     | A3        |
| PTR-7       | §4.3    | `13-audit-probes` (write-through)                               | —         |
| PTR-8       | §4.4    | `01-source-reads`, `10-catalog-gaps`                            | —         |
| PTR-9       | §4.4    | `09-probes-deviations` (F9)                                     | A8        |
| CTX-1       | §5.2    | `13-audit-probes` (F14)                                         | A12       |
| CTX-2       | §5.2    | `11-extension-interfaces`                                       | —         |
| CTX-3       | §5.3    | *(gap — SHOULD, document-level)*                                | —         |
| CTX-4       | §5.3    | *(caller requirement — not suite-testable)*                     | —         |
| MAP-1       | §5.4    | `01-source-reads`, `09-probes-deviations` (F1)                  | —         |
| MAP-2       | §5.4    | `09-probes-deviations` (F2)                                     | A1        |
| MAP-3       | §5.4    | `09-probes-deviations` (F3)                                     | A2        |
| MAP-4       | §5.4    | `09-probes-deviations` (F10)                                    | A5        |
| GET-1       | §5.5    | `03-finalize`, `08-extensions`                                  | —         |
| GET-2       | §5.5    | `09-probes-deviations` (F12)                                    | A10       |
| GET-3       | §5.5    | `04-validation`, `09-probes-deviations` (F5), `10-catalog-gaps` | A4        |
| GET-4       | §5.5    | `09-probes-deviations` (F5), `10-catalog-gaps`                  | A4        |
| GET-5       | §5.5    | `08-extensions`, `10-catalog-gaps`                              | —         |
| SEQ-1       | §5.7    | `08-extensions` (async each)                                    | —         |
| SEQ-2       | §5.7    | *(permission — nothing to test)*                                | —         |
| ERR-1       | §5.8    | `04-validation`                                                 | —         |
| ERR-2       | §5.8    | `05-mapping-core`, `11-extension-interfaces`                    | —         |
| KW-1        | §6      | *(gap)*                                                         | —         |
| KW-random-1 | §6.6    | *(not probed — nonterminating)*                                 | A9        |
| KW-as-1     | §6.6    | `10-catalog-gaps`                                               | A4        |
| KW-stdout-1 | §6.9    | `09-probes-deviations` (F8)                                     | —         |

## References

- [RFC 2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement
  Levels", BCP 14, RFC 2119, March 1997.
- [RFC 8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
  Words", BCP 14, RFC 8174, May 2017.
- [RFC 6901] Bryan, P., Ed., Zyp, K., and M. Nottingham, Ed., "JavaScript
  Object Notation (JSON) Pointer", RFC 6901, April 2013.
- JSON Schema (validation vocabulary inspiration):
  json-schema.org.
