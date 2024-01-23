#!/usr/bin/env node

import {fileURLToPath, pathToFileURL} from "url";
import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import {spawnSync} from "child_process";
import http from "http";
import {WebSocketServer} from 'ws';
import DefaultConfig from "./default_config.js";
import {CodeStore, FileCodeInfo} from "./modules/Code.js";
import {File, FileStatus, MultipartFile, SimpleFile} from "./modules/File.js";
import {DownloadWebSocketPool} from "./modules/WebSocket.js";
import {Api, Url} from "./modules/Url.js";

function getAbsPath(Path = "", baseDir = fileURLToPath(import.meta.url)) {
	return path.isAbsolute(Path) ? Path : path.join(baseDir, Path);
}
function deepMergeObject(def, act) {
	if (typeof def == "undefined" || def == null) {
		return act;
	} else if (typeof act == "undefined" || act == null) {
		return def;
	}

	if (typeof def !== "object" || typeof act !== "object") {
		return typeof def !== typeof act ? def : act;
	} else if (Array.isArray(def) !== Array.isArray(act)) {
		return def;
	} else if (Array.isArray(def) && Array.isArray(act)) {
		return def.concat(act);
	}

	let res = {};
	for (let k in def) {
		res[k] = deepMergeObject(def[k], act[k]);
	}
	for (let k in act) {
		res[k] = deepMergeObject(def[k], act[k]);
	}
	return res;
}

// 定义路径
const DataDirPath = path.join(process.platform === "win32" ? process.env.APPDATA : process.env.HOME, './.swift-share');

const DefaultConfigPath = './default_config.js';
const ConfigPath = './config.js';
const ResourcePath = './resources';
const FilePath = './files';

const DefaultConfigAbsolutePath = getAbsPath(DefaultConfigPath);
const ConfigAbsolutePath = getAbsPath(ConfigPath, DataDirPath);
const ResourceAbsolutePath = getAbsPath(ResourcePath);
const FileAbsolutePath = getAbsPath(FilePath, DataDirPath);

// 路径检查和初始化
if (!fs.existsSync(ConfigAbsolutePath)) {
	fs.cpSync(DefaultConfigAbsolutePath, ConfigAbsolutePath);
}
if (fs.existsSync(FileAbsolutePath)) {
	try {
		fs.rmSync(FileAbsolutePath, {recursive: true});
	} catch (e) {
		console.error(`Failed to delete directory: ${FileAbsolutePath}`);
	}
}
fs.mkdirSync(FileAbsolutePath, {recursive: true});

// 配置
function runCommand(command, stdio = 'ignore') {
	try {
		const result = spawnSync(command, {shell: true, stdio});
		return result.status === 0;
	} catch {
		return false;
	}
}
function openEditor(path) {
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
			{name: 'notepad', command: 'notepad {{path}}'}
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
if (process.argv.includes('-config')) {
	openEditor(ConfigAbsolutePath);
	process.exit(0);
} else if (process.argv.includes('-reset')) {
	fs.rmSync(ConfigAbsolutePath);
	fs.cpSync(DefaultConfigAbsolutePath, ConfigAbsolutePath);
	console.log('Config file has been reset.');
	process.exit(0);
}
const config = deepMergeObject(DefaultConfig, await import(pathToFileURL(ConfigAbsolutePath)).default);

// noinspection JSUnusedGlobalSymbols
const storage = multer.diskStorage({
	destination: FileAbsolutePath,
	filename: (req, file, cb) => {
		file.name = Buffer.from(file.originalname, "latin1").toString("utf8");

		const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
		const fileName = `${file.fieldname}-${uniqueSuffix}`;
		cb(null, fileName);

		req.once('aborted', () => {
			const fullFilePath = path.join(FileAbsolutePath, fileName);
			file.stream.on('end', () => {
				fs.unlink(fullFilePath, (err) => {
					if (err) {
						console.error(`Failed to delete aborted file: ${fullFilePath}`);
					} else {
						console.log(`Aborted file deleted: ${fullFilePath}`);
					}
				});
			});
			file.stream.emit('end');
		});
	}
});
const upload = multer({storage});

const app = express();
const port = config.PORT;

/**
 * 存储文本信息的对象，键为提取码，值为文本信息
 * @type {{[key: string]: {type: "text", text: string, size: number, expiration: number} | {type: "files", files: Object[], size: number, expiration: number} | {type: "share", path: string}}}
 */
const codeStore = {};
/**
 * 存储下载链接的对象，键为下载码，值为下载信息
 * @type {{[key: string]: {originalName: string, path: string, expiration: number}}}
 */
const linkStore = {};

// 生成共享目录提取码
const shareFolderCode = generateExtractionCode(config.EXTRACT_CODE_LENGTH);
codeStore[shareFolderCode] = {type: "share", path: config.SHARE_FOLDER_PATH};
console.log(`Share folder code: ${shareFolderCode}`);

// 解析文本和JSON
app.use(bodyParser.text({limit: Infinity}));
app.use(bodyParser.json({limit: Infinity}));

// 设置静态资源目录
app.use(express.static(ResourcePath));

// biu~
app.post(Api.BIU, (req, res) => {
	let matched = true, consoleText, scriptText;
	if (req.body === config.BIU.GET_ALL_CODE_COMMAND) {
		console.log('biu~GET_ALL_CODE_COMMAND');
		consoleText = Object.entries(codeStore).map(([code, info]) => {
			switch (info.type) {
				case "text":
					return `【文本】【${code.toUpperCase()}】${info.text.replaceAll(/[\s\n\r]/g, " ").slice(0, 20)}${info.text.length > 20 ? "..." : ""}`;
				case "files":
					return `【文件】【${code.toUpperCase()}】${info.files[0].name} 等 ${info.files.length} 个文件`;
				case "share":
					return `【共享】【${code.toUpperCase()}】${info.path}`;
				default:
					return `【未知】【${code.toUpperCase()}】${JSON.stringify(info)}`;
			}
		}).sort((a, b) => a.expiration - b.expiration).join('\n');
	} else if (req.body === config.BIU.CLEAR_ALL_CODE_COMMAND) {
		console.log('biu~CLEAR_ALL_CODE_COMMAND');
		Object.keys(codeStore).forEach(code => {
			if (codeStore[code].type === "files" || codeStore[code].type === "text") {
				delCode(code);
			}
		});
		consoleText = "已清除所有提取码。";
	} else if (req.body === config.BIU.OPEN_CONSOLE_COMMAND) {
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

// 提取码长度
app.get(Api.EXTRACT_CODE_LENGTH, (req, res) => {
	res.json({length: config.EXTRACT_CODE_LENGTH});
});

// 文本暂存空间
app.get(Api.UPLOAD_TEXT_CAPACITY, (req, res) => {
	res.json({capacity: config.TEXT_STORE_CAPACITY});
});

// 文本上传
app.post(Api.UPLOAD_TEXT, (req, res) => {
	const text = req.body.toString();

	// 获取store文本的总大小
	let totalSize = 0;
	for (const [, info] of Object.entries(codeStore)) {
		if (info.type === "text") {
			totalSize += info.size;
		}
	}
	if (totalSize + text.length > config.TEXT_STORE_CAPACITY) {
		console.log(`Text store is full: ${totalSize} + ${text.length} > ${config.TEXT_STORE_CAPACITY}`);
		res.status(403).json({message: '文本暂存空间已满，请稍后再试。'});
		return;
	}

	const extractionCode = generateExtractionCode(config.EXTRACT_CODE_LENGTH);
	codeStore[extractionCode] = {
		type: "text", text,
		size: text.length,
		expiration: Date.now() + config.TEXT_EXPIRE_INTERVAL
	};

	console.log(`Text uploaded: ${extractionCode}`);
	res.json({code: extractionCode.toUpperCase()});
});

// 文本提取
app.get(Api.EXTRACT_TEXT, (req, res) => {
	const extractionCode = req.params.code.toLowerCase();
	const textInfo = codeStore[extractionCode];

	if (!textInfo || Date.now() > textInfo.expiration) {
		console.log(`Text not found or has expired: ${extractionCode}`);
		res.status(404).json({message: '提取码不存在或已过期。'});
	} else if (textInfo.type !== "text") {
		console.log(`Specified code is not a text: ${extractionCode}`);
		res.status(400).json({message: '指定的提取码类型不是文本。'});
	} else {
		console.log(`Text extracted: ${extractionCode}`);
		res.json({text: textInfo.text});
	}
});

// 文件暂存空间
app.get(Api.UPLOAD_FILES_CAPACITY, (req, res) => {
	res.json({capacity: config.FILE_STORE_CAPACITY});
});

// 文件上传
app.post(Api.UPLOAD_FILES, upload.array('files'), (req, res) => {
	const files = req.files;

	// 获取store文件的总大小
	let storeUsedSize = 0;
	for (const [, info] of Object.entries(codeStore)) {
		if (info.type === "files") {
			storeUsedSize += info.size;
		}
	}

	// 获取上传文件的总大小
	let filesSize = 0;
	for (const file of files) {
		filesSize += file.size;
	}

	// 判断是否超出容量
	if (storeUsedSize + filesSize > config.FILE_STORE_CAPACITY) {
		console.log(`File store is full: ${storeUsedSize} + ${filesSize} > ${config.FILE_STORE_CAPACITY}`);
		res.status(403).json({message: '文件暂存空间已满，请稍后再试。'});
		// 删除已上传的文件
		for (const file of files) {
			try {
				fs.unlinkSync(file.path);
			} catch (e) {
				console.error(`Failed to delete file: ${file.path}`);
			}
		}
		return;
	}

	const extractionCode = generateExtractionCode(config.EXTRACT_CODE_LENGTH);
	codeStore[extractionCode] = {
		type: "files", files,
		size: filesSize,
		expiration: Date.now() + config.FILE_EXPIRE_INTERVAL
	};

	console.log(`File uploaded: ${extractionCode}`);
	res.json({code: extractionCode.toUpperCase()});
});

// 文件提取
app.get(Api.EXTRACT_FILES, (req, res) => {
	const extractionCode = req.params.code.toLowerCase();
	const fileInfo = codeStore[extractionCode];

	if (!fileInfo) {
		console.log(`File not found or has expired: ${extractionCode}`);
		res.status(404).json({message: '提取码不存在或已过期。'});
	} else if (Date.now() > fileInfo.expiration) {
		console.log(`File has expired: ${extractionCode}`);
		const expDate = new Date(fileInfo.expiration);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		res.status(404).json({message: `提取码已于 ${datetime} 过期。`});
	} else {
		switch (fileInfo.type) {
			case "files": {
				console.log(`File extracted: ${extractionCode}`);
				// 生成一堆下载链接
				const codes = [];
				for (const file of fileInfo.files) {
					const downloadCode = generateExtractionCode(config.LINK_CODE_LENGTH);
					linkStore[downloadCode] = {
						originalName: file.originalname, path: file.path,
						expiration: Date.now() + config.LINK_EXPIRE_INTERVAL
					};
					codes.push({
						name: file.name,
						code: downloadCode.toUpperCase()
					});
				}
				res.json({codes});
				break;
			}
			case "share": {
				console.log(`Share folder extracted: ${extractionCode}`);
				const codes = [];
				try {
					const shareFolderPath = fileInfo.path;
					const shareFolder = fs.readdirSync(shareFolderPath);
					const shareFolderStack = [];
					for (const file of shareFolder) {
						shareFolderStack.push({path: path.join(shareFolderPath, file), name: file});
					}
					while (shareFolderStack.length > 0) {
						const file = shareFolderStack.pop();
						if (fs.statSync(file.path).isDirectory()) {
							const subFolder = fs.readdirSync(file.path);
							for (const subFile of subFolder) {
								shareFolderStack.push({
									path: path.join(file.path, subFile), name: path.join(file.name, subFile)
								});
							}
						} else {
							const downloadCode = generateExtractionCode(config.LINK_CODE_LENGTH);
							linkStore[downloadCode] = {
								originalName: Buffer.from(file.name, "utf-8").toString("latin1"),
								path: file.path,
								expiration: Date.now() + config.LINK_EXPIRE_INTERVAL
							};
							codes.push({
								name: file.name,
								code: downloadCode.toUpperCase()
							});
						}
					}
				} catch (e) {
					console.error(`Failed to read share folder: ${fileInfo.path}`);
				}
				res.json({codes});
				break;
			}
			default: {
				console.log(`Specified code is not a file: ${extractionCode}`);
				res.status(400).json({message: '指定的提取码类型不是文件。'});
				break;
			}
		}
	}
});

// 文件下载
app.get(Api.DOWN, (req, res) => {
	const downCode = req.params.code.toLowerCase();
	const linkInfo = linkStore[downCode];

	const absFilePath = getAbsPath(linkInfo?.path);

	if (!linkInfo || Date.now() > linkInfo.expiration) {
		console.log(`Download link not found or has expired: ${downCode}`);
		res.status(404).send("下载链接不存在或已过期。");
	} else if (!fs.existsSync(absFilePath)) {
		console.log(`File not found: ${absFilePath}`);
		res.status(404).send("文件不存在。");
	} else {
		console.log(`File downloaded: ${downCode}`);
		res.setHeader('Content-Disposition', `attachment; filename=${path.basename(linkInfo.originalName)}`);
		res.sendFile(absFilePath);
	}
});

// 申请文件上传
app.post(Api.UPLOAD_FILES_APPLY, (req, res) => {
	const apply = req.body;
	const {files: applyFiles, allowMultipart} = apply;

	let storeUsedSize = CodeStore.getUsedSpace("files");

	let filesSize = 0;
	for (const file of applyFiles) {
		filesSize += file.size;
	}

	if (storeUsedSize + filesSize > config.FILE_STORE_CAPACITY) {
		console.log(`File store is full: ${storeUsedSize} + ${filesSize} > ${config.FILE_STORE_CAPACITY}`);
		res.status(403).json({message: '文件暂存空间已满，请稍后再试。'});
		return;
	}

	const fileUploadConfigs = [], localFiles = [];
	for (const applyFile of applyFiles) {
		if (allowMultipart && applyFile.size > DefaultConfig.FILE_PART_SIZE) {
			const newFile = new MultipartFile({name: applyFile.name, size: applyFile.size});
			fileUploadConfigs.push(newFile.getUploadConfig({host: req.headers.host}));
			localFiles.push(newFile);
		} else {
			const newFile = new SimpleFile({name: applyFile.name, size: applyFile.size});
			fileUploadConfigs.push(newFile.getUploadConfig({host: req.headers.host}));
			localFiles.push(newFile);
		}
	}

	const codeInfo = new FileCodeInfo(localFiles);
	CodeStore.saveCodeInfo(codeInfo);

	res.json({code: codeInfo.code, checkpointUrl: codeInfo.getSignedCheckpointUrl({host: req.headers.host}), configs: fileUploadConfigs});
});

// 文件上传检查点
app.get(Api.UPLOAD_FILES_CHECKPOINT, (req, res) => {
	const url = Url.completeUrl(req.url);

	const codeInfo = CodeStore.getCodeInfo(req.query.code);

	if (!Url.check(url)) {
		console.log(`Invalid signature: ${url}`);
		res.status(403).json({message: '无效的签名。'});
		return;
	} else if (!codeInfo) {
		console.log(`Code not found or has expired: ${req.query.code}`);
		res.status(404).json({message: '提取码不存在或已过期。'});
		return;
	} else if (codeInfo.hasExpired()) {
		const expDate = new Date(codeInfo.expireTime);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		console.log(`Code has expired: ${req.query.code}`);
		res.status(404).json({message: `提取码已于 ${datetime} 过期。`});
		return;
	}

	codeInfo.checkpoint();

	res.json({});
});

// 上传文件（新）
app.post(Api.UPLOAD_FILES_NEW, upload.single('part'), (req, res) => {
	let {id, key, index} = req.body;

	index = parseInt(index);

	const file = File.findFileById(id);

	if (file?.key !== key) {
		console.log(`Invalid file or key: ${key}`);
		res.status(403).json({message: '无效的文件或密钥。'});
		return;
	}

	if (file.upload(index, req.file)) {
		console.log(`File part uploaded: ${id}`);

		// 如果上传完成，则关闭所有连接；否则广播文件片段
		if (file.status === FileStatus.UPLOADED) {
			downloadWebSocketPool.closeAll(id, 4000, "文件上传完成。");
		} else {
			downloadWebSocketPool.broadcast(id, index);
		}

		res.json({});
	} else {
		console.log(`File part upload has been rejected: ${id}`);
		res.status(403).json({message: '上传被拒绝。'});
	}
});

// 文件提取（新）
app.post(Api.EXTRACT_FILES_NEW, (req, res) => {
	const extractionCode = req.params.code.toLowerCase();
	const codeInfo = CodeStore.getCodeInfo(extractionCode);

	if (!codeInfo) {
		console.log(`File not found or has expired: ${extractionCode}`);
		res.status(404).json({message: '提取码不存在或已过期。'});
		return;
	} else if (codeInfo.hasExpired()) {
		console.log(`File has expired: ${extractionCode}`);
		const expDate = new Date(codeInfo.expireTime);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		res.status(404).json({message: `提取码已于 ${datetime} 过期。`});
		return;
	}

	const {allowMultipart} = req.body;
	switch (codeInfo.type) {
		case "files": {
			console.log(`File extracted: ${extractionCode}`);
			// 生成下载配置
			const fileDownloadConfigs = [];
			for (const file of codeInfo.files) {
				const downloadConfig = file.getDownloadConfig({host: req.headers.host}, allowMultipart);
				fileDownloadConfigs.push(downloadConfig);
			}
			res.json({configs: fileDownloadConfigs});
			break;
		}
	}
});

// 文件下载（新）
app.get(Api.DOWN_NEW, (req, res) => {
	const url = Url.completeUrl(req.url);

	const id = url.searchParams.get('id');

	const file = File.findFileById(id);

	if (!file) {
		console.log(`File not found: ${id}`);
		res.status(404).send("文件不存在或已过期。");
		return;
	} else if (!file.isValidUrl(url)) {
		console.log(`Invalid signature: ${url}`);
		res.status(404).send("文件不存在或已过期。");
		return;
	}
	console.log(`File downloaded: ${req.query.id}`);

	// 读取整个流的内容
	file.download(parseInt(req.query.index)).pipe(res);
});

// 文件播放
app.get(Api.PLAY, (req, res) => {
	const downCode = req.params.code.toLowerCase();
	const linkInfo = linkStore[downCode];
	const absFilePath = getAbsPath(linkInfo?.path);

	if (!linkInfo || Date.now() > linkInfo.expiration) {
		console.log(`Play link not found or has expired: ${downCode}`);
		res.status(404).send("播放链接不存在或已过期。");
	} else if (!fs.existsSync(absFilePath)) {
		console.log(`File not found: ${absFilePath}`);
		res.status(404).send("文件不存在。");
	} else {
		console.log(`File played: ${downCode}`);
		res.type("video/*");
		res.setHeader('Content-Disposition', `inline; filename=${path.basename(linkInfo.originalName)}`);
		res.sendFile(absFilePath);
	}
});

function delCode(code) {
	const info = codeStore[code];
	if (info.type === "files") {
		for (const file of info.files) {
			try {
				fs.unlinkSync(file.path);
			} catch (e) {
				console.error(`Failed to delete file: ${file.path}`);
			}
		}
	}
	delete codeStore[code];
}

const server = http.createServer(app);

const wss = new WebSocketServer({server});

const downloadWebSocketPool = new DownloadWebSocketPool();

// 监听WebSocket连接事件
wss.on('connection', (ws, req) => {
	const url = new URL(req.url, "ws://websocket.client/");
	const {searchParams} = url;
	switch (url.pathname) {
		case Api.WS_DOWN: {
			const id = searchParams.get('id');

			const file = File.findFileById(id);

			if (!file) {
				console.log(`File not found: ${id}`);
				ws.close(4001, "文件不存在或已过期。");
				return;
			} else if (!file.isValidUrl(url)) {
				console.log(`Invalid signature: ${url}`);
				ws.close(4001, "文件不存在或已过期。");
				return;
			} else if (file.status === FileStatus.UPLOADED) {
				console.log(`File uploaded: ${id}`);
				ws.close(4000, "文件已上传完成。");
				return;
			} else if (file.status === FileStatus.REMOVED) {
				console.log(`File removed: ${id}`);
				ws.close(4001, "文件已被删除。");
				return;
			}

			// 添加到连接池
			downloadWebSocketPool.addConnection(id, ws);
			break;
		}
		default: {
			ws.close();
			break;
		}
	}
});

server.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}/ .`);

	// 每分钟清理过期的文本信息
	setInterval(() => {
		// 处理过期的提取码
		for (const [code, info] of Object.entries(codeStore)) {
			switch (info.type) {
				case "text":
					if (Date.now() > info.expiration) {
						console.log(`Text expired: ${code}`);
						delCode(code);
					}
					break;
				case "files":
					if (Date.now() > info.expiration + config.LINK_EXPIRE_INTERVAL) {
						console.log(`File expired: ${code}`);
						delCode(code);
					}
					break;
			}
		}

		// 处理过期的下载链接
		for (const [code, linkInfo] of Object.entries(linkStore)) {
			if (Date.now() > linkInfo.expiration) {
				console.log(`Link expired: ${code}`);
				delete linkStore[code];
			}
		}

		// 全部提取码自检
		CodeStore.checkAll();
	}, 60 * 1000);
});

/**
 * 生成一个随机提取码
 * @param {number} length 提取码长度
 * @return {string} 提取码
 */
function generateExtractionCode(length) {
	const extractionCode = crypto.randomBytes(length).toString('hex');
	if (codeStore[extractionCode]) {
		return generateExtractionCode(length);
	}
	return extractionCode;
}

process.on("SIGINT", () => {
	console.log("Server is shutting down...");
	try {
		fs.rmSync(FileAbsolutePath, {recursive: true});
	} catch (e) {
		console.error(`Failed to delete directory: ${FileAbsolutePath}`);
	}
	process.exit(0);
});