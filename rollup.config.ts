// //@ts-nocheck

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

// const IGNORED_CIRCULAR_DEPENDENCY =
// 	'node_modules/@actions/core/lib/core.js -> node_modules/@actions/core/lib/oidc-utils.js -> node_modules/@actions/core/lib/core.js';

const config = {
	input: 'src/action.ts',
	output: {
		esModule: true,
		file: 'dist/index.js',
		format: 'es',
		sourcemap: true,
	},
	// onwarn(warning, warn) {
	// 	if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message?.includes(IGNORED_CIRCULAR_DEPENDENCY)) {
	// 		return;
	// 	}

	// 	warn(warning);
	// },
	plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs()],
}

export default config
