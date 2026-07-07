/**
 * Deterministic extension functions for the test suite.
 *
 * These stand in for user-supplied initializers, transformers, and plugins so
 * that test cases exercising the extension interfaces have reproducible
 * results. They also document the calling conventions:
 *
 *   initializer(value, context)             -> value
 *   transformer(value, context, options?)   -> value   (options = the step object)
 *   plugin(descriptor[key], value, context) -> Promise<value>
 */
import JSONPointer from '../src/JSONPointer.js'

export const initializers = {
  uuid: () => 'urn:uuid:00000000-0000-4000-8000-000000000000',
  'date-time': () => '2026-01-01T00:00:00.000Z',
  counterfactual: (value) => (value === undefined ? 'initialized' : value),
  // deliberately invalid: initializers must be synchronous (SPEC.md §7.2);
  // used to characterize what happens when one is not
  asyncUnsupported: async () => 'never',
  asyncList: async () => ['x', 'y']
}

export const transformers = {
  trim: (value) => (typeof value === 'string' ? value.trim() : value),
  upcase: (value) => (typeof value === 'string' ? value.toUpperCase() : value),
  split: (value, context, options) => (typeof value === 'string' ? value.split(options.split) : value),
  slice: (value, context, options) =>
    Array.isArray(value) || typeof value === 'string' ? value.slice(...[].concat(options.slice)) : value,
  last: (value) => (Array.isArray(value) ? value[value.length - 1] : value),
  pluck: (value, context, options) => JSONPointer.get(value, options.pluck)
}

export const plugins = {
  echo: async (options, value) => ({ options, value }),
  wrap: async (options, value) => ({ [options.key || 'wrapped']: value }),
  delayed: async (options, value) => {
    await new Promise((resolve) => setTimeout(resolve, options.ms || 1))
    return value
  },
  failing: async () => {
    throw new Error('plugin failure: failing')
  },
  // deterministic lookup used by the worked examples (SPEC.md §9.2):
  // the pipeline value carries the parameters, options carries the shape
  db: async (options, value) => {
    const tables = {
      people: { '42': { id: '42', name: 'Ada', role: 'admin' } }
    }
    const row = tables[value?.table]?.[value?.id]
    return row ? [row] : []
  },
  flag: async (options, value, context) => {
    context.errors.push({ plugin: 'flag', message: options.message || 'flagged' })
    return value
  }
}
