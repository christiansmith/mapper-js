/**
 * Copyright 2023 Christian Smith. All rights reserved.
 */
/**
 * Dependencies
 */
import JSONPointer from './JSONPointer.js'

/**
 * resolve
 */
function resolve(...paths) {
  const normalized = paths.map((path) => path.replace(/\\/g, '/'))
  const joined = normalized.join('/')
  const absolute = joined.startsWith('/')
  const segments = joined.split('/').filter((segment) => segment !== '' && segment !== '.')
  const resolved = []

  for (const segment of segments) {
    if (segment === '..') {
      resolved.pop()
    } else {
      resolved.push(segment)
    }
  }

  const result = (absolute ? '/' : '') + resolved.join('/')
  return result || '.'
}

/**
 * shift
 */
export function shift(descriptor, context, changes) {
  const input = context.input
  const output = context.output || {}
  const source = changes?.source || context.source || input
  const target = changes?.target || context.target || output
  const errors = context.errors || []
  const paths = { source: '/', target: '/', ...context.paths }

  if (descriptor.source) {
    if (changes?.index !== undefined) {
      paths.source = resolve(paths.source, `/${changes.index}`, descriptor.source)
    } else {
      paths.source = resolve(paths.source, descriptor.source)
    }
  }

  if (descriptor.target) {
    paths.target = resolve(paths.target, descriptor.target)
  }

  // alias mapping as each
  const mapping = deref(descriptor.mapping || descriptor.each, context) || null
  const pairings = (mapping && Object.entries(mapping.mapping || mapping)) || null

  const mappings = context.mappings || {}
  const initializers = context.initializers || {}
  const transformers = context.transformers || {}
  const plugins = context.plugins || {}

  return {
    source,
    target,
    input,
    output,
    errors,
    paths,
    mapping,
    pairings,
    mappings,
    initializers,
    transformers,
    plugins
  }
}

/**
 * deref
 */
function deref(descriptor, context) {
  const mappings = context.mappings || {}

  if (typeof descriptor === 'string') {
    return mappings[descriptor] || descriptor
  } else if (descriptor?.$ref) {
    const mapping = mappings[descriptor.$ref]

    if (mapping === undefined) {
      const errors = context.errors || []

      complain(errors, descriptor, {
        $ref: descriptor.$ref,
        message: `unknown mapping reference`
      })

      context.errors = errors
      return {}
    }

    return mapping
  } else {
    return descriptor
  }
}

/**
 * unreadable
 */
function unreadable(pointer) {
  if (typeof pointer !== 'string') {
    return false
  }

  return pointer.charAt(0) === '/' && pointer.split('/').includes('..')
}

/**
 * recognized
 */
function recognized(pointer) {
  return pointer.charAt(0) === '/' || pointer.includes('../')
}

/**
 * check
 */
export function check(descriptor) {
  if (typeof descriptor === 'string') {
    if (unreadable(descriptor)) {
      return {
        descriptor,
        message: 'pointer must not contain .. segments'
      }
    }

    if (recognized(descriptor)) {
      return null
    }

    return {
      descriptor,
      message: 'unrecognized string descriptor'
    }
  }

  if (
    unreadable(descriptor?.source) ||
    unreadable(descriptor?.target) ||
    unreadable(descriptor?.input) ||
    unreadable(descriptor?.output)
  ) {
    return {
      message: 'pointer must not contain .. segments'
    }
  }

  return null
}

/**
 * map
 *
 * next is the next descriptor
 * previous is the previous context
 */
export async function map(next, previous) {
  const descriptor = deref(next, previous) // current descriptor
  const context = shift(descriptor, previous) // current context
  const whatever = await get(descriptor, context)
  const pairings = context.pairings // current pairings
  const target = context.target // current target

  if (pairings) {
    for (const [left, right] of pairings) {
      const rightDesc = deref(right, context) // source descriptor
      const rightContext = shift(rightDesc, context, { source: whatever })
      const rightPairings = rightContext.pairings

      // conditionals at this level are switching on
      // characteristics of the source descriptor
      if (rightPairings || rightDesc.switch) {
        // shift needs to set value, so we can assign `rightContext.value`
        const value = await get(rightDesc, rightContext)

        // conditionals at this level are switching on
        // characteristics of the source value
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null
        ) {
          set(left, target, value)

          // value is a non-empty array
          // nested is a nested mapping on rightDesc
        } else if (Array.isArray(value)) {
          const promises = value.map(async (item, index) => {
            return await nest(rightDesc, rightContext, { source: item, index })
          })

          const values = await Promise.all(promises)
          set(left, target, values)

          // value is a non-null object
        } else if (value && typeof value === 'object') {
          const changes = { source: value }
          const val = await nest(rightDesc, rightContext, changes)

          set(left, target, val)
        }

        // right descriptor is an array
      } else if (Array.isArray(rightDesc)) {
        const promises = rightDesc.map(async (variant) => {
          return await read(variant, rightContext)
        })

        const value = await Promise.all(promises)
        set(
          left,
          target,
          value.find((item) => item !== undefined)
        )

        // right descriptor is an object
      } else {
        const value = await get(rightDesc, rightContext)
        set(left, target, value)
      }

      // handle errors here?
      // does this require some error handling descriptor
      // in the mapping? mapping errors to responses!
      if (context.errors.length > 0) {
        return null
      }
    }
  }

  if (typeof descriptor.stdout === 'string') {
    const output = JSONPointer.get(context.target, descriptor.stdout)
    console.log(JSON.stringify(output, null, 2))
  } else if (descriptor.stdout) {
    console.log(context.target)
  }

  return context.target
}

/**
 * get
 */
export async function get(descriptor, context) {
  const problem = check(descriptor)

  if (problem) {
    complain(context.errors, typeof descriptor === 'string' ? {} : descriptor, problem)
    return undefined
  }

  let value

  // direct reads with JSONPointer
  if (typeof descriptor === 'string' && descriptor.charAt(0) === '/') {
    value = JSONPointer.get(context.source, descriptor)
  } else if (typeof descriptor === 'string' && descriptor.includes('../')) {
    const resolved = resolve(context.paths.source, descriptor)
    value = JSONPointer.get(context.input, resolved)
  } else if (typeof descriptor === 'string') {
    complain(context.errors, {}, { descriptor, message: 'unrecognized string descriptor' })
    return undefined
  } else if (descriptor.source) {
    value = JSONPointer.get(context.source, descriptor.source)
  } else if (descriptor.target) {
    value = JSONPointer.get(context.target, descriptor.target)
  } else if (descriptor.input) {
    value = JSONPointer.get(context.input, descriptor.input)
  } else if (descriptor.output) {
    value = JSONPointer.get(context.output, descriptor.output)

    // recursive reads with get and map
  } else if (Array.isArray(descriptor.first)) {
    const values = await all(descriptor.first, context)
    value = values.find((value) => value !== undefined)
  } else if (Array.isArray(descriptor.last)) {
    const values = await all(descriptor.last, context)
    value = values.reverse().find((value) => value !== undefined)
  } else if (Array.isArray(descriptor.all)) {
    const values = await all(descriptor.all, context)
    value = values.filter((item) => item !== undefined)

    // default starting value is source
  } else {
    value = context.source // value is context.source by default
  }

  // switch
  if (descriptor?.switch) {
    let branch

    if (descriptor.switch.source) {
      branch = JSONPointer.get(value, descriptor.switch.source)
    } else if (descriptor.switch.input) {
      branch = JSONPointer.get(context.input, descriptor.switch.input)
    } else if (descriptor.switch.output) {
      branch = JSONPointer.get(context.output, descriptor.switch.output)
    }

    if (branch) {
      const cases = descriptor.switch.cases
      const refDesc = cases[branch] || cases.default // use fallback

      value = refDesc && (await read(refDesc, context, { source: value }))
    }
  }

  // handle plugin keywords.
  // here we effectively daisy chain the function calls.
  // value is mutated on each iteration if a plugin exists
  for (const key of Object.keys(descriptor)) {
    const plugin = context.plugins[key]

    if (plugin) {
      const desc = descriptor[key]
      const pointer = desc.pointer
      value = await plugin(descriptor[key], value, context)
      if (pointer) {
        value = JSONPointer.get(value, pointer)
      }
    }
  }

  // initialize and transform
  value = findValue(descriptor, value)
  value = concatentateValues(descriptor, value)
  value = initializeValue(descriptor, value, context)
  value = initializeConstant(descriptor, value)
  value = selectRandom(descriptor, value, context)
  value = await renderTemplate(descriptor, value, context)
  value = transformValue(descriptor, value, context)

  // validate
  validateType(descriptor, value, context.errors)
  validateMaximum(descriptor, value, context.errors)
  validateMinimum(descriptor, value, context.errors)
  validateMultipleOf(descriptor, value, context.errors)
  validateMinLength(descriptor, value, context.errors)
  validateMaxLength(descriptor, value, context.errors)
  validateEnum(descriptor, value, context.errors)
  validatePattern(descriptor, value, context.errors)
  // validateFormat(descriptor, value, context)
  validateRequired(descriptor, value, context.errors)

  // finalize value
  value = initializeDefault(descriptor, value)
  value = regexpInsensitiveWrap(descriptor, value)
  value = as(descriptor, value)

  return value
}

/**
 * set
 */
export function set(descriptor, result, value) {
  JSONPointer.set(result, descriptor, value)
}

/**
 * all
 */
export async function all(descriptors, context) {
  const promises = descriptors.map(async (descriptor) => await read(descriptor, context))
  return await Promise.all(promises)
}

/**
 * nest (apply a nested mapping)
 */
export async function nest(descriptor, previous, changes) {
  const mapping = deref(descriptor.mapping || descriptor.each, previous)
  const nested = { source: '/', mapping: mapping?.mapping || mapping }
  const context = shift(nested, previous, { target: {}, ...changes })

  if (!mapping) {
    return context.source
  }

  return await map(nested, context)
}

/**
 * read (map or get)
 */
export async function read(reference, previous, changes) {
  const descriptor = deref(reference, previous)
  const mapping = descriptor.mapping || descriptor.each
  const reader = descriptor && (mapping ? map : get)
  const context = mapping ? shift(descriptor, previous, { target: {}, ...changes }) : previous

  return reader && (await reader(descriptor, context))
}

/**
 * Initialization, transformation,  and validation functions
 */

/**
 * mapping:
 *   /item:
 *     source: /path/to/array
 *     find:
 *       eq:
 *         @_IdType: doi
 *       pointer: '#text'
 */
function findValue(descriptor, value) {
  // handle the case where value is an object, not an array
  // by wrapping it in an array.
  const { find } = descriptor

  if (find && typeof value === 'object' && value !== null) {
    const { eq, pointer } = descriptor.find
    const list = Array.isArray(value) ? value : [value]
    let item

    item = list.find((item) => {
      return Object.entries(eq).every(([key, value]) => item[key] === value)
    })

    if (item && pointer) {
      item = JSONPointer.get(item, pointer)
    }

    return item
  }

  return value
}

function concatentateValues(descriptor, values) {
  if (Array.isArray(values) && descriptor.concat) {
    return values.flat(1)
  } else {
    return values
  }
}

function initializeValue(descriptor, value, context) {
  const initializers = context.initializers

  if (descriptor.init) {
    const fn = initializers[descriptor.init]

    if (fn) {
      return fn(value, context)
    }
  }

  return value
}

function initializeConstant(descriptor, value) {
  if (descriptor.constant !== undefined) {
    return descriptor.constant
  } else {
    return value
  }
}

function initializeDefault(descriptor, value) {
  if (value !== undefined) {
    return value
  } else {
    return descriptor.default
  }
}

function regexpInsensitiveWrap(descriptor, value) {
  if (descriptor.regexp_i !== undefined) {
    return `/${value}/i`
  }
  return value
}

async function renderTemplate(desc, value, previous) {
  const { mapping, template } = desc

  if (typeof value === 'object' && template && mapping) {
    const descriptor = deref({ mapping }, previous)
    const context = shift(descriptor, previous, { source: value })

    const val = await map(descriptor, context)

    const pattern = /\{\{([^\}]+)\}\}/g
    return template.replace(pattern, (_, param) => {
      return val[param] || ''
    })
  }

  return value
}

function transformValue(descriptor, value, context) {
  const transformers = context.transformers

  // suppose we have a descriptor like this
  // {
  //   source: /something
  //   transform:
  //     - pluck: /pointer/to/prop
  //     - split: ", "
  //     - slice:
  //         - 1
  //         - 3
  //     - pop
  //     - trim
  //
  //
  // }
  if (Array.isArray(descriptor.transform)) {
    // descriptor.transform is an array
    const descriptors = descriptor.transform
    let result = value

    for (const desc of descriptors) {
      if (typeof desc === 'string') {
        const fn = transformers[desc]

        if (fn) {
          result = fn(result, context)
        }
      } else if (typeof desc === 'object') {
        for (let key of Object.keys(desc)) {
          const fn = transformers[key]

          if (fn) {
            const options = { ...desc }
            result = fn(result, context, options)
          }
        }
      }
    }

    return result
  } else if (descriptor.transform) {
    // descriptor.transform is a string
    const fn = transformers[descriptor.transform]

    if (fn) {
      return fn(value, context)
    }
  }

  // INVESTIGATE: most likely this case is causing the weirdness with some mappings
  return value
}

/**
 * random
 */
function selectRandom(descriptor, value, context) {
  const { random, unique } = descriptor
  const { errors } = context

  const select = (collection, min, max) => {
    const index = Math.floor(Math.random() * (max - min + 1) + min)
    return collection[index]
  }

  if (random && Array.isArray(value)) {
    const min = 0
    const max = value.length - 1

    if (unique && random > new Set(value).size) {
      complain(errors, descriptor, {
        value,
        random,
        message: `cannot select ${random} unique members`
      })
      return undefined
    }

    if (random > 1) {
      const selected = []

      while (selected.length < random) {
        const item = select(value, min, max)
        const included = selected.includes(item)

        if (!unique || (unique && !included)) {
          selected.push(item)
        }
      }

      return selected
    } else if (random === 1) {
      return select(value, min, max)
    }
  }

  return value
}

function complain(errors, descriptor, error) {
  const { source, target, input, output } = descriptor

  if (source !== undefined) return errors.push({ source, ...error })
  if (target !== undefined) return errors.push({ target, ...error })
  if (input !== undefined) return errors.push({ input, ...error })
  if (output !== undefined) return errors.push({ output, ...error })

  errors.push(error)
}

function validateType(descriptor, value, errors) {
  const { type } = descriptor
  // ...
  if (value !== undefined && type !== undefined) {
    if (type === 'array' && !Array.isArray(value)) {
      complain(errors, descriptor, { value, type, message: `must be an array` })
    }

    if (type === 'boolean' && typeof value !== 'boolean') {
      complain(errors, descriptor, { value, type, message: `must be true or false` })
    }

    if (type === 'integer' && !Number.isInteger(value)) {
      complain(errors, descriptor, { value, type, message: `must be an integer` })
    }

    if (type === 'null' && value !== null) {
      complain(errors, descriptor, { value, type, message: `must be null` })
    }

    if (type === 'number' && typeof value !== 'number') {
      complain(errors, descriptor, { value, type, message: `must be a number` })
    }

    if (type === 'object' && (typeof value !== 'object' || Array.isArray(value) || value === null)) {
      complain(errors, descriptor, { value, type, message: `must be an object` })
    }

    if (type === 'string' && typeof value !== 'string') {
      complain(errors, descriptor, { value, type, message: `must be a string` })
    }
  }
}

function validateMaximum(descriptor, value, errors) {
  const { maximum } = descriptor

  if (typeof maximum === 'number' && typeof value === 'number' && value > maximum) {
    complain(errors, descriptor, { value, maximum, message: `cannot be greater than ${maximum}` })
  }
}

function validateMinimum(descriptor, value, errors) {
  const { minimum } = descriptor

  if (typeof minimum === 'number' && typeof value === 'number' && value < minimum) {
    complain(errors, descriptor, { value, minimum, message: `cannot be less than ${minimum}` })
  }
}

function validateMultipleOf(descriptor, value, errors) {
  const { multipleOf } = descriptor

  if (typeof multipleOf === 'number' && typeof value === 'number') {
    const decimals = (n) => (n.toString().split('.')[1] || '').length
    const pow = Math.pow(10, Math.max(decimals(value), decimals(multipleOf)))

    if (Math.round(value * pow) % Math.round(multipleOf * pow) !== 0) {
      complain(errors, descriptor, { value, multipleOf, message: `must be a multiple of ${multipleOf}` })
    }
  }
}

function validateMinLength(descriptor, value, errors) {
  const { minLength } = descriptor

  if (typeof minLength === 'number' && typeof value === 'string' && value.length < minLength) {
    complain(errors, descriptor, { value, minLength, message: `cannot be less than ${minLength} characters` })
  }
}

function validateMaxLength(descriptor, value, errors = []) {
  const { maxLength } = descriptor

  if (typeof maxLength === 'number' && typeof value === 'string' && value.length > maxLength) {
    complain(errors, descriptor, { value, maxLength, message: `cannot be more than ${maxLength} characters` })
  }
}

function validateEnum(descriptor, value, errors) {
  if (value !== undefined && descriptor.enum?.indexOf(value) === -1) {
    complain(errors, descriptor, {
      value,
      enum: descriptor.enum,
      message: `must be one of ${JSON.stringify(descriptor.enum)}`
    })
  }
}

function validatePattern(descriptor, value, errors) {
  const { pattern } = descriptor

  if (typeof value === 'string' && !new RegExp(pattern).test(value)) {
    complain(errors, descriptor, { value, pattern, message: `must match pattern` })
  }
}

function validateRequired(descriptor, value, errors) {
  const { required } = descriptor

  if (required && value === undefined) {
    complain(errors, descriptor, { required, message: `required value` })
  }
}

function as(descriptor, value) {
  const { as } = descriptor

  if (value === undefined) {
    return undefined
  }

  if (as === 'string') {
    return value.toString()
  }

  if (as === 'number') {
    return Number(value)
  }

  if (as === 'boolean') {
    return Boolean(value)
  }

  if (as === 'json') {
    return JSON.stringify(value)
  }

  return value
}

/**
 * extend
 *
 * Mutually recursive with merge
 */
export function extend(descriptor, context) {
  const { $extend } = descriptor

  if ($extend) {
    const parent = deref($extend, context)

    if (!parent) {
      throw new Error(`Unknown mapping "${$extend}"`)
    }

    return merge(parent, descriptor, context)
  } else {
    return descriptor
  }
}

/**
 * merge
 *
 * Mutually recursive with extend
 */
function merge(parent, descriptor, context) {
  const { $id, $extend, description } = descriptor
  const mapping = {}
  const ancestor = extend(parent, context)
  const am = ancestor.mapping
  const dm = descriptor?.mapping || {}
  const m = { ...am, ...dm }
  const amKeys = Object.keys(am) // ancestor mapping keys
  const dmKeys = Object.keys(dm) // descriptor mapping keys
  const allKeys = amKeys.concat(dmKeys)

  const distinctOrderedKeys = allKeys.reverse().reduce((result, key) => {
    if (!result.includes(key)) result.unshift(key)
    return result
  }, [])

  for (let key of distinctOrderedKeys) {
    mapping[key] = m[key]
  }

  return {
    $id,
    $extend,
    description,
    mapping
  }
}

/**
 * Mapper
 */
export default class Mapper {
  constructor(descriptor, options) {
    this.$id = descriptor.$id
    this.description = descriptor.description
    this.mappings = {}

    for (let mapping of Object.values(descriptor.mappings || {})) {
      this.add(mapping)
    }

    // extend
    for (let descriptor of Object.values(this.mappings)) {
      const $id = descriptor.$id
      const extended = extend(descriptor, { mappings: this.mappings })
      this.mappings[$id] = extended
    }

    // extend all registered mappings here?

    Object.defineProperties(this, {
      initializers: { value: options.initializers },
      transformers: { value: options.transformers },
      plugins: { value: options.plugins }
    })
  }

  /**
   * add
   */
  add(descriptor) {
    const $id = descriptor?.$id

    if ($id) {
      this.mappings[$id] = descriptor
    }
  }

  /**
   * map
   */
  async map(descriptor, input, initial) {
    const errors = []
    const context = {
      input,
      errors,
      mappings: this.mappings,
      initializers: this.initializers,
      transformers: this.transformers,
      plugins: this.plugins,
      ...initial
    }

    let wrapped

    if (typeof descriptor === 'object' && descriptor.mappings) {
      let mappings = Object.values(descriptor.mappings)

      for (let mapping of mappings) {
        this.add(mapping)
      }

      wrapped = mappings.pop().$id
    } else if (typeof descriptor === 'object' && !descriptor.mapping) {
      wrapped = { mapping: descriptor }
    } else {
      wrapped = descriptor
    }

    //let wrapped = typeof descriptor === 'object' && !descriptor.mapping ? { mapping: descriptor } : descriptor

    if (Array.isArray(input)) {
      context.input = { items: input }
      wrapped = { mapping: { '/items': { source: '/items', each: wrapped } } }
    }

    // invoke map
    const result = await map(wrapped, context)
    const valid = errors.length < 1

    return { ...result, valid, errors }
  }
}
