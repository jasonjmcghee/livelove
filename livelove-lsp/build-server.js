const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: ['src/server.ts'],
  outfile: 'bundled/server.js',
  bundle: true,
  minify: false,
  platform: 'node',
  format: 'cjs',
  target: ['node20'],
  sourcemap: false,
  external: [
    // Add any external packages that shouldn't be bundled
    // For example: 'express', 'dotenv', etc.
  ]
});

console.log('Build completed successfully: ./bundled/server.js');
