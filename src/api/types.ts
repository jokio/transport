// deno-lint-ignore-file no-explicit-any
import type { MessageMetadata, TransportContext } from '../transport.ts'

export type Api = Record<string, unknown>

// primary types
export type TransportHandlerMap<
  TApi extends Api,
  TContext,
  TMetadata = any,
> = FullMap<TApi, TApi, TContext, TMetadata> &
  RawMap<TApi, TContext, TMetadata>

// export type CallableApi<T extends ApiWithExecutableKeys> =
//   TransportApi<T['api']>

// helper types
type PickOperator<T, PK> = {
  [K in keyof T]: K extends PK ? K : never
}

type Map1<T, TApi extends Api, TContext, TMetadata = any> = {
  [K in keyof Omit<T, '_'>]: T[K] extends (
    ...args: infer TArgs
  ) => infer TResult
    ? (
        ctx: {
          api: TransportApi<TApi>
          metadata: TMetadata
        } & TContext,
        ...args: TArgs
      ) => TResult | Promise<TResult>
    : T[K] extends Api
    ? FullMap<T[K], TApi, TContext, TMetadata>
    : T[K]
}

type Map2<T, TApi extends Api, TContext, TMetadata = any> = {
  [K in keyof PickOperator<T, '_'>]: T extends Record<
    '_',
    (...args: any[]) => any
  >
    ? Record<
        string,
        FullMap<ReturnType<T['_']>, TApi, TContext, TMetadata>
      >
    : T[K] extends Api
    ? FullMap<T[K], TApi, TContext, TMetadata>
    : never
}

type RawMap<TApi extends Api, TContext, TMetadata> = {
  rawMessages?: {
    [key: string]: (
      ctx: {
        api: TransportApi<TApi>
        metadata: TMetadata
      } & TContext,
      data: any,
    ) => void | Promise<void>
  }
}

type FullMap<
  T extends Api,
  TApi extends Api,
  TContext,
  TMetadata = any,
> = Partial<
  | Map1<T, TApi, TContext, TMetadata>
  | Map2<T, TApi, TContext, TMetadata>
>

// helper
export type TransportApiOptions = {
  mode: 'PUBLISH' | 'EXECUTE'
  rpcTimeout?: number
  metadata?: MessageMetadata
  callerCtx?: TransportContext<MessageMetadata>
}

export type TransportApi<TApi extends Api = Api> = {
  publish: PublishableApi<TApi>
  execute: ExecutableApi<TApi>

  config(
    c: Partial<TransportApiOptions>,
  ): Omit<TransportApi<TApi>, 'config' | 'publish'>
}

export declare type MetadataOperator = '$'
export declare type RouteVariableOperator = '_'
export declare type CustomOperators =
  | MetadataOperator
  | RouteVariableOperator

export declare type ExecutableApi<TApi> = {
  [K in keyof TApi]: TApi[K] extends Record<string, unknown>
    ? ExecutableApi<TApi[K]>
    : K extends CustomOperators
    ? TApi[K] extends (...args: infer TArgs) => infer TResult
      ? (...args: TArgs) => ExecutableApi<TResult>
      : number
    : EnsurePromise<TApi[K]> extends never
    ? ExecutableApi<TApi[K]>
    : EnsurePromise<TApi[K]>
}

export declare type PublishableApi<TApi> = {
  [K in keyof TApi]: TApi[K] extends Api
    ? PublishableApi<TApi[K]>
    : K extends CustomOperators
    ? TApi[K] extends (...args: infer TArgs) => infer TResult
      ? (...args: TArgs) => PublishableApi<TResult>
      : number
    : EnsurePromiseVoid<TApi[K]> extends never
    ? TApi[K]
    : EnsurePromiseVoid<TApi[K]>
}

declare type EnsurePromise<T> = T extends (
  ...args: infer A
) => infer P
  ? P extends Promise<unknown>
    ? (...args: A) => P
    : (...args: A) => Promise<P>
  : never
declare type EnsurePromiseVoid<T> = T extends (
  ...args: infer A
) => infer P
  ? P extends Promise<void>
    ? (...args: A) => P
    : (...args: A) => Promise<void>
  : never

export type TransportApiContext<TApi> = TransportContext & {
  api: TransportApi<TApi & Api>
}
