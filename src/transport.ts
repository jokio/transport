export interface TransportOptions {
  defaultRpcTimeout?: number
  metadataReducers?: MetadataReducer<MessageMetadata>[]
  metadataReducersAfterReceive?: MetadataReducer<MessageMetadata>[]
  metadataValidator?: MetadataValidator[]
  onConnectionStatusChange?: (status: TransportState) => void
}

export interface TransportUtils {
  jsonEncode: (s: TransportMessage) => string
  jsonDecode: (s: string) => TransportMessage
}

export interface Transport {
  readonly state: TransportState

  /**
   * Make sure all entities are initialized
   */
  init(): Promise<void>

  /**
   * At this point all handlers are registered and we can
   * configure Exchange->Queue bindings by calling `start()`
   */
  start(): Promise<void>

  /**
   * Stop connection to the queues
   */
  stop(): Promise<void>

  /**
   * Subscribe to the specific route
   * @param route
   * @param action
   * @param options
   *    groupKey - to group subscriptions so only one in the group will receive the specific message
   *    readRawMessage - set `true` to read the plain message
   */
  on(
    route: string,
    action: RouteHandler<MessageMetadata>,
    options?: { readRawMessage?: boolean },
  ): () => void

  off(route: string): void

  /**
   * Publish event, no result will be returned
   */
  publish(props: PublishProps<MessageMetadata>): Promise<void>

  /**
   * Execute RPC call, result will be returned always
   *
   * throws RPCTimeout error
   */
  execute<TResult = unknown>(
    props: ExecuteProps<MessageMetadata>,
  ): Promise<TResult>

  /**
   * Make sure all resources are disposed
   * Temp queues should be deleted
   */
  dispose(): Promise<void>
}

export type MessageMetadata = Record<string, unknown>

export type DefaultMessageMetadata = {
  userId: string
  sessionId: string
}

export type RouteHandler<TMetadata extends MessageMetadata> = (
  ctx: TransportContext<TMetadata>,
  payload: unknown,
) => Promise<unknown | void> | unknown | void

export type TransportContext<
  TMetadata extends MessageMetadata = DefaultMessageMetadata,
> = {
  /**
   * Full route
   */
  route: string

  /**
   * Request related metadata
   */
  metadata: TMetadata
}

export interface PublishProps<TMetadata extends MessageMetadata> {
  route: string
  payload: unknown
  metadata?: Partial<TMetadata>
  callerCtx?: TransportContext<TMetadata>
}

export interface ExecuteProps<TMetadata extends MessageMetadata> {
  route: string
  payload: unknown
  metadata?: TMetadata
  rpcTimeout?: number
  callerCtx?: TransportContext<TMetadata>
}

export type TransportState =
  | 'INITIALISED'
  | 'CONNECTED'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'RECONNECTED'
  | 'RECONNECTING'

export type MetadataReducer<TMetadata extends MessageMetadata> = (
  callerCtx: TransportContext<TMetadata> | null,
  route: string,
  message: TransportMessage,
) => Partial<TMetadata>

export type MetadataValidator = (
  route: string,
  message: TransportMessage,
) => void

export type TransportMessage = {
  payload: unknown
  metadata: MessageMetadata
}

export type TransportFailedMessage = {
  route: string
  message: TransportMessage
  errorData: NormalizedError
}

export type NormalizedError = {
  message: string
  callStack: string
  className: string
}
