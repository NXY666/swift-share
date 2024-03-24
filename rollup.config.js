// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import {defineConfig} from "rollup";
import alias from "@rollup/plugin-alias";
import path from "path";
import {fileURLToPath} from "url";
import copy from "rollup-plugin-copy";
import watchAssets from "rollup-plugin-watch-assets";

// 将 import.meta.url 转换为当前文件的绝对路径
const __filename = fileURLToPath(import.meta.url);
// 使用 path.dirname 获取当前文件所在目录的路径，类似于 __dirname
const __dirname = path.dirname(__filename);

export default defineConfig({
	input: 'src/index.ts', // 你的入口文件
	watch: {
		include: ['src/**'] // 监听的文件夹
	},
	output: {
		dir: 'dist', // 输出目录
		format: 'es', // 输出格式，根据需要选择 'cjs', 'es', 'umd' 等
		sourcemap: process.env.ROLLUP_WATCH ? 'inline' : false // 是否输出 sourcemap
	},
	plugins: [
		typescript(), // 使用 TypeScript 插件
		alias({
			entries: [
				{find: '@', replacement: path.resolve(__dirname, 'src')}
			]
		}),
		copy({
			targets: [
				{src: ['src/assets', 'src/package.json'], dest: 'dist'}
			]
		}),
		watchAssets({
			assets: ['src/assets/**', 'src/package.json']
		})
	],
	external: ['url', 'express', 'body-parser', 'multer', 'path', 'child_process', 'http', 'ws', 'crypto', 'events', 'stream', 'fs'] // 外部依赖，不会被打包
});
