import crypto from "crypto";
import {File, FileStatus, ShareFile} from "./File";
import {Api, Url} from "./Url";
import {getConfig} from "@/modules/Config";
import fs from "fs";
import path from "path";
import {setTimerTimeout} from "@/modules/Timer";

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

	protected constructor() {
		setTimeout(() => setTimerTimeout(() => {
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

	expireInterval = Infinity;

	constructor(path: string) {
		super();
		this.#path = path;
	}

	// 从path中读取所有文件，包含子文件夹
	get files(): File[] {
		const files: ShareFile[] = [];

		// 递归读取文件
		const scanFiles = (filePath: string) => {
			const stat = fs.statSync(filePath);
			if (stat.isDirectory()) {
				fs.readdirSync(filePath).forEach(file => scanFiles(filePath + '/' + file));
			} else {

				const newFile = new ShareFile({name: path.relative(this.#path, filePath), size: stat.size});
				newFile.upload(-1, filePath);
				files.push(newFile);
			}
		};
		scanFiles(this.#path);

		setTimerTimeout(() => {
			files.forEach(file => file.remove());
		}, CONFIG.STORE.LINK.EXPIRE_INTERVAL);

		return files;
	}

	get path() {
		return this.#path;
	}

	get size(): number {
		return 0;
	}
}
