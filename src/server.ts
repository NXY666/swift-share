import {FileAbsolutePath, getConfig, ResourceAbsolutePath} from "@/modules/Config";
import fs from "fs";
import {CodeStore, DropCodeInfo, FileCodeInfo, ShareCodeInfo, TextCodeInfo} from "@/modules/Code";
import multer from "multer";
import path from "path";
import express from "express";
import bodyParser from "body-parser";
import {Api, parseRange, Url} from "@/modules/Request";
import {File, FileStatus, MultipartFile, SimpleFile} from "@/modules/File";
import mime from "mime/lite";
import http from "http";
import {WebSocketServer} from "ws";
import {Client} from "@/modules/WebSocket";

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
				fs.unlink(fullFilePath, err => {
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

// 为 Request 添加额外属性
declare global {
	namespace Express {
		// noinspection JSUnusedGlobalSymbols
		interface Request {
			signed: boolean;
			urlInfo: {
				protocol: string | null;
				host: string | null;
				path: string | null;
				basePath: string | null;
			};
		}
	}
}

function renderTemplate(template: string, data: { [x: string]: any; }) {
	// 使用正则表达式匹配占位符，并替换为相应的变量值
	return template.replace(/\$\{(\w+)}/g, (_match, key) => {
		// 如果 data 对象中存在对应的键，则返回其值，否则返回空字符串
		if (data[key] !== undefined) {
			return data[key];
		} else {
			console.warn(`No value found for key: ${key}`);
			return '';
		}
	});
}

app.use((req, _res, next) => {
	const urlInfo = {
		protocol: null,
		host: null,
		path: null,
		basePath: null
	};

	if (req.get("origin")) {
		const {protocol, host} = new URL(req.get("origin"));
		// https: / http:
		urlInfo.protocol = protocol;
		// host:port
		urlInfo.host = host;
	} else {
		// http / https
		urlInfo.protocol = (req.get('X-Forwarded-Proto') || req.protocol);
		// host:port
		urlInfo.host = req.get('host');
	}

	// 格式化 protocol
	urlInfo.protocol = urlInfo.protocol.replace(/:$/, "");

	// 路径
	urlInfo.path = req.originalUrl;
	urlInfo.basePath = req.get('X-Forwarded-Path')?.replace(/\/$/, "") || "";

	// 验证URL
	req.signed = Url.check(new URL(urlInfo.path, `${urlInfo.protocol}://${urlInfo.host}${urlInfo.path}`));

	req.urlInfo = urlInfo;

	// 调用下一个中间件或路由处理器
	next();
});

[
	{
		file: "/osd.xml",
		type: "application/opensearchdescription+xml",
		handler: (req: any, _res: any) => ({
			absoluteBasePath: `${req.urlInfo.protocol}://${req.urlInfo.host}${req.urlInfo.basePath}`,
		})
	},
	{
		file: "/app.webmanifest",
		type: "application/manifest+json",
		handler: (req: any, _res: any) => ({
			basePath: req.urlInfo.basePath
		})
	},
	{
		file: "/",
		type: "text/html",
		handler: (req: any, _res: any) => ({
			basePath: req.urlInfo.basePath
		})
	}
].forEach(({file, type, handler}) => {
	app.get(file, async (req, res) => {
		if (file === "/") {
			file = "index.html";
		}

		const source = await fs.promises.readFile(path.join(ResourceAbsolutePath, "tmpl", file), 'utf8');

		if (type) {
			res.type(type);
		}

		res.send(renderTemplate(source, handler(req, res)));
	});
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
	// console.log(_req.headers['x-forwarded-for'] || _req.socket.remoteAddress);
	res.json(Api);
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

	const {drop} = req.query;

	if (drop) {
		const dropCodeInfo = CodeStore.getCodeInfo(drop as string);
		if (dropCodeInfo instanceof DropCodeInfo) {
			dropCodeInfo.addText(codeInfo);
		}
	}

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
		res.json({text: codeInfo.text});
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

	const {drop} = req.query;

	if (drop) {
		const dropCodeInfo = CodeStore.getCodeInfo(drop as string);
		if (dropCodeInfo instanceof DropCodeInfo) {
			dropCodeInfo.addFiles(codeInfo);
		}
	}

	res.json({
		code: codeInfo.code,
		checkpointUrl: codeInfo.getSignedCheckpointUrl(),
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
		console.error('File not found or has expired:', extractionCode);
		res.status(404).json({message: '提取码不存在或已过期。'});
		return;
	} else if (codeInfo.hasExpired()) {
		console.error('File has expired:', extractionCode);
		const expDate = new Date(codeInfo.expireTime);
		const datetime = `${expDate.getFullYear()}.${(expDate.getMonth() + 1).toString().padStart(2, '0')}.${expDate.getDate().toString().padStart(2, '0')} ${expDate.getHours().toString().padStart(2, '0')}:${expDate.getMinutes().toString().padStart(2, '0')}:${expDate.getSeconds().toString().padStart(2, '0')}`;
		res.status(404).json({message: `提取码已于 ${datetime} 过期。`});
		return;
	}

	if (codeInfo instanceof FileCodeInfo || codeInfo instanceof ShareCodeInfo) {
		console.info('File extracted:', extractionCode);
		// 生成下载配置
		const fileDownloadConfigs = [];
		for (const file of codeInfo.files) {
			const downloadConfig = file.getDownloadConfig();
			fileDownloadConfigs.push(downloadConfig);
		}
		res.json({configs: fileDownloadConfigs});
	} else {
		console.error('Specified code is not a file:', extractionCode);
		res.status(400).json({message: '指定的提取码类型不是文件。'});
	}
});

// 文件获取
app.get(Api.FETCH, (req, res) => {
	const {id, type} = req.query;

	const file = File.findFileById(id as string);

	if (!req.signed) {
		console.error('Invalid signature.');
		res.status(403).send("请求不够安全。");
		return;
	} else if (!file) {
		console.error('File not found:', id);
		res.status(404).send("文件不存在或已过期。");
		return;
	} else if (file.status === FileStatus.REMOVED) {
		console.error('File removed:', id);
		res.status(404).send("文件已被删除。");
		return;
	}
	console.info('File fetched:', id);

	// range支持
	const range = parseRange(req.headers.range, file.size, true);
	if (range) {
		const {start, end} = range;
		res.status(206);
		res.setHeader('Content-Length', end - start + 1);
		res.setHeader('Accept-Ranges', 'bytes');
		res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
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
		console.error('Failed to download file:', id);
		res.end();
	});
	downloadStream.pipe(res);
});

// 申请投送接收端
app.get(Api.DROP_RECV_APPLY, (_req, res) => {
	const codeInfo = new DropCodeInfo();
	CodeStore.saveCodeInfo(codeInfo);

	res.json({code: codeInfo.code, wsRecvUrl: codeInfo.getSignedWsRecvUrl()});
});

// 申请投送发送端
app.get(Api.DROP_SEND_APPLY, (_req, res) => {
	const {code} = _req.query;

	const codeInfo = CodeStore.getCodeInfo(code as string);

	if (!codeInfo) {
		console.error('Code not found:', code);
		res.status(404).json({message: '连接码不存在。'});
		return;
	} else if (codeInfo.hasExpired()) {
		console.error('Code has expired:', code);
		res.status(404).json({message: '连接码已过期。'});
		return;
	} else if (!(codeInfo instanceof DropCodeInfo)) {
		console.error('Specified code is not a drop:', code);
		res.status(404).json({message: '连接码不存在。'});
		return;
	}

	res.json({wsSendUrl: codeInfo.getSignedWsSendUrl()});
});

const server = http.createServer(app);

const wss = new WebSocketServer({server});

// 监听WebSocket连接事件
wss.on('connection', (ws, req) => {
	const url = new URL(req.url, "ws://websocket.client/");

	// 验证URL
	const signed = Url.check(url);

	const {searchParams} = url;
	switch (url.pathname) {
		case Api.WS_DROP_RECV: {
			if (!signed) {
				console.error('Invalid signature.');
				ws.close(4003, "请求不够安全。");
				return;
			}

			const code = searchParams.get('code');

			const codeInfo = CodeStore.getCodeInfo(code);

			if (!codeInfo) {
				console.error('Code not found:', code);
				ws.close(4001, "连接码不存在或已过期。");
				return;
			} else if (codeInfo.hasExpired()) {
				console.error('Code has expired:', code);
				ws.close(4001, "连接码不存在或已过期。");
				return;
			}

			if (codeInfo instanceof DropCodeInfo) {
				console.info('Drop receiver connected:', code);
				const client = new Client('drop', code, ws);
				codeInfo.receiverConnect(client);
			} else {
				console.error('Specified code is not a drop:', code);
				ws.close(4001, "连接码不存在或已过期。");
			}
			break;
		}
		case Api.WS_DROP_SEND: {
			if (!signed) {
				console.error('Invalid signature.');
				ws.close(4003, "请求不够安全。");
				return;
			}

			const code = searchParams.get('code');

			const codeInfo = CodeStore.getCodeInfo(code);

			if (!codeInfo) {
				console.error('Code not found:', code);
				ws.close(4001, "连接码不存在或已过期。");
				return;
			} else if (codeInfo.hasExpired()) {
				console.error('Code has expired:', code);
				ws.close(4001, "连接码不存在或已过期。");
				return;
			}

			if (codeInfo instanceof DropCodeInfo) {
				console.info('Drop sender connected:', code);
				const client = new Client('drop', code, ws);
				codeInfo.senderConnect(client);
			} else {
				console.error('Specified code is not a drop:', code);
				ws.close(4001, "连接码不存在或已过期。");
			}
			break;
		}
		default: {
			ws.close();
			break;
		}
	}
});

server.listen(port, () => {
	console.info(`Server is running on http://localhost:${port}/ .`);
});

process.on("SIGINT", () => {
	console.info("Server is shutting down...");
	try {
		fs.rmSync(FileAbsolutePath, {recursive: true, force: true});
	} catch (e) {
		console.error('Failed to delete directory:', FileAbsolutePath, 'Error:', e.stack);
	}
	process.exit(0);
});

process.on('uncaughtException', err => {
	console.error(err.stack);
});
