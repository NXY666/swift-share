import crypto from "crypto";
import DefaultConfig from "../resources/default_config.js";
import {File, FileStatus} from "./File.js";
import {Api, Url} from "./Url.js";

export class CodeStore {
	static #store: { [key: string]: CodeInfo } = {};

	/**
	 * 获取提取码信息
	 * @param {string} code 提取码
	 * @return {FileCodeInfo|TextCodeInfo|ShareCodeInfo} 提取码信息
	 */
	static getCodeInfo(code: string): CodeInfo {
		return this.#store[code.toLowerCase()];
	}

	/**
	 * 移除提取码信息
	 * @param {string} code 提取码
	 */
	static removeCodeInfo(code: string): void {
		delete this.#store[code.toLowerCase()];
	}

	/**
	 * 全部提取码自检
	 */
	static checkAll() {
		for (const codeInfo of Object.values(this.#store)) {
			codeInfo.check();
		}
	}

	/**
	 * 保存提取码信息
	 * @param {FileCodeInfo|TextCodeInfo|ShareCodeInfo} codeInfo 提取码信息
	 */
	static saveCodeInfo(codeInfo: CodeInfo) {
		const code = this.#getUniqueCode();
		codeInfo.code = code;
		this.#store[code] = codeInfo;
	}

	static #getUniqueCode() {
		while (true) {
			const code = CodeStore.#generateCode(DefaultConfig.EXTRACT_CODE_LENGTH);
			if (!this.#store[code]) {
				return code;
			}
		}
	}

	static #generateCode(length: number) {
		return crypto.randomBytes(length).toString('hex');
	}

	static getUsedSpace(type: string) {
		let size = 0;
		for (const codeInfo of Object.values(this.#store)) {
			if (codeInfo.type === type) {
				size += codeInfo.size;
			}
		}
		return size;
	}
}

class CodeInfo {
	#code: string = null;
	#type: string;
	#size: number;

	constructor(type: string, size = 0) {
		this.#type = type;
		this.#size = size;
	}

	_expireTime = Infinity;

	/**
	 * @return {number}
	 */
	get expireTime() {
		return this._expireTime;
	}

	get code() {
		return this.#code;
	}

	set code(code) {
		if (this.#code === null) {
			this.#code = code;
		}
	}

	get type() {
		return this.#type;
	}

	get size() {
		return this.#size;
	}

	/**
	 * 获取用于刷新上传文件检查点的URL
	 * @param host
	 * @return {string}
	 */
	getSignedCheckpointUrl({host}): string {
		const url = Url.mergeUrl({protocol: "http", host, pathname: Api.UPLOAD_FILES_CHECKPOINT});
		url.searchParams.set('code', this.#code);
		return Url.sign(url.toString(), DefaultConfig.FILE_EXPIRE_INTERVAL);
	}

	/**
	 * 刷新上传文件检查点
	 */
	checkpoint() {
	}

	/**
	 * 提取码状态自检
	 */
	check() {
		// 本体已过期，则删除记录
		if (this.hasExpired()) {
			this.remove();
		}
	}

	hasExpired() {
		return Date.now() > this._expireTime;
	}

	remove() {
		CodeStore.removeCodeInfo(this.#code.toString());
	}
}

export class TextCodeInfo extends CodeInfo {
	readonly #text: string;

	constructor(text: string) {
		super('text', text.length);
		this.#text = text;
		this._expireTime = Date.now() + DefaultConfig.TEXT_EXPIRE_INTERVAL;
	}

	get text() {
		return this.#text;
	}
}

export class FileCodeInfo extends CodeInfo {
	/**
	 * 文件列表
	 * @type {File[]}
	 */
	#files: File[];

	/**
	 * @param {File[]} files
	 */
	constructor(files: File[]) {
		super('files', files.reduce((size, file) => size + file.size, 0));
		this.#files = files;
		this._expireTime = Date.now() + DefaultConfig.FILE_EXPIRE_INTERVAL + DefaultConfig.LINK_EXPIRE_INTERVAL;
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

	check() {
		super.check();
		this.#files.forEach(file => {
			switch (file.status) {
				case FileStatus.CREATED:
				case FileStatus.UPLOADING: {
					// 文件未及时上传，则删除文件
					if (file.hasUploadTimeout()) {
						file.remove();
					}
					break;
				}
			}
		});
	}

	remove() {
		super.remove();
		this.#files.forEach(file => file.remove());
	}
}

export class ShareCodeInfo extends CodeInfo {
	readonly #path: string;

	constructor(path: string) {
		super('share', 0);
		this.#path = path;
	}

	get path() {
		return this.#path;
	}
}