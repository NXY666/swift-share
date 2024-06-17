import crypto from "crypto";
import {File, FileStatus, ShareFile} from "./File";
import {Api, Url} from "./Request";
import {getConfig} from "@/modules/Config";
import path from "path";
import {clearTimerTimeout, setTimerTimeout} from "@/modules/Timer";
import chokidar from "chokidar";
import {CodeInfoTypes} from "@/types/CodeType";
import {Client} from "@/modules/WebSocket";

const CONFIG = getConfig();

export class CodeStore {
	static #store: { [key: string]: CodeInfo } = {};

	/**
	 * 获取提取码信息
	 * @param code 提取码
	 * @return 提取码信息
	 */
	static getCodeInfo(code: string): CodeInfo {
		return this.#store[code?.toLowerCase()];
	}

	/**
	 * 移除提取码信息
	 * @param code 提取码
	 */
	static removeCodeInfo(code: string): void {
		delete this.#store[code.toLowerCase()];
	}

	static getAllCodeInfo(): CodeInfo[] {
		return Object.values(this.#store);
	}

	static clearAllCodeInfo(): void {
		for (const codeInfo of Object.values(this.#store)) {
			if (!(codeInfo instanceof ShareCodeInfo)) {
				codeInfo.remove();
			}
		}
	}

	/**
	 * 保存提取码信息
	 * @param codeInfo 提取码信息
	 */
	static saveCodeInfo(codeInfo: CodeInfo) {
		if (codeInfo.code) {
			this.#store[codeInfo.code] = codeInfo;
		} else {
			const code = this.#getUniqueCode();
			codeInfo.code = code;
			this.#store[code] = codeInfo;
		}
	}
	static getUsedSpace(type: CodeInfoTypes): number {
		let size = 0;
		for (const codeInfo of Object.values(this.#store)) {
			if (codeInfo instanceof type) {
				size += codeInfo.size;
			}
		}
		return size;
	}
	static #getUniqueCode() {
		let failedCount = 0;
		while (true) {
			const code = CodeStore.#generateCode(CONFIG.CODE.EXTRACT_LENGTH);
			if (!this.#store[code]) {
				return code;
			}
			if (++failedCount > 64) {
				CONFIG.CODE.EXTRACT_LENGTH++;
			}
		}
	}
	static #generateCode(length: number) {
		return crypto.randomBytes(length).toString('hex');
	}
}

abstract class CodeInfo {
	abstract readonly expireInterval: number;

	expireAutoRemoveTimer: number;

	#code: string = null;

	#createTime: number = Date.now();

	protected constructor() {
		// 到期自动移除计时器
		setTimeout(() => this.expireAutoRemoveTimer = setTimerTimeout(() => {
			console.debug('[CodeInfo][Constructor]', 'Code has auto removed:', this.code);
			this.remove();
		}, this.removeTime - Date.now()));
	}

	get expireTime(): number {
		return this.#createTime + this.expireInterval;
	}

	get removeTime(): number {
		return this.expireTime + CONFIG.STORE.LINK.EXPIRE_INTERVAL;
	}

	get code() {
		return this.#code;
	}

	set code(code) {
		if (this.#code === null) {
			this.#code = code;
		}
	}

	abstract get size(): number;

	/**
	 * 获取用于刷新上传文件检查点的URL
	 * @return {string}
	 */
	getSignedCheckpointUrl(): string {
		const urlObj = Url.mergeUrl({pathname: Api.UPLOAD_FILES_CHECKPOINT});
		urlObj.searchParams.set('code', this.#code);
		return Url.sign(urlObj.shortHref, CONFIG.STORE.FILE.UPLOAD_INTERVAL);
	}

	/**
	 * 刷新上传文件检查点
	 */
	checkpoint() {
	}

	hasExpired() {
		return Date.now() > this.expireTime;
	}

	remove() {
		clearTimerTimeout(this.expireAutoRemoveTimer);
		CodeStore.removeCodeInfo(this.#code.toString());
	}
}

export class TextCodeInfo extends CodeInfo {
	readonly expireInterval = CONFIG.STORE.TEXT.EXPIRE_INTERVAL;

	readonly #text: string;

	constructor(text: string) {
		super();
		this.#text = text;
	}

	get text() {
		return this.#text;
	}

	get size(): number {
		return this.#text.length;
	}
}

export class FileCodeInfo extends CodeInfo {
	readonly expireInterval = CONFIG.STORE.FILE.EXPIRE_INTERVAL;

	/**
	 * 文件列表
	 */
	readonly #files: File[];

	constructor(files: File[]) {
		super();
		this.#files = files;
	}

	/**
	 * 文件列表
	 * @return {File[]}
	 */
	get files(): File[] {
		return this.#files;
	}

	get size(): number {
		return this.#files.reduce((size, file) => file.status !== FileStatus.REMOVED ? size + file.size : size, 0);
	}

	checkpoint() {
		this.#files.forEach(file => file.checkpoint());
	}

	remove() {
		super.remove();
		this.#files.forEach(file => file.remove());
	}
}

export class ShareCodeInfo extends CodeInfo {
	expireInterval = Infinity;

	readonly #path: string;

	readonly #files: { [key: string]: ShareFile } = {};

	constructor(sharePath: string) {
		super();
		this.#path = sharePath;

		// 监听文件变化(add、change、unlink)
		chokidar
			.watch(sharePath, {persistent: false})
			.on('add', (filePath, fileStats) => {
				console.debug('[ShareCodeInfo][add]', 'Share file added:', filePath);
				const file = new ShareFile({name: path.relative(this.#path, filePath), size: fileStats.size});
				file.upload(-1, filePath);
				this.#files[file.name] = file;
			})
			.on('unlink', (filePath) => {
				console.debug('[ShareCodeInfo][unlink]', 'Share file removed:', filePath);
				const file = this.#files[path.relative(this.#path, filePath)];
				if (file) {
					file.remove();
					delete this.#files[file.name];
				}
			})
			.on('change', (filePath, fileStats) => {
				console.debug('[ShareCodeInfo][change]', 'Share file changed:', filePath);
				const file = this.#files[path.relative(this.#path, filePath)];
				if (file) {
					file.size = fileStats.size;
				}
			})
			.on('error', (error) => {
				console.debug('[ShareCodeInfo][error]', 'Error:', error);
			});
	}

	// 从path中读取所有文件，包含子文件夹
	get files(): ShareFile[] {
		return Object.values(this.#files);
	}

	get path() {
		return this.#path;
	}

	get size(): number {
		return 0;
	}

	remove() {
		super.remove();
		for (const file of Object.values(this.#files)) {
			file.remove();
		}
	}
}

export class DropCodeInfo extends CodeInfo {
	readonly expireInterval = Infinity;

	readonly #data: ({ type: 'text', codeInfo: TextCodeInfo } | { type: 'files', codeInfo: FileCodeInfo })[] = [];

	#recvClient: Client = null;

	readonly #sendClients: Client[] = [];

	constructor() {
		super();

		// 2分钟后如果没有连接则自动移除
		setTimerTimeout(() => {
			if (!this.#recvClient) {
				console.debug('[DropCodeInfo][Constructor]', 'Code has auto removed:', this.code);
				this.remove();
			}
		}, CONFIG.STORE.DROP.CONNECT_TIMEOUT);
	}

	get size(): number {
		return 0;
	}

	receiverConnect(client: Client) {
		if (this.#recvClient) {
			throw new Error('Only one connection can be received.');
		}

		this.#recvClient = client;

		client.on('close', () => this.remove());
	}

	senderConnect(client: Client) {
		this.#sendClients.push(client);

		client.on('close', () => {
			const index = this.#sendClients.indexOf(client);
			if (index !== -1) {
				this.#sendClients.splice(index, 1);
			}
		});
	}

	getSignedWsRecvUrl(): string {
		const urlObj = Url.mergeUrl({pathname: Api.WS_DROP_RECV});
		urlObj.searchParams.set('code', this.code);
		return Url.sign(urlObj.shortHref, CONFIG.STORE.FILE.UPLOAD_INTERVAL);
	}

	getSignedWsSendUrl(): string {
		const urlObj = Url.mergeUrl({pathname: Api.WS_DROP_SEND});
		urlObj.searchParams.set('code', this.code);
		return Url.sign(urlObj.shortHref, CONFIG.STORE.FILE.UPLOAD_INTERVAL);
	}

	notifyRecv(type: 'text' | 'file' | 'files', data: any) {
		this.#recvClient?.send(JSON.stringify({type, data}));
	}

	addText(textCodeInfo: TextCodeInfo) {
		this.#data.push({type: 'text', codeInfo: textCodeInfo});

		this.notifyRecv('text', {text: textCodeInfo.text});
	}

	addFiles(fileCodeInfo: FileCodeInfo) {
		this.#data.push({type: 'files', codeInfo: fileCodeInfo});

		// 生成下载配置
		const fileDownloadConfigs = [];
		for (const file of fileCodeInfo.files) {
			const downloadConfig = file.getDownloadConfig();
			fileDownloadConfigs.push(downloadConfig);
		}

		if (fileCodeInfo.files.length > 1) {
			this.notifyRecv('files', {
				code: fileCodeInfo.code,
				firstFileName: fileCodeInfo.files[0].name,
				fileCount: fileCodeInfo.files.length
			});
		} else {
			this.notifyRecv('file', {
				code: fileCodeInfo.code,
				fileName: fileCodeInfo.files[0].name
			});
		}
	}

	remove() {
		super.remove();
		if (this.#recvClient) {
			this.#recvClient.close();
		}
		this.#sendClients.forEach(conn => conn.close());
	}
}
