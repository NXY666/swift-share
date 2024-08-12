#!/usr/bin/env node

import fs from "fs";
import {spawnSync, StdioOptions} from "child_process";
import {
	ConfigAbsolutePath,
	DataDirPath,
	FileAbsolutePath,
	resetConfig,
} from "@/modules/Config";
import {Command} from "commander";
import * as commander from "commander";
import * as readline from "readline";

// 路径检查和初始化
if (fs.existsSync(FileAbsolutePath)) {
	try {
		fs.rmSync(FileAbsolutePath, {recursive: true, force: true});
	} catch (e) {
		console.error('Failed to remove directory:', FileAbsolutePath);
	}
}
fs.mkdirSync(FileAbsolutePath, {recursive: true});

// 解析命令行参数
function runCommand(command: string, stdio: StdioOptions = 'ignore') {
	try {
		const result = spawnSync(command, undefined, {shell: true, stdio});
		return result.status === 0;
	} catch {
		return false;
	}
}
function openEditor(path: string) {
	path = `"${path}"`;
	const editors = {
		'aix': [
			{name: 'vim', command: 'vim {{path}}'},
			{name: 'vi', command: 'vi {{path}}'}
		],
		'darwin': [
			{name: 'nano', command: 'nano {{path}}'},
			{name: 'vim', command: 'vim {{path}}'},
			{name: 'vi', command: 'vi {{path}}'}
		],
		'freebsd': [
			{name: 'vim', command: 'vim {{path}}'},
			{name: 'vi', command: 'vi {{path}}'}
		],
		'linux': [
			{name: 'nano', command: 'nano {{path}}'},
			{name: 'vim', command: 'vim {{path}}'},
			{name: 'vi', command: 'vi {{path}}'}
		],
		'openbsd': [
			{name: 'vim', command: 'vim {{path}}'},
			{name: 'vi', command: 'vi {{path}}'}
		],
		'sunos': [
			{name: 'vim', command: 'vim {{path}}'},
			{name: 'vi', command: 'vi {{path}}'}
		],
		'win32': [
			{
				name: 'vscode',
				command: [
					'code -n {{path}} -w',
					'code-insiders -n {{path}} -w'
				]
			},
			{
				name: 'notepad++',
				command: [
					'"C:\\Program Files\\Notepad++\\notepad++.exe" -noPlugin -notabbar {{path}}',
					'"C:\\Program Files (x86)\\Notepad++\\notepad++.exe" -noPlugin -notabbar {{path}}',
					'"D:\\Program Files\\Notepad++\\notepad++.exe" -noPlugin -notabbar {{path}}',
					'"D:\\Program Files (x86)\\Notepad++\\notepad++.exe" -noPlugin -notabbar {{path}}'
				]
			},
			{name: 'notepad', command: 'notepad {{path}}'},
			{name: 'explorer', command: 'start "" "{{path}}"'},
		]
	};
	const platform = process.platform;
	const editorList = editors[platform];
	if (!editorList) {
		throw new Error(`Unsupported platform: ${platform}`);
	}
	for (const editor of editorList) {
		if (typeof editor.command === 'string') {
			let command = editor.command;
			if (runCommand(command.replace('{{path}}', path), platform === 'win32' ? 'ignore' : 'inherit')) {
				return;
			}
		} else {
			for (const command of editor.command) {
				if (runCommand(command.replace('{{path}}', path), platform === 'win32' ? 'ignore' : 'inherit')) {
					return;
				}
			}
		}
	}
	throw new Error(`No editor found for platform: ${platform}`);
}

const program = new Command();

program
	.name('swift-share')
	.description('Swift Share CLI tool')
	.action(() => {
		import('@/server');
	});
program
	.command('config')
	.description('do some operations on config file')
	.addArgument(new commander.Argument('<action>').choices(['edit', 'reset']))
	.action(async (action) => {
		switch (action) {
			case 'edit':
				console.info('Opening config file...');
				openEditor(ConfigAbsolutePath);
				break;
			case 'reset':
				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout
				});
				rl.question('Are you sure to reset config file? (yes/no) ', async (answer: string) => {
					rl.close();
					if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
						await resetConfig();
						console.info('Config file has been reset.');
					} else {
						console.info('Operation canceled.');
					}
					process.exit(0);
				});
				break;
		}
	});
program
	.command('clear')
	.description('clear all data about this tool')
	.action(() => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		rl.question('Are you sure to clear all data? (yes/no) ', (answer: string) => {
			rl.close();
			if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
				fs.rmSync(DataDirPath, {recursive: true, force: true});
				console.info('All data has been cleared.');
			} else {
				console.info('Operation canceled.');
			}
			process.exit(0);
		});
	});
program
	.parse(process.argv)
	.opts();
