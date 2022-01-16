export type {
  Transport,
  TransportOptions,
  TransportUtils,
  TransportState,
  MessageMetadata,
  TransportMessage,
  TransportFailedMessage,
  NormalizedError,
  DefaultMessageMetadata,
  MetadataReducer,
  MetadataValidator,
  RouteHandler,
  TransportContext,
  ExecuteProps,
  PublishProps,
} from './src/transport.ts'

export {
  NatsTransport,
  type Authenticatior,
} from './src/nats.transport.ts'

import { callStackReducer } from './src/metadataReducers/callStack.reducer.ts'
import { createdAtReducer } from './src/metadataReducers/createdAt.reducer.ts'
import { transactionIdReducer } from './src/metadataReducers/transactionId.reducer.ts'
import { callStackValidator } from './src/metadataValidators/callStack.validator.ts'
import { transactionDurationValidator } from './src/metadataValidators/transactionDuration.validator.ts'

export const metadataReducers = {
  transactionIdReducer,
  createdAtReducer,
  callStackReducer,
}

export const metadataValidators = {
  callStackValidator,
  transactionDurationValidator,
}

export type { CallStackMetadata } from './src/metadataReducers/callStack.reducer.ts'
export type { CreatedAtMetadata } from './src/metadataReducers/createdAt.reducer.ts'
export type { TransactionMetadata } from './src/metadataReducers/transactionId.reducer.ts'

export { createTransportApi } from './src/api/createTransportApi.ts'
export { createTransportClassHandlers } from './src/api/createTransportClassHandlers.ts'
export { createTransportHandlerMap } from './src/api/createTransportHandlerMap.ts'
export type {
  TransportApiContext,
  TransportApi,
} from './src/api/types.ts'
