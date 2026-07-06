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

**Deviation notes.** This specification defines *intended* behavior. Where the
reference implementation is known to behave differently, the text carries a
note — *Deviation An, see Appendix A* — and the actual behavior is pinned by
an executable characterization case in the test suite. Implementations MUST
follow the specification text, not the deviation, except where compatibility
with the reference implementation is explicitly required.

### 1.3 Status of this document

Sections 1–5 and Appendices A–B are complete in this draft. Sections 6–9
(keyword catalog, extension interfaces, algorithmic characteristics, worked
examples) are outlined and reserved for the next revisions of this draft.

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
implementation. Cases tagged `deviation:` pin reference-implementation
behavior that differs from this specification (Appendix A); a conforming
implementation is expected to *fail* those cases in their literal form and
satisfy the specification text instead. All other cases double as conformance
cases for any implementation, subject to the case format documented in
`test/cases/README.md`.

## 3. Data model and terminology

### 3.1 Values

Mapper operates on the JSON data model: `null`, booleans, finite numbers,
strings, arrays, and maps ("objects"). In addition, evaluation distinguishes
the out-of-band state **undefined** — the result of reading an absent
location. Undefined is not a JSON value: writing undefined to a target
location MUST be a no-op (§4.3), and serialized outputs never contain it.

### 3.2 Ordered maps (portability requirement)

Objects in mapping documents MUST be processed as **ordered maps**: an
implementation MUST preserve and honor the document order of keys. This is
load-bearing, not cosmetic:

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

A **descriptor** describes how to produce a value. It takes one of four forms:

| Form                          | Example                              | Meaning                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pointer string**            | `"/a/b"`                             | Read from the current source (§4).                                                                                                                                                        |
| **Relative reference string** | `"../sibling"`                       | Extended tier: resolve against the current source path, read from the root input (§4.4).                                                                                                  |
| **Name string**               | `"mapping:Person"`                   | A registry reference: the named mapping is substituted (§3.5). A string that is none of the above is invalid — implementations SHOULD raise a diagnostic. *Deviation A6, see Appendix A.* |
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
  A `$ref` to an unregistered id is an error; implementations SHOULD produce a
  diagnostic naming the missing id. *Deviation A7, see Appendix A.*
- `$extend` — single inheritance between named mappings, resolved when
  mappings are registered (not at evaluation time). The derived mapping's
  pairing map is the ancestor chain's pairings merged with the descendant's:
  ancestor pairings appear first in order, descendant pairings override
  same-key ancestors and append otherwise. `$extend` naming an unregistered
  id MUST raise an error.

Registration order and re-registration: registering a mapping with an
existing `$id` replaces it. Note that the reference implementation's
evaluator API also registers mappings presented inline at evaluation time,
mutating the evaluator's registry as a side effect (§5.3); implementations
MUST reproduce the observable resolution behavior.

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
collides with a built-in keyword is unreachable. Implementations SHOULD warn
on such registrations.

## 4. JSON Pointer profile

Mapper uses JSON Pointer [RFC 6901] for all location addressing, with the
extensions and clarifications in this section.

### 4.1 Syntax and read semantics

Pointers use RFC 6901 syntax, including `~0`/`~1` escaping. The empty pointer
and the pointer `/` both denote the whole document on read.

Reading a location whose path does not exist MUST yield undefined (§3.1) —
never an error. This "recovering read" is what gives `first`/`last`/`all`,
`default`, and `required` their meaning.

### 4.2 URI fragment form

A pointer beginning with `#` is interpreted as an RFC 6901 URI fragment
identifier: the remainder is percent-decoded and MUST then parse as a JSON
string pointer.

### 4.3 Write semantics

Writing `value` to `target` at a pointer:

- Writing undefined MUST be a no-op (the location is left untouched; no
  intermediate containers are created).
- Missing intermediate containers are created ("recovering write"). The
  container kind is inferred from the *next* token: a token that is a
  non-negative integer creates an array; any other token creates an object.
  *Deviation A3, see Appendix A: the reference implementation creates an
  object for token `"0"` and arrays only for tokens whose integer value is
  non-zero.*
- The final token `-` on an array appends.
- A non-negative-integer final token on an array **inserts** at that index
  (splice semantics), shifting subsequent elements. Writing a non-integer
  final token on an array location is invalid; implementations SHOULD raise a
  diagnostic. *Deviation A3: the reference implementation coerces such tokens
  to index 0 and inserts.*
- On objects, the final token sets the property, replacing any existing value.

### 4.4 Relative source references (Extended)

A descriptor string that does **not** begin with `/` and contains the segment
`..` is a **relative reference**. It is resolved by path arithmetic against
the evaluation context's current *source path* (§5.2): segments are appended,
`.` and empty segments are dropped, and `..` pops one segment. The resolved
absolute pointer is then read **from the root input** (not from the current
source value).

A pointer string beginning with `/` MUST NOT contain `..` segments; such
strings are invalid and implementations SHOULD raise a diagnostic.
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
parent's bindings, then the roots. Shared fields are propagated **by
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
them. Mapping documents SHOULD NOT write those keys at the top level; a
future revision may separate the envelope.

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

- Pairings MUST evaluate sequentially in document order; element fan-out
  under `each` and variant-list evaluation MAY proceed concurrently (§5.7).
- The value dispatch MUST write every defined value; booleans and `null`
  are values. *Deviation A1.*
- An empty array MUST map to an empty array. *Deviation A2.*
- Variant lists MUST select the first **defined** result in list order.
  *Deviation A5: the reference implementation selects the first truthy
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

- The stage order above is observable behavior and MUST be preserved.
  Consequences implementations must reproduce: `constant` overrides plugin
  and `init` results; validation sees the *transformed* value; `default`
  applies **after** validation (an absent value with a `default` still fails
  `required`); `as` coerces last.
- The `switch` keywords name the **scope the branch key is read from** — they
  are not aliases: `switch.source` reads the branch key from the value being
  switched on; `switch.input` reads it from the root input; `switch.output`
  reads it from the root output. This allows a document to switch on context
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
- Validators MUST treat undefined uniformly: absent values are validated only
  by `required`. *Deviation A4: in the reference implementation `minLength`/
  `maxLength` throw on undefined, and `minimum: 0`/`maximum: 0` are ignored
  (falsy keyword guard).* `as` on undefined MUST yield undefined.
  *Deviation A4.*
- Unknown `init`/`transform` names are skipped silently in the reference
  implementation; implementations SHOULD offer a diagnostic mode.

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
concurrently. Implementations MUST NOT let concurrent branches observe each
other's partial writes; each branch writes only its own fresh target.
Implementations MAY additionally parallelize independent pairings only if no
descriptor in the level reads `target`/`output` — a static analysis this
specification permits but does not require (optimization signpost).

### 5.8 Errors

Validation keywords append **error objects** to the shared `errors`
accumulator and never interrupt the pipeline mid-descriptor. Error objects
carry the failing keyword, the offending value, the descriptor's read
keyword(s) for provenance, and a human-readable `message` (exact shapes in
§6, pinned by the validation cases in the test suite).

After each pairing, MAP checks the accumulator: if non-empty, the current MAP
returns NULL immediately (short-circuit), abandoning the rest of the level
and propagating outward — enclosing levels observe the shared accumulator and
short-circuit in turn. The envelope (§5.3) then reports `valid: false` with
all accumulated errors and no partial output.

Errors raised by extensions (thrown/rejected) are not part of this error
model: they propagate to the caller as exceptions. A future revision may
define structured extension-error capture.

## 6. Keywords

*Reserved — next revision.* One normative section per keyword with its tier,
argument grammar, pipeline stage, error shapes, and test-suite cross
references. Tier assignments are fixed in §2.2.

## 7. Extension interfaces

*Reserved — next revision.* Interface contract for initializers,
transformers, and plugins (§3.6): signatures, context capabilities,
determinism and idempotency expectations, asynchrony, and error propagation.

## 8. Algorithmic characteristics

*Reserved — next revision.* Complexity in terms of document size, input
size, and fan-out; data-structure evolution; concurrency width; optimization
signposts.

## 9. Worked examples

*Reserved — next revision.* End-to-end examples at meaningful granularity,
including a flow-style document composing plugins.

## Appendix A. Known deviations of the reference implementation (normative)

Each row records a place where `@christiansmith/mapper-js` 0.1.1 differs from
this specification. The *probe* column names the characterization cases in
`test/cases/09-probes-deviations.yaml` that pin the actual behavior. A
deviation is retired by fixing the implementation and updating its probes in
the same change.

| ID     | Specification                                                                                                                             | Reference implementation                                                                                         | Probes                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **A1** | Booleans and `null` are values; the MAP dispatch writes them (§5.4).                                                                      | Dropped silently on the structural/switch dispatch path (written correctly on the plain path).                   | `F2-boolean-null-loss`           |
| **A2** | An empty array maps to an empty array (§5.4).                                                                                             | Takes the object branch and nests to `{}`.                                                                       | `F3-empty-array`                 |
| **A3** | Non-negative-integer tokens (including `0`) infer arrays on recovering writes; non-integer final tokens on arrays are diagnostics (§4.3). | Token `"0"` creates an object; non-integer final tokens on arrays coerce to index 0 and splice-insert.           | `F4-recover-container-inference` |
| **A4** | Validators skip undefined except `required`; zero-valued numeric bounds are honored; `as` on undefined yields undefined (§5.5).           | `minLength`/`maxLength` throw on undefined; `minimum: 0`/`maximum: 0` ignored; `as: string` throws on undefined. | `F5-validator-edge-cases`        |
| **A5** | Variant lists select the first **defined** result (§5.4).                                                                                 | Selects the first **truthy** result; defined-but-falsy results are skipped.                                      | `F10-variant-truthiness`         |
| **A6** | A string descriptor that is not a pointer, relative reference, or registered name is a diagnostic (§3.3).                                 | Passes through as a literal and evaluates to the whole source scope.                                             | `F7-deref-ambiguity`             |
| **A7** | `$ref` to an unregistered id is a diagnostic naming the id (§3.5).                                                                        | Resolves to undefined; evaluation fails with an unrelated type error.                                            | `F11-unknown-ref`                |
| **A8** | Slash-prefixed pointers MUST NOT contain `..`; relative resolution applies only to relative references (§4.4).                            | Slash-prefixed pointers containing `..` are read as literal tokens (yielding undefined).                         | `F9-relative-pointer-gating`     |
| **A9** | `unique` selection MUST terminate; requesting more unique members than exist is a diagnostic (§5.5, Experimental).                        | Loops indefinitely when `random` exceeds the number of distinct members.                                         | *(not probed — nonterminating)*  |
| **A10** | `switch.source`/`switch.input`/`switch.output` read the branch key from the switched value, the root input, and the root output respectively (§5.5). | All three read the branch key from the switched value. | `F12-switch-scope` |

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

- **Result envelope separation** — moving `valid`/`errors` out of the output
  key space (§5.3).
- **Vocabulary candidates** observed in historical drafts but never
  implemented: `greatest`, `least`, `longest`, `shortest`, `flatten`,
  `format`, `times`.
- **Alternative traversal strategies** — source-wise or bidirectional
  traversal as alternatives to target-wise descent.
- **Alternative addressing** — XPath-style selection as an alternative to
  JSON Pointer reads.
- **Structured extension errors** — capturing plugin/transformer failures in
  the error model (§5.8).
- **Diagnostic mode** — surfacing unknown transformer/initializer names,
  unreachable plugin registrations, and invalid pointer strings.

## References

- [RFC 2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement
  Levels", BCP 14, RFC 2119, March 1997.
- [RFC 8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
  Words", BCP 14, RFC 8174, May 2017.
- [RFC 6901] Bryan, P., Ed., Zyp, K., and M. Nottingham, Ed., "JavaScript
  Object Notation (JSON) Pointer", RFC 6901, April 2013.
- JSON Schema (validation vocabulary inspiration):
  json-schema.org.
