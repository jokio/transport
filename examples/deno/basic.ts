import { NatsTransport } from 'https://deno.land/x/jok_transport@v1.0.0/mod.ts'
import {
  StringCodec,
  connect,
} from 'https://deno.land/x/nats@v1.22.0/src/mod.ts'

const transport = new NatsTransport({
  StringCodec,
  connect,
  natsServerUrls: ['nats://localhost:4222'],
})

await transport.init()

await transport.start()

transport.on('test', (ctx, x) => {
  console.log('received', ctx, x)

  return 1
})

const result = await transport.execute(
  'test',
  { somethig: 123 },
)

console.log('result', result)
