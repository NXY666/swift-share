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
import babel from '@rollup/plugin-babel';
import postcss from 'rollup-plugin-postcss';
import postcssImport from 'postcss-import';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

// 将 import.meta.url 转换为当前文件的绝对路径
const __filename = fileURLToPath(import.meta.url);
// 使用 path.dirname 获取当前文件所在目录的路径，类似于 __dirname
const __dirname = path.dirname(__filename);

const isProd = !process.env.ROLLUP_WATCH;

export default defineConfig([{
	input: 'src/index.ts',
	watch: {
		include: ['src/**'],
		exclude: ['src/assets/**']
	},
	output: {
		dir: 'dist',
		format: 'es',
		sourcemap: isProd ? false : 'inline'
	},
	plugins: [
		isProd && {
			name: 'clear-dist',
			buildStart() {
				const distPath = path.resolve(__dirname, 'dist');
				if (fs.existsSync(distPath)) {
					fs.rmSync(distPath, {recursive: true, force: true});
					console.info('cleared dist directory');
				}
			}
		},
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
			assets: ['src/package.json']
		}),
		isProd && terser({
			compress: {
				pure_funcs: ['console.debug']
			}
		}),
		copy({
			targets: [
				{src: 'src/configs/DefaultConfig.js', dest: 'dist', rename: 'default.config.js'}
			]
		}),
		isProd && {
			name: 'generate-package-lock',
			async generateBundle() {
				// 把本项目中的 package.json 中的 dependencies 复制到 dist 目录的 package.json 中
				const packageJson = (await import('./package.json', {with: {type: 'json'}})).default;
				const srcPackageJson = (await import('./src/package.json', {with: {type: 'json'}})).default;

				['description', 'engines', 'repository', 'bugs', 'author', 'license', 'keywords', 'dependencies'].forEach(key => {
					srcPackageJson[key] = packageJson[key];
				});

				fs.writeFileSync('dist/package.json', JSON.stringify(srcPackageJson, null, 2));

				execSync('npm install --package-lock-only', {cwd: 'dist'});

				console.info('generated package-lock.json');
			}
		}
	].filter(Boolean),
	external: [
		// nodejs内建模块
		'url', 'path', 'child_process', 'http', 'crypto', 'events', 'stream', 'fs',
		// 第三方模块
		'express', 'body-parser', 'multer', 'range-parser', 'mime/lite', 'commander', 'chokidar', 'tinyqueue', 'ws'
	] // 外部依赖，不会被打包
}, {
	input: ['src/assets/index.js', 'src/assets/custom.js'],
	watch: {
		include: ['src/assets/**']
	},
	output: {
		dir: 'dist/assets',
		format: 'esm',
		sourcemap: isProd ? false : 'inline'
	},
	plugins: [
		!isProd && watchAssets({
			assets: [
				'src/assets/index.html',
				'src/assets/favicon.ico'
			]
		}),
		resolve(),
		commonjs(),
		postcss({
			plugins: [
				postcssImport()
			],
			extract: true,
			minimize: isProd
		}),
		isProd && babel({
			babelHelpers: 'bundled'
		}),
		isProd && terser(),
		copy({
			targets: [
				{src: 'src/assets/index.html', dest: 'dist/assets'},
				{src: 'src/assets/favicon.ico', dest: 'dist/assets'},
				{src: 'README.md', dest: 'dist'}
			]
		})
	]
}]);
