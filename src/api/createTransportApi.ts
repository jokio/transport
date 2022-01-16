import {
  MessageMetadata,
  Transport,
  TransportContext,
} from '../transport.ts'
import { recursiveApiCaller } from './recursiveApiCaller.ts'
import { Api, TransportApi, TransportApiOptions } from './types.ts'

export function createTransportApi<TApi>(
  transport: Transport,
  metadata?: MessageMetadata,
  callerCtx?: TransportContext<MessageMetadata>,
): TransportApi<TApi & Api> {
  return {
    execute: transportApi(transport, {
      mode: 'EXECUTE',
      metadata,
      callerCtx,
    }),

    publish: transportApi(transport, {
      mode: 'PUBLISH',
      metadata,
      callerCtx,
    }),

    config: (c: { rpcTimeout?: number }) => ({
      execute: transportApi(transport, {
        mode: 'EXECUTE',
        metadata,
        callerCtx,
        rpcTimeout: c.rpcTimeout,
      }),
    }),
  }
}

function transportApi<TApi>(
  transport: Transport,
  options: TransportApiOptions,
): TApi {
  return recursiveApiCaller(transport, options) as unknown as TApi
}
