/**
 * Data-driven test runner.
 *
 * Executes every YAML case file in test/cases/. See test/cases/README.md for
 * the case format and assertion vocabulary.
 */
import { parse } from '@std/yaml'
import { assert, assertEquals, assertStringIncludes, fail } from '@std/assert'
import Mapper, { map, get, shift, extend } from '../src/Mapper.js'
import JSONPointer from '../src/JSONPointer.js'
import { initializers, transformers, plugins } from './extensions.js'

const UNDEFINED = '__undefined__'

const casesDir = new URL('./cases/', import.meta.url)
const files = [...Deno.readDirSync(casesDir)]
  .filter((entry) => entry.isFile && entry.name.endsWith('.yaml'))
  .map((entry) => entry.name)
  .sort()

for (const file of files) {
  const suite = parse(Deno.readTextFileSync(new URL(file, casesDir)))

  for (const test of suite.tests || []) {
    Deno.test({
      name: `${suite.suite || file} :: ${test.description}`,
      only: test.only === true,
      fn: async () => await run(suite, test)
    })
  }
}

/**
 * run
 */
async function run(suite, test) {
  const level = test.level || suite.level || 'mapper'
  const mappings = test.mappings || {}
  const options = { initializers, transformers, plugins }
  const errors = []
  const stdout = captureStdout(test)

  let value, result, threw

  try {
    if (level === 'get') {
      const context = shift(test.descriptor, { input: test.input, errors, mappings, ...options })
      value = await get(test.descriptor, context)
    } else if (level === 'map') {
      result = await map(test.descriptor, { input: test.input, errors, mappings, ...options })
    } else if (level === 'extend') {
      result = extend(test.descriptor, { mappings })
    } else if (level === 'mapper') {
      const mapper = new Mapper({ mappings }, options)
      result = await mapper.map(test.id ?? test.descriptor, test.input)
    } else {
      fail(`unknown level "${level}"`)
    }
  } catch (error) {
    threw = error
  } finally {
    stdout.restore()
  }

  // thrown errors
  if (test.throws !== undefined) {
    if (!threw) fail(`expected a thrown error matching "${test.throws}"`)
    if (typeof test.throws === 'string') {
      assertStringIncludes(String(threw.message ?? threw), test.throws)
    }
    return
  }

  if (threw) throw threw

  const expected = test.expected || {}
  const actual = level === 'get' ? value : result

  // primary value/result equality
  if ('value' in expected) assertValue(value, expected.value)
  if ('result' in expected) assertValue(result, expected.result)

  // error accumulator (mapper level reports through the envelope)
  if ('errors' in expected) {
    const accumulated = level === 'mapper' ? result.errors : errors
    if (typeof expected.errors === 'number') {
      assertEquals(accumulated.length, expected.errors, 'error count')
    } else {
      assertValue(accumulated, expected.errors)
    }
  }

  if ('valid' in expected) assertEquals(result.valid, expected.valid, 'valid')

  // pointer-wise assertions (for nondeterministic or partial expectations)
  if (test.assert) applyAsserts(test.assert, actual)

  // captured stdout
  if (expected.stdout) applyOps('stdout', expected.stdout, stdout.text())
}

/**
 * assertValue — deep equality over the JSON data model
 *
 * Values are round-tripped through JSON so that undefined-valued properties
 * and missing properties compare as equal (matching what a caller can observe
 * through serialization), and `__undefined__` expresses expected undefined.
 */
function assertValue(actual, expected, message) {
  if (expected === UNDEFINED) {
    assertEquals(actual, undefined, message)
    return
  }

  assertEquals(canon(actual), canon(expected), message)
}

function canon(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * applyAsserts — { "/json/pointer": { op: operand, ... }, ... }
 */
function applyAsserts(asserts, actual) {
  for (const [pointer, ops] of Object.entries(asserts)) {
    const value = pointer === '/' ? actual : JSONPointer.get(actual, pointer)
    applyOps(pointer, ops, value)
  }
}

function applyOps(label, ops, value) {
  for (const [op, operand] of Object.entries(ops)) {
    switch (op) {
      case 'equals':
        assertValue(value, operand, label)
        break
      case 'defined':
        assertEquals(value !== undefined, operand, `${label} defined`)
        break
      case 'type':
        if (operand === 'array') assert(Array.isArray(value), `${label} must be an array`)
        else if (operand === 'null') assertEquals(value, null, label)
        else assertEquals(typeof value, operand, `${label} type`)
        break
      case 'length':
        assertEquals(value.length, operand, `${label} length`)
        break
      case 'pattern':
        assert(new RegExp(operand).test(String(value)), `${label} must match ${operand}`)
        break
      case 'contains':
        if (typeof value === 'string') assertStringIncludes(value, operand, label)
        else assert(includes(value, operand), `${label} must contain ${JSON.stringify(operand)}`)
        break
      case 'oneOf':
        assert(includes(operand, value), `${label} must be one of ${JSON.stringify(operand)}`)
        break
      case 'subsetOf':
        assert(
          Array.isArray(value) && value.every((item) => includes(operand, item)),
          `${label} must be a subset of ${JSON.stringify(operand)}`
        )
        break
      default:
        fail(`unknown assertion op "${op}"`)
    }
  }
}

function includes(collection, item) {
  return collection.some((member) => JSON.stringify(member) === JSON.stringify(item))
}

/**
 * captureStdout — intercept console.log while a case runs
 */
function captureStdout(test) {
  if (!test.expected?.stdout) {
    return { restore: () => {}, text: () => '' }
  }

  const original = console.log
  const lines = []

  console.log = (...args) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
  }

  return {
    restore: () => {
      console.log = original
    },
    text: () => lines.join('\n')
  }
}
