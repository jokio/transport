import { assertEquals } from '../test.deps.ts'
import { Transport } from '../../src/transport.ts'
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
}
