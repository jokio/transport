// deno-lint-ignore-file
import type { nats } from '../deps.ts'
import type {
  MessageMetadata,
  MetadataReducer,
  RouteHandler,
  TransportContext,
  TransportFailedMessage,
  TransportMessage,
  TransportOptions,
  TransportState,
  TransportUtils,
  PublishOptions,
  ExecuteOptions,
  Transport,
} from './transport.ts'
import { delay } from './utils/delay.ts'
import { TransportRpcError } from './utils/transportRpc.error.ts'

export type Authenticatior =
  | { type: 'NONE' }
  | { type: 'NKEYS'; authenticator: nats.Authenticator }
  | { type: 'TOKEN'; token: string }
  | { type: 'CREDENTIALS'; username: string; password: string }

/**
 * Features:
 * - on should be done after starting the transport
 * - on can have the route pattern
 * - no need to `init` & `destroy`, just `start` and `stop`
 * - support reading raw messages
 * - retry on 503 (No Responder) error, after timeout/2
 */

export class NatsTransport<
  TPublishApi,
  TSubscribeApi = TPublishApi,
  TContext = {},
> implements Transport
{
  get state(): TransportState {
    return this._state
  }
  private _state: TransportState = 'DISCONNECTED'

  private nc: nats.NatsConnection | null = null
  private sc: nats.Codec<string>
  private routeSubscriptions = new Map<string, nats.Subscription[]>()
  private routePostfix = ''

  private isConnectedResolver = (_: boolean) => {}
  public isConnected: Promise<boolean> = new Promise(
    resolve => (this.isConnectedResolver = resolve),
  )

  constructor(
    protected options: TransportOptions & {
      connect: (
        opts?: nats.ConnectionOptions,
      ) => Promise<nats.NatsConnection>
      StringCodec: () => nats.Codec<string>

      connectionName?: string

      /** array of urls to connect to, may optionally contain username and password or token encoded in the url */
      natsServerUrls?: string[] | string
      maxPingOut?: number
      noEcho?: boolean
      queueGroup?: string
      debugMode?: boolean
      failedMessageRoute?: string

      /**
       * By default will be selected NONE
       */
      authentication?: Authenticatior
    },
    protected utils: TransportUtils = {
      jsonDecode: JSON.parse,
      jsonEncode: JSON.stringify,
    },
  ) {
    this.sc = this.options.StringCodec()

    this.options.failedMessageRoute =
      this.options.failedMessageRoute ?? `failed.{{messageSubject}}`
  }

  init(data?: { userId: string; sessionId: string }): Promise<void> {
    const { userId = '', sessionId = '' } = data ?? {}

    this._state = 'INITIALISED'
    this.routePostfix =
      userId && sessionId ? `${userId}.${sessionId}` : ''

    return Promise.resolve()
  }

  async start(
    props: {
      authentication?: Authenticatior
      onConnectionStatusChange?: (status: TransportState) => void
      metadataReducers?: MetadataReducer<MessageMetadata>[]
      natsServerUrls?: string[] | string
    } = {},
  ) {
    if (
      this._state !== 'INITIALISED' &&
      this._state !== 'DISCONNECTED'
    ) {
      throw new Error('INVALID_STATE_TO_START')
    }

    if (props.metadataReducers?.length) {
      this.options.metadataReducers = (
        this.options.metadataReducers ?? []
      ).concat(props.metadataReducers)
    }

    const {
      connect,
      authentication = { type: 'NONE' },
      onConnectionStatusChange,
      natsServerUrls = [],
    } = {
      ...this.options,
      ...props,
    }

    this._state = 'CONNECTING'

    this.nc = await connect({
      servers: natsServerUrls,
      name: this.options.connectionName,
      maxPingOut: this.options.maxPingOut ?? 5,
      // we want to receive our own events, just in case
      noEcho: this.options.noEcho ?? false,
      reconnect: true,
      verbose: true,
      waitOnFirstConnect: true,
      maxReconnectAttempts: -1,

      authenticator:
        authentication.type === 'NKEYS'
          ? authentication.authenticator
          : undefined,

      user:
        authentication.type === 'CREDENTIALS'
          ? authentication.username
          : undefined,

      pass:
        authentication.type === 'CREDENTIALS'
          ? authentication.password
          : undefined,

      token:
        authentication.type === 'TOKEN'
          ? authentication.token
          : undefined,
    })

    // monitor status changes
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
      if (!this.nc) {
        return
      }

      if (this.options.debugMode) {
        console.info(`connected ${this.nc.getServer()}`)
      }

      this._state = 'CONNECTED'
      if (onConnectionStatusChange) {
        onConnectionStatusChange('CONNECTED')
      }

      this.isConnectedResolver(true)

      for await (const s of this.nc.status()) {
        if (this.options.debugMode) {
          console.info(`${s.type}: ${JSON.stringify(s.data)}`)
        }

        if (!onConnectionStatusChange) {
          continue
        }

        switch (s.type) {
          case 'reconnect':
            this._state = 'RECONNECTED'
            onConnectionStatusChange('RECONNECTED')
            break

          case 'disconnect':
            this._state = 'DISCONNECTED'
            onConnectionStatusChange('DISCONNECTED')
            break

          case 'reconnecting':
            this._state = 'RECONNECTING'
            onConnectionStatusChange('RECONNECTING')
            break
        }
      }
    })().then()
  }

  async stop() {
    if (!this.nc) {
      throw new Error('NATS_NOT_STARTED')
    }

    await this.nc.flush()
    await this.nc.drain()
    await this.nc.close()

    this._state = 'DISCONNECTED'
  }

  // [K in keyof T]?: (
  //   data: T[K],
  //   ctx?: {
  //     metadata: TMetadata
  //   } & TContext,
  // ) => void | Promise<void>

  on<K extends keyof TSubscribeApi & string>(
    route: K,
    action: RouteHandler<TSubscribeApi[K], MessageMetadata>,
    options?: { queueGroup?: string; readRawMessage?: boolean },
  ): () => void {
    if (!this.nc) {
      throw new Error('NATS_NOT_STARTED')
    }

    const finalRoute =
      route.endsWith('.>') ||
      !this.routePostfix ||
      route.startsWith('$SYS')
        ? route
        : `${route}.>`

    if (this.options.debugMode) {
      console.log('on', finalRoute, '✅')
    }

    const subscription = this.nc.subscribe(finalRoute, {
      queue: options?.queueGroup ?? this.options?.queueGroup,
      callback: async (err, msg) => {
        if (this.options.debugMode) {
          console.info('nats.transport -> on call', {
            route,
          })
        }

        if (err) {
          if (this.options.debugMode) {
            console.warn('error', { error: err.toString() })
          }
          return
        }

        let metadata: MessageMetadata = {}
        let payload: unknown = {}
        let subject

        try {
          const dataString = this.sc.decode(msg.data)
          const data = this.utils.jsonDecode(dataString)

          if (options?.readRawMessage) {
            await action(
              // deno-lint-ignore no-explicit-any
              data as any,
              {
                route: msg.subject,
                originalRoute: msg.subject,
                metadata: {},
              },
            )

            if (this.options.debugMode) {
              console.info(
                'nats.transport -> readRawMessage completed successfully',
                { route, data },
              )
            }
            return
          }

          const subjectParts = msg.subject.split('.')

          subject = this.routePostfix
            ? subjectParts.slice(0, subjectParts.length - 2).join('.')
            : subjectParts.join('.')

          metadata = data.metadata
          payload = data.payload

          const senderUserId = this.routePostfix
            ? subjectParts[subjectParts.length - 2]
            : undefined

          const senderSessionId = this.routePostfix
            ? subjectParts[subjectParts.length - 1]
            : undefined

          const metadataWithUserInfo = {
            ...metadata,
            userId: senderUserId,
            sessionId: senderSessionId,
          }

          if (this.options.metadataValidator?.length) {
            for (const validator of this.options.metadataValidator) {
              validator(subject, { metadata, payload })
            }
          }

          const finalMetadata = this.options
            .metadataReducersAfterReceive
            ? this.mergeMetadata({
                metadataReducers:
                  this.options.metadataReducersAfterReceive,

                route: subject,
                message: {
                  payload,
                  metadata: metadataWithUserInfo,
                },
              })
            : metadataWithUserInfo

          const result = await action(
            // deno-lint-ignore no-explicit-any
            payload as any,
            {
              route: subject,
              originalRoute: msg.subject,
              metadata: finalMetadata,
            },
          )

          if (this.options.debugMode) {
            console.info(
              'nats.transport -> action completed successfully',
              action,
              { route, data },
            )
          }

          if (msg.reply) {
            msg.respond(
              this.sc.encode(
                this.utils.jsonEncode({
                  metadata: {},
                  payload: result,
                }),
              ),
            )
          }

          // fire and forget
          // this.fireOnEvery(subject, payload, finalMetadata)
          // deno-lint-ignore no-explicit-any
        } catch (err: any) {
          if (this.options.debugMode) {
            console.warn('error on message', {
              error: err.toString(),
            })
          }

          const errorPayload = <TransportFailedMessage>{
            route: msg.subject,
            message: {
              metadata,
              payload,
            },
            errorData: {
              message: err.message,
              callStack: err.stack,
              className: err.constructor.name,
            },
          }

          if (this.options.failedMessageRoute) {
            const failedMessageRoute =
              this.options.failedMessageRoute.replace(
                '{{messageSubject}}',
                msg.subject,
              )

            this.nc!.publish(
              failedMessageRoute,
              this.sc.encode(
                this.utils.jsonEncode({
                  metadata: {},
                  payload: errorPayload,
                }),
              ),
            )
          }

          if (msg.reply) {
            msg.respond(
              this.sc.encode(
                this.utils.jsonEncode({
                  metadata: {},
                  payload: errorPayload,
                }),
              ),
            )
          }
        }
      },
    })

    // keep subscription in Map
    const currentSubscriptions =
      this.routeSubscriptions.get(route) ?? []

    this.routeSubscriptions.set(
      route,
      currentSubscriptions.concat(subscription),
    )

    return () => {
      subscription.unsubscribe()
    }
  }

  off(route: string): void {
    const subs = this.routeSubscriptions.get(route)
    if (subs?.length) {
      subs.forEach(x => x.unsubscribe())
    }
  }

  /**
   * Subscribes multple events and returns back one dispose function for all of them.
   * Internally uses `on` api to subscribe individual events
   *
   * @returns dispose function
   */
  async subscribeEvents<TOverrideApi = TSubscribeApi>(
    handlerMap: Map1<
      TOverrideApi,
      TContext | TransportContext<MessageMetadata>
    >,
    options?: {
      readRawMessage?: boolean
      ctx?: TContext
    },
  ): Promise<() => void> {
    await this.isConnected

    const unsubscribes = Object.entries(handlerMap).map(
      ([route, handler]) => {
        // to listen low level messages
        return this.on(
          route as any,
          (x, ctx) => {
            const innerCtx = {
              ...options?.ctx,
              ...ctx,
            }

            // deno-lint-ignore no-explicit-any
            ;(handler as any)(x, innerCtx as any)
          },
          { readRawMessage: options?.readRawMessage ?? false },
        )
      },
    )

    return () => {
      unsubscribes.forEach(x => x())
    }
  }

  async subscribe(
    getActions: (
      transport: NatsTransport<TPublishApi, TSubscribeApi, TContext>,
    ) => (() => void)[],
  ): Promise<() => void> {
    await this.isConnected

    const unsubscribes = getActions(this)

    return () => {
      unsubscribes.forEach(x => x())
    }
  }

  publish<K extends keyof TPublishApi & string>(
    route: K,
    payload: TPublishApi[K],
    options: PublishOptions<MessageMetadata> = {},
  ): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS_NOT_STARTED')
    }

    const { metadata = {}, callerCtx } = options

    const finalRoute = !this.routePostfix
      ? route
      : `${route}.${this.routePostfix}`

    const finalMetadata = this.options.metadataReducers?.length
      ? this.mergeMetadata({
          metadataReducers: this.options.metadataReducers,

          ctx: callerCtx,
          route,
          message: {
            payload,
            metadata: metadata,
          },
        })
      : metadata

    this.nc.publish(
      finalRoute,
      this.sc.encode(
        this.utils.jsonEncode({
          payload,
          metadata: finalMetadata,
        }),
      ),
    )

    return Promise.resolve()
  }

  async execute<K extends keyof TPublishApi & string, TResult>(
    route: K,
    payload: TPublishApi[K],
    options: ExecuteOptions<MessageMetadata> = {},
  ): Promise<TResult> {
    if (!this.nc) {
      throw new Error('NATS_NOT_STARTED')
    }

    const { metadata = {}, callerCtx, rpcTimeout } = options

    const timeout =
      rpcTimeout ?? this.options.defaultRpcTimeout ?? 1000

    const finalRoute = !this.routePostfix
      ? route
      : `${route}.${this.routePostfix}`

    const finalMetadata = this.options.metadataReducers?.length
      ? this.mergeMetadata({
          metadataReducers: this.options.metadataReducers,

          ctx: callerCtx,
          route,
          message: {
            payload,
            metadata: metadata,
          },
        })
      : metadata

    let response: nats.Msg

    try {
      response = await this.nc.request(
        finalRoute,
        this.sc.encode(
          this.utils.jsonEncode({
            payload,
            metadata: finalMetadata,
          }),
        ),
        { timeout },
      )
      // deno-lint-ignore no-explicit-any
    } catch (err: any) {
      switch (err.code) {
        case '503':
          {
            await delay(timeout / 2)

            response = await this.nc!.request(
              finalRoute,
              this.sc.encode(
                this.utils.jsonEncode({
                  payload,
                  metadata: finalMetadata,
                }),
              ),
              { timeout },
            )
          }
          break

        default:
          throw err
      }
    }

    const result = this.utils.jsonDecode(
      this.sc.decode(response.data),
    )

    const resultPayload = result.payload

    // check if it's an error
    const resultAsError = <TransportFailedMessage>(
      (resultPayload as unknown)
    )
    if (resultAsError?.errorData) {
      throw new TransportRpcError(resultAsError)
    }

    return result.payload as TResult
  }

  // helper functions
  private mergeMetadata(context: {
    metadataReducers: MetadataReducer<MessageMetadata>[]
    ctx?: TransportContext<MessageMetadata>
    route: string
    message: TransportMessage
  }): MessageMetadata {
    const {
      ctx,
      route,
      message,

      metadataReducers,
    } = context

    const merged = metadataReducers.reduce((meta, fn) => {
      const x = fn(ctx ?? null, route, {
        payload: message.payload,
        metadata: meta,
      })

      return {
        ...meta,
        ...x,
      }
    }, message.metadata)

    return merged
  }

  async dispose() {
    if (this.state !== 'CONNECTED' && this.state !== 'RECONNECTED') {
      return
    }

    await this.stop()
  }
}

// deno-lint-ignore no-explicit-any
type Map1<T, TContext, TMetadata = any> = {
  [K in keyof T]?: (
    data: T[K],
    ctx?: {
      metadata: TMetadata
    } & TContext,
  ) => void | Promise<void>
}
