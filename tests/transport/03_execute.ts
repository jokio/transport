import { assertEquals, assertRejects } from '../test.deps.ts'
import type { Transport } from '../../src/transport.ts'
import { withTransport } from '../common.ts'
import { TransportRpcError } from '../../src/utils/transportRpc.error.ts'

export function testSuite_03(transport: Transport) {
  Deno.test(
    'execute - should receive the executed message and result',
    () =>
      withTransport(transport, async () => {
        const route = 'path.to.route'
        const data = 'Hello'

        const resultTask = new Promise(resolve =>
          transport.on(route, (payload) => {
            resolve(payload)

            return payload + '123'
          }),
        )

        const executeResultTask = transport.execute(route, data)

        const result = await resultTask
        const executeResult = await executeResultTask

        assertEquals(result, data)
        assertEquals(executeResult, data + '123')
      }),
  )

  Deno.test('execute - should receive error data', () =>
    withTransport(transport, async () => {
      const route = 'path.to.errorRoute'
      const data = 'Hello'

      const resultTask = new Promise<void>(resolve =>
        transport.on(route, () => {
          resolve()

          throw new Error('SomethingHappened')
        }),
      )

      const executeResultTask = transport.execute(route, data)

      await resultTask

      assertRejects(
        () => executeResultTask,
        TransportRpcError,
        'SomethingHappened',
        'RPCError: SomethingHappened',
      )
    }),
  )
}
