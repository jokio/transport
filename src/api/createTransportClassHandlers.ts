import { createTransportApi } from './createTransportApi.ts'
import type { Transport } from '../transport.ts'

export async function createTransportClassHandlers(
  prefix: string,
  obj: Record<string, unknown>,
  transport: Transport,
): Promise<() => void> {
  await transport.isConnected

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

        const updatedCtx = {
          ...ctx,
          // override `metadata` and `api` in ctx with new one
          api: createTransportApi(transport, {
            metadata: ctx.metadata,
          }),
        }

        return fn.bind({
          ...obj,
          ctx: updatedCtx,
        })(
          /**
           * ^ Context goes as a property context
           */

          ...(Array.isArray(payload) ? payload : [payload]),
        )
      })
    })

  return () => {
    unsubscribes.forEach(x => x())
  }
}
