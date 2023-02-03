import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    lib2: 'src/processor.ts',
  },
  // minify: true,
  sourcemap: 'inline',
  clean: false,
  format: 'esm',
  external: [
    'protobufjs',
    'aptos',
    'aptos-sdk',
    'ethers',
    'bs58',
    'bn.js',
    'csv-parse',
    /^nice-grpc.*$/,
    /^@(ethersproject|solana|project-serum).*$/,
    /^@sentio\/(sdk|runtime|protos|bigdecimal|ethers).*$/,
  ],
})
