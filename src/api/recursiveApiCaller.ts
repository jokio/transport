import type { MessageMetadata, Transport } from '../transport.ts'
import type { TransportApiOptions } from './types.ts'

export type MetadataOperator = '$'
export type RouteVariableOperator = '_'

export const MetadataOperator: MetadataOperator = '$'
export const RouteVariableOperator: RouteVariableOperator = '_'

const joinSymbol = '.'

export function recursiveApiCaller(
  transport: Transport,
  options: TransportApiOptions,

  /** only needed internally, **DO NOT SET** */
  path: string[] = [],
  routeMetadata: Record<string, unknown> = {},
): () => void {
  // make array safe
  return new Proxy(() => undefined, {
    get: (_, propertyName) => {
      return recursiveApiCaller(
        transport,
        options,
        path.concat([String(propertyName)]),
        routeMetadata,
      )
    },

    apply: (_, __, args: unknown[]) => {
      switch (path[path.length - 1]) {
        // handle operators first, api call is default case
        // merge metadata operator
        case MetadataOperator: {
          const mergedMetadata = args.reduce<MessageMetadata>(
            (meta, arg) => ({
              ...meta,
              ...(typeof arg === 'object' && !Array.isArray(arg)
                ? arg
                : {}),
            }),
            routeMetadata,
          )

          return recursiveApiCaller(
            transport,
            options,
            // don't forget to remove the operator!
            path.slice(0, -1),
            mergedMetadata,
          )
        }
        // path variable operator
        case RouteVariableOperator: {
          const route = args.reduce<string[]>(
            (route, arg) =>
              typeof arg === 'string' ? route.concat([arg]) : route,
            path.slice(0, -1),
          )

          return recursiveApiCaller(
            transport,
            options,
            route,
            routeMetadata,
          )
        }
        // actually calling the api
        default: {
          if (!path.length) {
            return
          }

          const {
            metadata: appendMetadata,
            callerCtx,
            mode,
          } = options

          const route = path.join(joinSymbol)

          const isExecutable = mode === 'EXECUTE'

          if (isExecutable) {
            return transport.execute(route, args, {
              metadata: { ...appendMetadata, ...routeMetadata },
              callerCtx,
              rpcTimeout: options.rpcTimeout,
            })
          }

          return transport.publish(route, args, {
            metadata: { ...appendMetadata, ...routeMetadata },
            callerCtx,
          })
        }
      }
    },
  })
}
