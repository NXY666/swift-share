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
import fs from "fs";

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
		isProd && terser({
			compress: {
				pure_funcs: ['console.debug']
			}
		}),
		copy({
			targets: [
				{src: ['src/assets'], dest: 'dist'},
				{src: 'src/configs/DefaultConfig.js', dest: 'dist', rename: 'default.config.js'}
			]
		}),
		isProd && {
			name: 'generate-package-lock',
			async generateBundle() {
				// 把本项目中的 package.json 中的 dependencies 复制到 dist 目录的 package.json 中
				const packageJson = (await import('./package.json', {assert: {type: 'json'}})).default;
				const srcPackageJson = (await import('./src/package.json', {assert: {type: 'json'}})).default;

				['description', 'engines', 'repository', 'bugs', 'author', 'license', 'keywords', 'dependencies'].forEach(key => {
					srcPackageJson[key] = packageJson[key];
				});

				await fs.promises.writeFile('dist/package.json', JSON.stringify(srcPackageJson, null, 2));

				execSync('npm install --package-lock-only', {cwd: 'dist'});
			}
		}
	].filter(Boolean),
	external: [
		// nodejs内建模块
		'url', 'path', 'child_process', 'http', 'crypto', 'events', 'stream', 'fs',
		// 第三方模块
		'express', 'body-parser', 'multer', 'range-parser', 'mime/lite', 'commander', 'chokidar', 'tinyqueue'
	] // 外部依赖，不会被打包
});
