import { build } from 'esbuild';

// The pages already load the shared exercise catalog and motion clock as globals;
// the bundle reads those instead of carrying second copies.
const pageGlobals = {
  name: 'page-globals',
  setup(b) {
    b.onResolve({ filter: /shared\/(motion|exercises)\.js$/ }, (args) => ({ path: args.path.match(/(motion|exercises)\.js$/)[1], namespace: 'page-global' }));
    b.onLoad({ filter: /.*/, namespace: 'page-global' }, (args) => ({
      contents: `module.exports = window.${args.path === 'motion' ? 'StretchMotion' : 'StretchExercises'};`,
      loader: 'js',
    }));
  },
};

await build({
  entryPoints: ['src/guide/index.mjs'],
  outfile: 'src/guide/guide.js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome130'],
  legalComments: 'none',
  banner: { js: '/*! Stretch 3D guide. Includes three.js (MIT License, Copyright 2010-2025 three.js authors). */' },
  plugins: [pageGlobals],
  logLevel: 'warning',
});
console.log('Built 3D guide.');
