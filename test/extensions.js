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
  counterfactual: (value) => (value === undefined ? 'initialized' : value)
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
  }
}
