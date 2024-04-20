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
  PublishOptions,
  ExecuteOptions,
} from './src/transport.ts'

export {
  NatsTransport,
  type Authenticatior,
} from './src/nats.transport.ts'

import {
  callStackReducer,
  type CallStackMetadata,
} from './src/metadataReducers/callStack.reducer.ts'
import {
  createdAtReducer,
  type CreatedAtMetadata,
} from './src/metadataReducers/createdAt.reducer.ts'
import {
  transactionIdReducer,
  type TransactionMetadata,
} from './src/metadataReducers/transactionId.reducer.ts'
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

export type {
  CreatedAtMetadata,
  CallStackMetadata,
  TransactionMetadata,
}

export { createTransportApi } from './src/api/createTransportApi.ts'
export { createTransportClassHandlers } from './src/api/createTransportClassHandlers.ts'
export { createTransportHandlerMap } from './src/api/createTransportHandlerMap.ts'
export type {
  TransportApiContext,
  TransportApi,
} from './src/api/types.ts'
