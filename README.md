# Mapper

[![JSR](https://jsr.io/badges/@christiansmith/mapper-js)](https://jsr.io/@christiansmith/mapper-js)
[![npm](https://img.shields.io/npm/v/@christiansmith/mapper-js)](https://www.npmjs.com/package/@christiansmith/mapper-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Declarative data transformation

A mapping document pairs target locations with source descriptors. Mapper
applies the document to an input and produces an output. The document is
plain data: store it, version it, send it over the wire, generate it, query
it.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Tests](#tests)
- [Extensions](#extensions)
- [Documentation](#documentation)
- [Status](#status)
- [Related](#related)
- [Contributing](#contributing)
- [License](#license)

## Background

A mapping is an ordered map of pairings. Each pairing puts a
[JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) into the output on
the left and, on the right, a descriptor that says how to produce the value.
Descriptors read (`source`, `input`, `output`, `target`), select (`switch`,
`find`, `first`/`last`/`all`), shape (`template`, `transform`, `default`,
`as`), validate (a JSON-Schema-like vocabulary: `type`, `minimum`, `enum`,
`required`, and friends), and nest (`mapping`/`each`). Every descriptor
evaluates through the same fixed pipeline, in document order.

Plugins extend the vocabulary with asynchronous functions. Since documents
are data and plugins can do I/O, a mapping can describe a complete flow:
early pairings accumulate parameters, a plugin makes the request, later
pairings shape the response. The style resembles flow-based programming,
with the document as the wiring.

The behavior is formally specified. [`SPEC.md`](SPEC.md) defines the
algorithm independently of any programming language, this package is its
reference implementation, and every example printed in the spec runs as
part of the test suite.

## Install

Deno / JSR:

```bash
deno add jsr:@christiansmith/mapper-js
```

Node / npm:

```bash
npm install @christiansmith/mapper-js
```

## Usage

A mapping, usually authored in YAML:

```yaml
/citation/title: /title
/citation/doi:
  source: /ids
  find:
    eq: { idType: doi }
    pointer: /value
/citation/authors:
  source: /contributors
  each:
    /family: /surname
```

An input:

```json
{
  "title": "On Mapping",
  "ids": [
    { "idType": "issn", "value": "2049-3630" },
    { "idType": "doi", "value": "10.1000/xyz123" }
  ],
  "contributors": [{ "surname": "Hopper" }, { "surname": "Noether" }]
}
```

Applying one to the other:

```js
import Mapper from '@christiansmith/mapper-js'

const mapper = new Mapper({}, { initializers: {}, transformers: {}, plugins: {} })

// mapping and input as above, loaded however you load YAML and JSON
const { valid, errors, ...result } = await mapper.map(mapping, input)
```

The result:

```json
{
  "citation": {
    "title": "On Mapping",
    "doi": "10.1000/xyz123",
    "authors": [{ "family": "Hopper" }, { "family": "Noether" }]
  }
}
```

with `valid: true` and `errors: []`.

Mappings register by `$id`, compose with `$ref`, and inherit with
`$extend`. Validation keywords collect structured errors; any failure
returns `valid: false` and no partial output. The
[quick reference](docs/quick-reference.md) lists every keyword on one page,
and [`SPEC.md` §9](SPEC.md) walks through two examples in full, including a
flow-style document that serves as a request handler.

## Tests

```bash
deno task test
```

Runs the YAML case suite under [`test/cases/`](test/cases/), which includes
every example printed in `SPEC.md`.

## Extensions

Three registries of host functions extend the keyword vocabulary:

```js
initializer(value, context)              // sync,  invoked by  init: <name>
transformer(value, context, options)     // sync,  invoked by  transform: [<steps>]
async plugin(options, value, context)    // async, invoked by any descriptor key that names one
```

Plugins are where side effects happen. Fetches, queries, and other I/O
enter mappings through them, and plugin calls parallelize across `each`
fan-out. An extension receives the evaluation context: it can read any
scope, append validation errors, call other registered extensions, and
evaluate sub-mappings. The full contract is [`SPEC.md` §7](SPEC.md).

## Documentation

- [`SPEC.md`](SPEC.md) is the specification: data model, evaluation
  algorithms, every keyword, conformance tiers, and an appendix of known
  deviations of this implementation.
- [`docs/quick-reference.md`](docs/quick-reference.md) covers the pipeline,
  keywords, context, errors, and extensions on one page.
- [`test/cases/`](test/cases/) holds the executable suite; the YAML case
  data doubles as a canonical example set.

## Status

Pre-1.0; interfaces may still change. `SPEC.md` (Draft 0.1) is the contract
for behavior. Known differences between this implementation and the spec
are listed in its Appendix A, each covered by a test. Behavior changes land
in the spec and the test suite together.

## Related

- [`@christiansmith/mapper-request`](https://jsr.io/@christiansmith/mapper-request):
  fetching and scraping plugin for Mapper.
- [`@christiansmith/mapper-http`](https://jsr.io/@christiansmith/mapper-http):
  HTTP server for running Mapper mappings.

## Contributing

Issues are welcome. Pull requests are not being accepted at this time.

The project is spec-first: any change to observable behavior updates
`SPEC.md` and the test cases in the same commit. Format with Prettier
(`.prettierrc`).

## License

MIT © Christian Smith
