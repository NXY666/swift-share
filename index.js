#!/usr/bin/env node

const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {spawnSync} = require("child_process");

function getAbsPath(Path = "") {
	return path.isAbsolute(Path) ? Path : path.join(__dirname, Path);
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

const DefaultConfigPath = './default_config.js';
const ConfigPath = './config.js';
const ResourcePath = './resources';
const FilePath = './files';

const DefaultConfigAbsolutePath = getAbsPath(DefaultConfigPath);
const ConfigAbsolutePath = getAbsPath(ConfigPath);
const ResourceAbsolutePath = path.join(__dirname, ResourcePath);
const FileAbsolutePath = path.join(__dirname, FilePath);

if (!fs.existsSync(ConfigAbsolutePath)) {
	fs.cpSync(path.join(__dirname, DefaultConfigPath), ConfigAbsolutePath);
}

if (fs.existsSync(FileAbsolutePath)) {
	try {
		fs.rmSync(FileAbsolutePath, {recursive: true});
	} catch (e) {
		console.error(`Failed to delete directory: ${FileAbsolutePath}`);
	}
}
fs.mkdirSync(FileAbsolutePath, {recursive: true});

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

const config = deepMergeObject(require(DefaultConfigAbsolutePath).default, require(ConfigAbsolutePath).default);

// noinspection JSUnusedGlobalSymbols
const storage = multer.diskStorage({
	destination: FileAbsolutePath,
	filename: (req, file, cb) => {
		file.name = Buffer.from(file.originalname, "latin1").toString("utf8");

		const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
		const fileName = `${file.fieldname}-${uniqueSuffix}`;
		cb(null, fileName);

		req.on('aborted', () => {
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

// 设置文本传输最大容量
app.use(bodyParser.text({limit: `${config.TEXT_STORE_CAPACITY}mb`}));

// biu~
app.post('/biu', (req, res) => {
	let matched = true, consoleText;
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
	} else {
		consoleText = "biu~";
		matched = false;
	}
	res.json({
		text: matched ? "已收到您的反馈，但是我们不会处理。" : "已收到您的反馈，我们将尽快处理。", console: consoleText
	});
});

// 提取码长度
app.get('/extract/code/length', (req, res) => {
	res.json({length: config.EXTRACT_CODE_LENGTH});
});

// 文本上传
app.post('/upload/text', (req, res) => {
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
		res.status(403).json({status: false, message: '文本暂存空间已满，请稍后再试。'});
		return;
	}

	const extractionCode = generateExtractionCode(config.EXTRACT_CODE_LENGTH);
	codeStore[extractionCode] = {
		type: "text", text,
		size: text.length,
		expiration: Date.now() + config.TEXT_EXPIRE_INTERVAL
	};

	console.log(`Text uploaded: ${extractionCode}`);
	res.json({status: true, code: extractionCode.toUpperCase()});
});

// 文本提取
app.get('/extract/text/:code', (req, res) => {
	const extractionCode = req.params.code.toLowerCase();
	const textInfo = codeStore[extractionCode];

	if (!textInfo || Date.now() > textInfo.expiration) {
		console.log(`Text not found or has expired: ${extractionCode}`);
		res.status(404).json({status: false, message: '提取码不存在或已过期。'});
	} else if (textInfo.type !== "text") {
		console.log(`Specified code is not a text: ${extractionCode}`);
		res.status(400).json({status: false, message: '指定的提取码类型不是文本。'});
	} else {
		console.log(`Text extracted: ${extractionCode}`);
		res.json({status: true, text: textInfo.text});
	}
});

// 文件上传
app.post('/upload/files', upload.array('files'), (req, res) => {
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
		res.status(403).json({status: false, message: '文件暂存空间已满，请稍后再试。'});
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

	const extractionCode = generateExtractionCode(1);
	codeStore[extractionCode] = {
		type: "files", files,
		size: filesSize,
		expiration: Date.now() + config.FILE_EXPIRE_INTERVAL
	};

	console.log(`File uploaded: ${extractionCode}`);
	res.json({status: true, code: extractionCode.toUpperCase()});
});

// 文件提取
app.get('/extract/files/:code', (req, res) => {
	const extractionCode = req.params.code.toLowerCase();
	const fileInfo = codeStore[extractionCode];

	if (!fileInfo) {
		console.log(`File not found or has expired: ${extractionCode}`);
		res.status(404).json({status: false, message: '提取码不存在或已过期。'});
	} else if (Date.now() > fileInfo.expiration) {
		console.log(`File has expired: ${extractionCode}`);
		const expDate = new Date(fileInfo.expiration);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		res.status(404).json({status: false, message: `提取码已于 ${datetime} 过期。`});
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
				res.json({status: true, codes});
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
				res.json({status: true, codes});
				break;
			}
			default: {
				console.log(`Specified code is not a file: ${extractionCode}`);
				res.status(400).json({status: false, message: '指定的提取码类型不是文件。'});
				break;
			}
		}
	}
});

// 文件下载
app.get('/down/:code', (req, res) => {
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

// 文件播放
app.get('/play/:code', (req, res) => {
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
		res.setHeader('Content-Type', 'video/*');
		res.setHeader('Content-Disposition', `inline; filename=${path.basename(linkInfo.originalName)}`);
		res.sendFile(absFilePath);
	}
});

// index.html
app.get('/', (req, res) => {
	res.sendFile('index.html', {root: ResourceAbsolutePath});
});

// favicon.ico
app.get('/favicon.ico', (req, res) => {
	res.sendFile('favicon.ico', {root: ResourceAbsolutePath});
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

app.listen(port, () => {
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