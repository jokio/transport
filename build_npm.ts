import { build } from 'https://deno.land/x/dnt@0.16.0/mod.ts'

await build({
  entryPoints: ['./mod.ts'],
  outDir: './npm',
  compilerOptions: {},
  typeCheck: false,
  shims: {
    // see JS docs for overview and more options
    deno: true,
  },
  mappings: {
    'https://deno.land/x/nats@v1.4.0/src/mod.ts': {
      name: 'nats.ws',
      version: '1.5.0',
    },
  },
  package: {
    // package.json properties
    name: 'jok_transport',
    version: Deno.args[0],
    description: '🚌 Transport, for your messages',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/jokio/transport.git',
    },
    bugs: {
      url: 'https://github.com/jokio/transport/issues',
    },
  },
})

// post build steps
Deno.copyFileSync('LICENSE', 'npm/LICENSE')
Deno.copyFileSync('README.md', 'npm/README.md')
