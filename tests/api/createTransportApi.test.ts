import { createTransportApi } from '../../src/api/createTransportApi.ts'
import { createTransportHandlerMap } from '../../src/api/createTransportHandlerMap.ts'
import { NatsTransport } from '../../src/nats.transport.ts'
import { withTransport } from '../common.ts'
import { nats } from '../../deps.ts'
import { assertEquals } from '../test.deps.ts'
import type { TransportApiContext } from '../../src/api/types.ts'

const transport = new NatsTransport({
  natsServerUrls: ['nats://127.0.0.1:4222'],
  StringCodec: nats.StringCodec,
  connect: nats.connect,
})

type Api1 = {
  A: {
    B: {
      C: (a: number, b: string) => boolean
    }
  }
}

class Api2 {
  constructor(private ctx: TransportApiContext<Api1>) {}

  method1() {
    return true
  }

  method2(a: number, b: number) {
    return a + b
  }

  method3(props: { username: string; password: string }) {
    if (props.username !== props.password) {
      throw new Error('INVALID_CREDENTIALS')
    }

    return {
      token: 'jwt',
      isSuccess: true,
    }
  }
}

type TApi2 = typeof Api2

Deno.test('api - createTransportApi', () =>
  withTransport(transport, async () => {
    const api = createTransportApi<Api1 & TApi2>(transport)

    createTransportHandlerMap<Api1>(transport, null, {
      A: {
        B: {
          C: (_, a, b) => {
            assertEquals(a, 5)
            assertEquals(b, 'aa')
            return a + b
          },
        },
      },
      rawMessages: {
        ['A.B.C']: _ => {},
      },
    })

    const result1 = await api.publish.A.B.C(6, 'aa')

    const result2 = await api.execute.A.B.C(5, 'aa')

    assertEquals(result1, undefined)
    assertEquals(result2, '5aa')
  }),
)
