import { createTransportApi } from './createTransportApi.ts'
import { Transport } from '../transport.ts'

export function createTransportClassHandlers(
  prefix: string,
  obj: Record<string, unknown>,
  transport: Transport,
) {
  const keys = Reflect.ownKeys(obj.constructor.prototype).filter(
    x => x !== 'constructor',
  )

  if (!keys.length) {
    return () => {}
  }

  const unsubscribes = keys
    .filter(x => typeof x === 'string')
    .map(key => {
      const route = `${prefix}.${key as string}`

      return transport.on(route, (ctx, payload) => {
        if (typeof key === 'symbol') {
          return
        }

        const fn = obj[key]
        if (typeof fn !== 'function') {
          return
        }

        return fn.bind(obj)(
          /**
           * First argument is always context (+ api)
           */
          {
            ...ctx,
            // override `metadata` and `api` in ctx with new one
            api: createTransportApi(transport, {
              metadata: ctx.metadata,
            }),
          },
          ...(Array.isArray(payload) ? payload : [payload]),
        )
      })
    })

  return () => {
    unsubscribes.forEach(x => x())
  }
}
