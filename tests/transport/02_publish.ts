import { assertEquals, assertExists } from '../test.deps.ts'
import type {
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

      transport.publish(route, data)

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

        type Result = {
          ctx: TransportContext<DefaultMessageMetadata>
          route: string
        }

        const resultTask = new Promise<Result>(resolve =>
          transport.on(route, ctx => {
            resolve(<Result>{
              ctx,
              route,
            })
          }),
        )

        transport.publish(route, data)

        const result = await resultTask

        assertExists(result)
        assertEquals(result.route, route)
        assertEquals(result.ctx.metadata.userId, undefined)
        assertEquals(result.ctx.metadata.sessionId, undefined)
      }),
  )
}
