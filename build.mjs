// Bundles src/main.js (with three) into assets/lamp3d.js. Run with: npm run build
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'assets/lamp3d.js',
  banner: {
    js: '/* Lamp Portfolio 3D, MIT License. Includes three.js, MIT License. See THIRD_PARTY_LICENSES.md */'
  }
});
console.log('Built assets/lamp3d.js');
