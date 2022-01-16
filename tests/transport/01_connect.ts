import { Transport } from '../../src/transport.ts'
import { withTransport } from '../common.ts'

export function testSuite_01(transport: Transport) {
  Deno.test('connect to the transport', () =>
    withTransport(transport, async () => {
      // It will try to connect and disconnect
    }),
  )
}
