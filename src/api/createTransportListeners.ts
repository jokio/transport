// deno-lint-ignore-file no-explicit-any
import type { MessageMetadata, Transport } from '../transport.ts'
import type { Api, TransportHandlerMap } from './types.ts'
import { propertiesListWithLeafs } from './propertiesListWithLeafs.ts'
import { createTransportApi } from './createTransportApi.ts'

export async function createTransportListeners<TContext = unknown>(
  transport: Transport,
  handlerMap: Record<
    string,
    (
      ctx: { metadata: MessageMetadata } & TContext,
      ...args: any[]
    ) => any | Promise<any>
  > & {
    rawMessages?: Record<
      string,
      (
        ctx: { metadata: MessageMetadata } & TContext,
        ...args: any[]
      ) => any | Promise<any>
    >
  },
  ctx?: TContext,
): Promise<() => void> {
  await transport.isConnected

  const { rawMessages, ...restMapping } = handlerMap

  const unsubscribes: any[] = []

  for (const route in restMapping) {
    transport.on(route, (msgCtx, payload) => {
      const fn = restMapping[route]

      const innerCtx = {
        ...ctx,
        metadata: msgCtx.metadata,
      }

      const args = Array.isArray(payload) ? payload : [payload]

      const disposeFn = fn(innerCtx as any, ...args)
      unsubscribes.push(disposeFn)
    })
  }

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
