// deno-lint-ignore-file no-explicit-any
import type { Transport } from '../transport.ts'
import type { Api, TransportHandlerMap } from './types.ts'
import { propertiesListWithLeafs } from './propertiesListWithLeafs.ts'
import { createTransportApi } from './createTransportApi.ts'

export async function createTransportHandlerMap<
  TApi,
  TContext = unknown,
  TMetadata = any,
>(
  transport: Transport,
  ctx: TContext,
  handlerMap: TransportHandlerMap<TApi & Api, TContext, TMetadata>,
  // queueGroup?: string,
): Promise<() => void> {
  await transport.isConnected

  const { rawMessages, ...mapTree } = handlerMap

  const registeredRoutes = propertiesListWithLeafs(mapTree, ['_'])

  const unsubscribes = registeredRoutes
    .filter(([_, fn]) => typeof fn === 'function')
    .map(([route, fn]) =>
      transport.on(route, (msgCtx, payload) => {
        const api = createTransportApi(transport, {
          metadata: msgCtx.metadata,
        })

        const innerCtx = {
          ...ctx,
          api,
          metadata: msgCtx.metadata,
        }

        const args = Array.isArray(payload) ? payload : [payload]

        return fn(innerCtx, ...args)
      }),
    )

  const rawHandlerUnsubscribes = rawMessages
    ? Object.entries(rawMessages).map(([route, handler]) => {
        // to listen low level messages
        return transport.on(
          route,
          (_, x) => {
            const innerCtx = {
              ...ctx,
              api: (ctx as any)?.api ?? createTransportApi(transport),
              metadata: {},
            }

            handler(innerCtx as any, x)
          },
          { readRawMessage: true },
        )
      })
    : []

  return () => {
    unsubscribes.forEach(x => x())

    rawHandlerUnsubscribes.forEach(x => x())
  }
}
