// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import {defineConfig} from "rollup";
import alias from "@rollup/plugin-alias";
import path from "path";
import {fileURLToPath} from "url";
import copy from "rollup-plugin-copy";
import watchAssets from "rollup-plugin-watch-assets";
import terser from '@rollup/plugin-terser';
import {execSync} from "child_process";

// 将 import.meta.url 转换为当前文件的绝对路径
const __filename = fileURLToPath(import.meta.url);
// 使用 path.dirname 获取当前文件所在目录的路径，类似于 __dirname
const __dirname = path.dirname(__filename);

const isProd = !process.env.ROLLUP_WATCH;

export default defineConfig({
	input: 'src/index.ts',
	watch: {
		include: ['src/**']
	},
	output: {
		dir: 'dist',
		format: 'es',
		sourcemap: isProd ? false : 'inline'
	},
	plugins: [
		typescript({
			compilerOptions: {
				sourceMap: !isProd
			}
		}),
		alias({
			entries: [
				{find: '@', replacement: path.resolve(__dirname, 'src')}
			]
		}),
		!isProd && watchAssets({
			assets: ['src/assets/**', 'src/package.json']
		}),
		isProd && terser(),
		copy({
			targets: [
				{src: ['src/assets', 'src/package.json'], dest: 'dist'},
				{src: 'src/configs/DefaultConfig.js', dest: 'dist', rename: 'default.config.js'}
			]
		}),
		isProd && {
			name: 'generate-package-lock',
			generateBundle() {
				execSync('npm install --package-lock-only', {cwd: 'dist'});
			}
		}
	].filter(Boolean),
	external: [
		// nodejs内建模块
		'url', 'path', 'child_process', 'http', 'crypto', 'events', 'stream', 'fs',
		// 第三方模块
		'express', 'body-parser', 'multer', 'ws', 'range-parser', 'mime/lite', 'commander'
	] // 外部依赖，不会被打包
});
