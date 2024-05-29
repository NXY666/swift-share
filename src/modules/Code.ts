import crypto from "crypto";
import {File, FileStatus, ShareFile} from "./File";
import {Api, Url} from "./Url";
import {getConfig} from "@/modules/Config";
import path from "path";
import {clearTimerTimeout, setTimerTimeout} from "@/modules/Timer";
import chokidar from "chokidar";

const CONFIG = getConfig();

export class CodeStore {
	static #store: { [key: string]: CodeInfo } = {};

	/**
	 * 获取提取码信息
	 * @param code 提取码
	 * @return 提取码信息
	 */
	static getCodeInfo(code: string): CodeInfo {
		return this.#store[code.toLowerCase()];
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

	static getUsedSpace(type: CodeInfoTypes): number {
		let size = 0;
		for (const codeInfo of Object.values(this.#store)) {
			if (codeInfo instanceof type) {
				size += codeInfo.size;
			}
		}
		return size;
	}
}

abstract class CodeInfo {
	#code: string = null;

	abstract readonly expireInterval: number;

	#createTime: number = Date.now();

	expireAutoRemoveTimer: number;

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
	 * @param protocol
	 * @param host
	 * @return {string}
	 */
	getSignedCheckpointUrl({protocol, host}): string {
		const url = Url.mergeUrl({protocol, host, pathname: Api.UPLOAD_FILES_CHECKPOINT});
		url.searchParams.set('code', this.#code);
		return Url.sign(url.toString(), CONFIG.STORE.FILE.UPLOAD_INTERVAL);
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

type CodeInfoTypes = typeof FileCodeInfo | typeof TextCodeInfo | typeof ShareCodeInfo;

export class TextCodeInfo extends CodeInfo {
	readonly #text: string;

	expireInterval = CONFIG.STORE.TEXT.EXPIRE_INTERVAL;

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
	/**
	 * 文件列表
	 */
	readonly #files: File[];

	expireInterval = CONFIG.STORE.FILE.EXPIRE_INTERVAL;

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

	checkpoint() {
		this.#files.forEach(file => file.checkpoint());
	}

	remove() {
		super.remove();
		this.#files.forEach(file => file.remove());
	}

	get size(): number {
		return this.#files.reduce((size, file) => file.status !== FileStatus.REMOVED ? size + file.size : size, 0);
	}
}

export class ShareCodeInfo extends CodeInfo {
	readonly #path: string;

	readonly #files: { [key: string]: ShareFile } = {};

	expireInterval = Infinity;

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
}
