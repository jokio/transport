import { nats } from '../deps.ts'
import {
  ExecuteProps,
  // FailedMessage,
  // FireAndForgetHandler,
  MessageMetadata,
  MetadataReducer,
  // normalizeError,
  PublishProps,
  // RawHandler,
  // Referrer,
  RouteHandler,
  Transport,
  TransportContext,
  TransportFailedMessage,
  TransportMessage,
  TransportOptions,
  TransportState,
  TransportUtils,
  // TransportUtils,
} from './transport.ts'
import { delay } from './utils/delay.ts'
import { TransportRpcError } from './utils/transportRpc.error.ts'
// import { delay, logger } from "@jok/shared/utils";
// import type {
//   Authenticator,
//   Codec,
//   ConnectionOptions,
//   NatsConnection,
//   Subscription,
// } from "nats.ws/nats.js";

// export type ConnectionStatus =
//   | 'CONNECTED'
//   | 'DISCONNECTED'
//   | 'RECONNECTED'
//   | 'RECONNECTING'

// export type ConnectionStatusChangeAction = (
//   status: ConnectionStatus,
// ) => void

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

export class NatsTransport implements Transport {
  get state(): TransportState {
    return this._state
  }
  _state: TransportState = 'DISCONNECTED'

  private nc: nats.NatsConnection | null = null
  private sc: nats.Codec<string>
  private routeSubscriptions = new Map<string, nats.Subscription[]>()
  private readonly routePostfix

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

      /**
       * By default will be selected NONE
       */
      authentication?: Authenticatior

      routePostfix?: string
    },
    protected utils: TransportUtils = {
      jsonDecode: JSON.parse,
      jsonEncode: JSON.stringify,
    },
  ) {
    this.sc = this.options.StringCodec()
    this.routePostfix = this.options.routePostfix ?? ''
  }

  async init() {}

  async start(
    props: {
      authentication?: Authenticatior
      onConnectionStatusChange?: (status: TransportState) => void
      metadataReducers?: MetadataReducer<MessageMetadata>[]
      natsServerUrls?: string[] | string
    } = {},
  ) {
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

      // logger.info(`connected ${this.nc.getServer()}`)

      if (onConnectionStatusChange) {
        this._state = 'CONNECTED'
        onConnectionStatusChange('CONNECTED')
      }

      for await (const s of this.nc.status()) {
        // logger.info(`${s.type}: ${JSON.stringify(s.data)}`)

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
  }

  on(
    route: string,
    action: RouteHandler<MessageMetadata>,
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

    const subscription = this.nc.subscribe(finalRoute, {
      queue: options?.queueGroup,
      callback: async (err, msg) => {
        // logger.verbose('nats.transport -> on call', {
        //   route,
        // })

        if (err) {
          // logger.warn('error', { error: err.toString() })
          return
        }

        let metadata: MessageMetadata = <any>{}
        let payload: any = {}
        let subject

        try {
          const dataString = this.sc.decode(msg.data)
          const data = this.utils.jsonDecode(dataString)

          const connectionData = (
            msg as any
          ).publisher?.options?.authenticator()

          console.log('whats connectionData', connectionData)

          if (options?.readRawMessage) {
            await action(
              { route: msg.subject, metadata: <any>{} },
              <any>data,
            )

            // logger.verbose(
            //   'nats.transport -> readRawMessage completed successfully',
            //   { route, data },
            // )
            return
          }

          const subjectParts = msg.subject.split('.')

          subject = subjectParts
            .slice(0, subjectParts.length - 2)
            .join('.')
          metadata = data.metadata
          payload = data.payload

          const senderUserId = subjectParts[subjectParts.length - 2]
          const senderSessionId =
            subjectParts[subjectParts.length - 1]

          const metadataWithUserInfo = {
            ...(metadata as any),
            userId: senderUserId,
            sessionId: senderSessionId,
            connectionId: msg.sid,
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
            {
              route: subject,
              metadata: finalMetadata,
            },
            ...(Array.isArray(payload) ? payload : [payload]),
          )

          // logger.verbose(
          //   'nats.transport -> action completed successfully',
          //   action,
          //   { route, data },
          // )

          if (msg.reply) {
            msg.respond(
              this.sc.encode(
                this.utils.jsonEncode({
                  metadata: <any>{},
                  payload: result,
                }),
              ),
            )
          }

          // fire and forget
          // this.fireOnEvery(subject, payload, finalMetadata)
        } catch (err: any) {
          // logger.debug('error on message', {
          //   error: err.toString(),
          // })

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

          this.nc!.publish(
            `failed.${msg.subject}`,
            this.sc.encode(
              this.utils.jsonEncode({
                metadata: <any>{},
                payload: errorPayload,
              }),
            ),
          )

          if (msg.reply) {
            msg.respond(
              this.sc.encode(
                this.utils.jsonEncode({
                  metadata: <any>{},
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

  publish(props: PublishProps<MessageMetadata>): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS_NOT_STARTED')
    }

    const { route, payload, metadata = {}, callerCtx } = props

    const finalRoute = !this.routePostfix
      ? route
      : `${route}.${this.routePostfix}`

    const finalMetadata = this.options.metadataReducers?.length
      ? this.mergeMetadata({
          metadataReducers: this.options.metadataReducers,

          ctx: <any>callerCtx,
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
          metadata: <any>finalMetadata,
        }),
      ),
    )

    return Promise.resolve()
  }

  async execute(props: ExecuteProps<MessageMetadata>) {
    if (!this.nc) {
      throw new Error('NATS_NOT_STARTED')
    }

    const {
      route,
      payload,
      metadata = {},
      callerCtx,
      rpcTimeout,
    } = props

    const timeout =
      rpcTimeout ?? this.options.defaultRpcTimeout ?? 1000

    const finalRoute = !this.routePostfix
      ? route
      : `${route}.${this.routePostfix}`

    const finalMetadata = this.options.metadataReducers?.length
      ? this.mergeMetadata({
          metadataReducers: this.options.metadataReducers,

          ctx: <any>callerCtx,
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

    // check if it's an error
    const resultAsError = <TransportFailedMessage>(result as unknown)
    if (resultAsError.errorData) {
      throw new TransportRpcError(resultAsError)
    }

    return result.payload as any
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

  // private fireOnEvery(route: string, payload: any, metadata: any) {
  //   const tasks = this.onEveryActions
  //     .filter(x => x.prefixes.some(y => route.startsWith(y)))
  //     .map(x => x.action({ route, metadata, payload }))

  //   // eslint-disable-next-line @typescript-eslint/no-floating-promises
  //   Promise.allSettled(tasks)
  // }

  async dispose() {
    if (this.state !== 'CONNECTED' && this.state !== 'RECONNECTED') {
      return
    }

    await this.stop()
  }
}
