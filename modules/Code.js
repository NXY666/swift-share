import crypto from "crypto";
import DefaultConfig from "../default_config.js";
import {File} from "./File.js";
import {Api, Url} from "./Url.js";

export class CodeStore {
	static #store = {};

	/**
	 * 获取提取码信息
	 * @param {string} code 提取码
	 * @return {FileCodeInfo|TextCodeInfo|ShareCodeInfo} 提取码信息
	 */
	static getCodeInfo(code) {
		return this.#store[code.toLowerCase()];
	}

	/**
	 * 保存提取码信息
	 * @param {FileCodeInfo|TextCodeInfo|ShareCodeInfo} codeInfo 提取码信息
	 */
	static saveCodeInfo(codeInfo) {
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

	static #generateCode(length) {
		return crypto.randomBytes(length).toString('hex');
	}

	static getUsedSpace(type) {
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
	#code = null;
	#type;
	#size;

	constructor(type, size = 0) {
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

	getSignedCheckpointUrl({host} = {}) {
		const url = Url.mergeUrl({protocol: "http", host, pathname: Api.UPLOAD_FILES_CHECKPOINT});
		url.searchParams.set('code', this.#code);
		return Url.sign(url.toString(), DefaultConfig.FILE_EXPIRE_INTERVAL);
	}

	isValidUrl(url) {
		return Url.check(url);
	}

	hasExpired() {
		return Date.now() > this._expireTime;
	}
}

export class TextCodeInfo extends CodeInfo {
	#text;

	constructor(text) {
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
	#files;

	/**
	 *
	 * @param {File[]} files
	 */
	constructor(files) {
		super('files', files.reduce((size, file) => size + file.size, 0));
		this.#files = files;
		this._expireTime = Date.now() + DefaultConfig.FILE_EXPIRE_INTERVAL;
	}

	/**
	 * 文件列表
	 * @return {File[]}
	 */
	get files() {
		return this.#files;
	}
}

export class ShareCodeInfo extends CodeInfo {
	#path;

	constructor(path) {
		super('share', 0);
		this.#path = path;
	}

	get path() {
		return this.#path;
	}
}