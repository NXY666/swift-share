#!/usr/bin/env node

import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import {spawnSync, StdioOptions} from "child_process";
import {Api, Url} from "@/modules/Url";
import mime from 'mime/lite';
import {ConfigAbsolutePath, FileAbsolutePath, getConfig, resetConfig, ResourceAbsolutePath} from "@/modules/Config";
import {Command} from "commander";
import {CodeStore, FileCodeInfo, ShareCodeInfo, TextCodeInfo} from "@/modules/Code";
import {File, FileStatus, MultipartFile, SimpleFile} from "@/modules/File";

// 路径检查和初始化
if (fs.existsSync(FileAbsolutePath)) {
	try {
		fs.rmSync(FileAbsolutePath, {recursive: true});
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

const options = new Command()
	.option('--edit-config', 'Edit config file')
	.option('--reset-config', 'Reset config file')
	.parse(process.argv)
	.opts();
if (options.resetConfig) {
	await resetConfig();
	console.info('Config file has been reset.');
	process.exit(0);
} else if (options.editConfig) {
	console.info('Opening config file...');
	openEditor(ConfigAbsolutePath);
	process.exit(0);
}

const CONFIG = getConfig();

// 初始化分享目录
if (fs.existsSync(CONFIG.STORE.SHARE.PATH)) {
	const shareCode = new ShareCodeInfo(CONFIG.STORE.SHARE.PATH);
	shareCode.code = CONFIG.STORE.SHARE.CODE;
	CodeStore.saveCodeInfo(shareCode);
}

// noinspection JSUnusedGlobalSymbols
const storage = multer.diskStorage({
	destination: FileAbsolutePath,
	filename: (req, file, cb) => {
		Object.defineProperty(file, 'name', {
			get(): string {
				return Buffer.from(file.originalname, "latin1").toString("utf8");
			},
			enumerable: true
		});

		const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
		const fileName = `${file.fieldname}-${uniqueSuffix}`;
		cb(null, fileName);

		req.once('aborted', () => {
			const fullFilePath = path.join(FileAbsolutePath, fileName);
			file.stream.on('end', () => {
				fs.unlink(fullFilePath, (err) => {
					if (err) {
						console.error('Failed to delete aborted file:', fullFilePath, 'Error:', err.message);
					} else {
						console.info('Aborted file deleted:', fullFilePath);
					}
				});
			});
			file.stream.emit('end');
		});
	}
});
const upload = multer({storage});

const app = express();
const port = CONFIG.PORT;

// 解析文本和JSON
app.use(bodyParser.text({limit: Infinity}));
app.use(bodyParser.json({limit: Infinity}));

// 设置静态资源目录
app.use(express.static(ResourceAbsolutePath));

// 为Request添加signed属性
declare global {
	namespace Express {
		// noinspection JSUnusedGlobalSymbols
		interface Request {
			signed?: boolean;
		}
	}
}

app.use((req, _res, next) => {
	// 获取协议
	const protocol = req.protocol;

	// 获取主机名
	const host = req.get('host');

	// 获取路径和查询参数
	const originalUrl = req.originalUrl;

	// 构建完整的URL
	const fullUrl = `${protocol}://${host}${originalUrl}`;

	// 验证URL
	req.signed = Url.check(fullUrl);

	// 调用下一个中间件或路由处理器
	next();
});

// biu~
app.post(Api.BIU, (req, res) => {
	let matched = true, consoleText: string, scriptText: string;
	if (req.body === CONFIG.BIU.GET_ALL_CODE_COMMAND) {
		console.log('biu~GET_ALL_CODE_COMMAND');
		const codeInfos = CodeStore.getAllCodeInfo().map(codeInfo => {
			const code = codeInfo.code.toUpperCase();
			if (codeInfo instanceof TextCodeInfo) {
				return `【文本】【${code}】${codeInfo.text.slice(0, 20)}${codeInfo.text.length > 20 ? '...' : ''}`;
			} else if (codeInfo instanceof FileCodeInfo) {
				return `【文件】【${code}】${codeInfo.files[0].name} 等 ${codeInfo.files.length} 个文件`;
			} else if (codeInfo instanceof ShareCodeInfo) {
				return `【共享】【${code}】${codeInfo.path}`;
			}
		});
		consoleText = codeInfos.join('\n');
	} else if (req.body === CONFIG.BIU.CLEAR_ALL_CODE_COMMAND) {
		console.log('biu~CLEAR_ALL_CODE_COMMAND');
		CodeStore.clearAllCodeInfo();
		consoleText = "已清除所有提取码。";
	} else if (req.body === CONFIG.BIU.OPEN_CONSOLE_COMMAND) {
		console.log('biu~OPEN_CONSOLE_COMMAND');
		consoleText = "已启动虚拟控制台。";
		scriptText = `(function () { var script = document.createElement('script'); script.src="https://cdn.jsdelivr.net/npm/eruda"; document.body.append(script); script.onload = function () { eruda.init(); } })();`;
	} else {
		consoleText = "biu~";
		matched = false;
	}
	res.json({
		text: matched ? "已收到您的反馈，但是我们不会处理。" : "已收到您的反馈，我们将尽快处理。", console: consoleText,
		script: scriptText
	});
});

// 所有 API
app.get(Api.API, (_req, res) => {
	res.json(Api);
});

// 提取码长度
app.get(Api.EXTRACT_CODE_LENGTH, (_req, res) => {
	res.json({length: CONFIG.CODE.EXTRACT_LENGTH});
});

// 文本暂存空间
app.get(Api.UPLOAD_TEXT_CAPACITY, (_req, res) => {
	res.json({capacity: CONFIG.STORE.TEXT.CAPACITY});
});

// 文件暂存空间
app.get(Api.UPLOAD_FILES_CAPACITY, (_req, res) => {
	res.json({capacity: CONFIG.STORE.FILE.CAPACITY});
});

// 文本上传
app.post(Api.UPLOAD_TEXT, (req, res) => {
	const text = req.body.toString();

	let storeUsedSize = CodeStore.getUsedSpace(TextCodeInfo);

	if (storeUsedSize + text.length > CONFIG.STORE.TEXT.CAPACITY) {
		console.error('Text store is full:', storeUsedSize, '+', text.length, '>', CONFIG.STORE.TEXT.CAPACITY);
		res.status(403).json({message: '文本暂存空间已满，请稍后再试。'});
		return;
	}

	const codeInfo = new TextCodeInfo(text);
	CodeStore.saveCodeInfo(codeInfo);

	res.json({code: codeInfo.code});
});

// 文本提取
app.get(Api.EXTRACT_TEXT, (req, res) => {
	const extractionCode = req.params.code.toLowerCase();
	const codeInfo = CodeStore.getCodeInfo(extractionCode);

	if (!codeInfo) {
		console.error('Text not found or has expired:', extractionCode);
		res.status(404).json({message: '提取码不存在或已过期。'});
		return;
	} else if (codeInfo.hasExpired()) {
		const expDate = new Date(codeInfo.expireTime);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		console.error('Text has expired at', datetime, ':', extractionCode);
		res.status(404).json({message: `提取码已于 ${datetime} 过期。`});
		return;
	}

	if (codeInfo instanceof TextCodeInfo) {
		console.info('Text extracted:', extractionCode);
		res.json({text: (codeInfo).text});
	} else {
		console.info('Specified code is not a text:', extractionCode);
		res.status(400).json({message: '指定的提取码类型不是文本。'});
	}
});

// 申请文件上传
app.post(Api.UPLOAD_FILES_APPLY, (req, res) => {
	const {files} = req.body;

	let storeUsedSize = CodeStore.getUsedSpace(FileCodeInfo);

	let filesSize = files.reduce((size: number, file: File) => size + file.size, 0);

	if (storeUsedSize + filesSize > CONFIG.STORE.FILE.CAPACITY) {
		console.error('File store is full:', storeUsedSize, '+', filesSize, '>', CONFIG.STORE.FILE.CAPACITY);
		res.status(403).json({message: '文件暂存空间已满，请稍后再试。'});
		return;
	}

	const fileUploadConfigs = [], localFiles = [];
	for (const file of files) {
		if (file.size > CONFIG.STORE.FILE.PART_SIZE) {
			const newFile = new MultipartFile({name: file.name, size: file.size});
			fileUploadConfigs.push(newFile.getUploadConfig());
			localFiles.push(newFile);
		} else {
			const newFile = new SimpleFile({name: file.name, size: file.size});
			fileUploadConfigs.push(newFile.getUploadConfig());
			localFiles.push(newFile);
		}
	}

	const codeInfo = new FileCodeInfo(localFiles);
	CodeStore.saveCodeInfo(codeInfo);

	res.json({
		code: codeInfo.code,
		checkpointUrl: codeInfo.getSignedCheckpointUrl({host: req.headers.host}),
		configs: fileUploadConfigs
	});
});

// 文件上传检查点
app.get(Api.UPLOAD_FILES_CHECKPOINT, (req, res) => {
	const {code} = req.query;

	const codeInfo = CodeStore.getCodeInfo(code as string);

	if (!req.signed) {
		console.error('Invalid signature.');
		res.status(403).json({message: '请求不够安全。'});
		return;
	} else if (!codeInfo) {
		console.error('Code not found or has expired:', code);
		res.status(404).json({message: '提取码不存在或已过期。'});
		return;
	} else if (codeInfo.hasExpired()) {
		const expDate = new Date(codeInfo.expireTime);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		console.error('Code has expired at', datetime, ':', code);
		res.status(404).json({message: `提取码已于 ${datetime} 过期。`});
		return;
	}

	codeInfo.checkpoint();

	res.status(204).end();
});

// 文件上传
app.post(Api.UPLOAD_FILES, upload.single('part'), (req, res) => {
	let {id, key, index} = req.body;

	index = parseInt(index);

	const file = File.findFileById(id);

	if (file?.key !== key) {
		console.error('Invalid file or key:', key);
		res.status(403).json({message: '无效的文件或密钥。'});
		return;
	}

	if (file.upload(index, req.file)) {
		console.info('File', id, 'part', index, 'uploaded:', req.file.filename);
		res.status(204).end();
	} else {
		console.error('Upload file', id, 'part', index, 'has been rejected.');
		res.status(403).json({message: '上传被拒绝。'});
	}
});

// 文件提取
app.get(Api.EXTRACT_FILES, (req, res) => {
	const extractionCode = req.params.code.toLowerCase();
	const codeInfo = CodeStore.getCodeInfo(extractionCode);

	if (!codeInfo) {
		console.error(`File not found or has expired: ${extractionCode}`);
		res.status(404).json({message: '提取码不存在或已过期。'});
		return;
	} else if (codeInfo.hasExpired()) {
		console.error(`File has expired: ${extractionCode}`);
		const expDate = new Date(codeInfo.expireTime);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		res.status(404).json({message: `提取码已于 ${datetime} 过期。`});
		return;
	}

	if (codeInfo instanceof FileCodeInfo || codeInfo instanceof ShareCodeInfo) {
		console.info(`File extracted: ${extractionCode}`);
		// 生成下载配置
		const fileDownloadConfigs = [];
		for (const file of codeInfo.files) {
			const downloadConfig = file.getDownloadConfig({host: req.headers.host});
			fileDownloadConfigs.push(downloadConfig);
		}
		res.json({configs: fileDownloadConfigs});
	} else {
		console.error(`Specified code is not a file: ${extractionCode}`);
		res.status(400).json({message: '指定的提取码类型不是文件。'});
	}
});

// 文件获取
app.get(Api.FETCH, (req, res) => {
	const {id, type} = req.query;

	const file = File.findFileById(id as string);

	if (!req.signed) {
		console.error(`Invalid signature.`);
		res.status(403).send("请求不够安全。");
		return;
	} else if (!file) {
		console.error(`File not found: ${id}`);
		res.status(404).send("文件不存在或已过期。");
		return;
	} else if (file.status === FileStatus.REMOVED) {
		console.error(`File removed: ${id}`);
		res.status(404).send("文件已被删除。");
		return;
	}
	console.info(`File fetched: ${req.query.id}`);

	// range支持
	const [rangeStartStr, rangeEndStr]: string[] = req.headers.range?.replace("bytes=", "").split("-") ?? ["", ""];
	if (rangeStartStr || rangeEndStr) {
		let rangeStart = parseInt(rangeStartStr) || 0;
		let rangeEnd = parseInt(rangeEndStr) || file.size - 1;
		res.status(206);
		res.setHeader('Content-Length', rangeEnd - rangeStart + 1);
		res.setHeader('Accept-Ranges', 'bytes');
		res.setHeader('Content-Range', `bytes ${rangeStart}-${rangeEnd}/${file.size}`);
	} else {
		res.setHeader('Content-Length', file.size);
	}

	res.type(mime.getType(file.originalname) || "application/octet-stream");

	switch (type as string) {
		case "down": {
			res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(file.name)}`);
			break;
		}
		case "play": {
			res.setHeader('Content-Disposition', `inline; filename=${encodeURIComponent(file.name)}`);
			break;
		}
	}

	// 读取整个流的内容
	const downloadStream = file.rangeDownloadStream(req.headers.range);
	res.on('close', () => {
		downloadStream.destroy(new Error("Connection closed."));
	});
	downloadStream.on('error', () => {
		console.error(`Failed to download file: ${id}`);
		res.end();
	});
	downloadStream.pipe(res);
});

app.listen(port, () => {
	console.info(`Server is running on http://localhost:${port}/ .`);
});

process.on("SIGINT", () => {
	console.info("Server is shutting down...");
	try {
		fs.rmSync(FileAbsolutePath, {recursive: true});
	} catch (e) {
		console.error(`Failed to delete directory: ${FileAbsolutePath}`);
	}
	process.exit(0);
});

process.on('uncaughtException', (err) => {
	console.error(err.stack);
});
