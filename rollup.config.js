import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/uv-index-chart-card.ts',
  output: {
    file: 'uv-index-chart-card.js',
    format: 'iife',
    name: 'UVIndexChartCard'
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json'
    }),
    terser({
      output: {
        comments: false
      }
    })
  ],
  external: []
};
