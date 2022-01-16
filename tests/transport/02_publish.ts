import { assertEquals, assertExists } from '../test.deps.ts'
import {
  Transport,
  TransportContext,
  DefaultMessageMetadata,
} from '../../src/transport.ts'
import { withTransport } from '../common.ts'

export function testSuite_02(transport: Transport) {
  Deno.test('publish - should receive the published message', () =>
    withTransport(transport, async () => {
      const route = 'path.to.route'
      const data = 'Hello'

      const resultTask = new Promise(resolve =>
        transport.on(route, (_, payload) => {
          resolve(payload)
        }),
      )

      transport.publish({ route, payload: data })

      const result = await resultTask

      assertEquals(result, data)
    }),
  )

  Deno.test(
    'publish - userId and sessionId shouldn`t be defined',
    () =>
      withTransport(transport, async () => {
        const route = 'path.to.route'
        const data = 'Hello'

        const resultTask = new Promise(resolve =>
          transport.on(route, ctx => {
            resolve({
              ctx,
              route,
            })
          }),
        )

        transport.publish({ route, payload: data })

        const result: any = await resultTask
        const ctx =
          result.ctx as TransportContext<DefaultMessageMetadata>

        assertExists(result)
        assertEquals(result.route, route)
        assertEquals(ctx.metadata.userId, undefined)
        assertEquals(ctx.metadata.sessionId, undefined)
      }),
  )
}
