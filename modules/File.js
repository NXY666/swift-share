import DefaultConfig from "../default_config.js";
import crypto from "crypto";
import fs from "fs";
import {Url} from "./Url.js";
import {Stream} from "./Stream.js";

let activeFileId = 0;
const fileMap = new Map();
function generateFileId() {
	return activeFileId++;
}
/**
 * 根据 ID 查找文件
 * @param {number} id
 * @return {File}
 */
export function findFileById(id) {
	return fileMap.get(id);
}

export class FileStatus {
	static CREATED = 0;
	static UPLOADING = 1;
	static UPLOADED = 2;
	static REMOVED = 3;
}

export class File {
	/**
	 * 文件ID
	 * @type {number}
	 */
	#id = generateFileId();
	/**
	 * 文件上传期限
	 * @type {number}
	 */
	#uploadDeadline = Date.now() + DefaultConfig.FILE_UPLOAD_INTERVAL;
	/**
	 * 访问 UUID
	 * @type {UUID}
	 */
	#key = crypto.randomUUID();
	/**
	 * 文件名
	 * @type {string}
	 */
	#name;
	/**
	 * 文件大小
	 * @type {number}
	 */
	#size;
	/**
	 * 文件状态
	 * @type {number}
	 */
	#status = FileStatus.CREATED;

	#partSize = DefaultConfig.FILE_PART_SIZE;

	constructor({name, size}) {
		fileMap.set(this.#id, this);
		this.#name = name;
		this.#size = size;
	}

	get partSize() {
		return this.#partSize;
	}

	get partCount() {
		return Math.ceil(this.size / this.partSize);
	}

	get key() {
		return this.#key;
	}

	get name() {
		return this.#name;
	}

	get size() {
		return this.#size;
	}

	/**
	 * @return {number}
	 */
	get status() {
		return this.#status;
	}

	get id() {
		return this.#id;
	}

	// 因为子类要用，所以不能用 private
	_changeStatus(status) {
		this.#status = status;
	}

	upload() {
		// 已上传或已删除的文件不可再上传
		if (this.status === FileStatus.UPLOADED || this.status === FileStatus.REMOVED) {
			return false;
		}
		if (this.status === FileStatus.CREATED) {
			this._changeStatus(FileStatus.UPLOADING);
		}
		return true;
	}

	remove() {
		fileMap.delete(this.id);
		const status = this.status;
		this._changeStatus(FileStatus.REMOVED);
		return status === FileStatus.UPLOADING || status === FileStatus.UPLOADED;
	}

	/**
	 * 获取上传配置
	 * @returns {{id: number, key: UUID, parts: {index: number, range?: [number, number]}[]}}
	 */
	getUploadConfig() {
		return {
			id: this.id,
			key: this.key,
			parts: []
		};
	}

	download() {
		throw new Error("Not implemented");
	}

	/**
	 * 获取下载配置
	 * @returns {{name: string, size: number, parts: { index: number, url: string, range: number[2], uploaded: boolean }[], wsUrl: string}}
	 */
	getDownloadConfig(apiUrl, allowMultiPart = false) {
		return {
			id: this.id,
			name: this.name,
			size: this.size,
			parts: [],
			wsUrl: this.getSignedWsUrl(apiUrl)
		};
	}

	getSignedPartUrl(apiUrl, index = -1) {
		const apiUrlObj = new URL(apiUrl);
		apiUrlObj.searchParams.set("id", this.id.toString());
		apiUrlObj.searchParams.set("index", index.toString());
		return Url.sign(apiUrlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	getSignedWsUrl(apiUrl) {
		const wsUrlObj = new URL(apiUrl);
		wsUrlObj.protocol = "ws";
		wsUrlObj.searchParams.set("id", this.id.toString());
		return Url.sign(wsUrlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	/**
	 * 检查签名
	 * @param url
	 * @return {boolean}
	 */
	checkSignature(url) {
		url = new URL(url, "local://check.sign/").toString();
		if (Url.check(url)) {
			const urlObj = new URL(url);
			return urlObj.searchParams.get("id") === this.id.toString();
		} else {
			return false;
		}
	}
}

export class SimpleFile extends File {
	#path;

	constructor({name, size}) {
		super({name, size});
	}

	upload(index, file) {
		if (super.upload()) {
			// 检查索引
			if (index !== -1) {
				return false;
			}
			// 检查文件大小
			if (file.size !== this.size) {
				return false;
			}
			this.#path = file.path;
			this._changeStatus(FileStatus.UPLOADED);
			return true;
		} else {
			return false;
		}
	}

	remove() {
		if (super.remove()) {
			try {
				fs.unlinkSync(this.#path);
			} catch (e) {
				console.error("[RemoveSimpleFile]", e);
			}
		}
	}

	getUploadConfig() {
		const uploadConfig = super.getUploadConfig();
		uploadConfig.parts.push({
			index: -1
		});
		return uploadConfig;
	}

	getDownloadConfig(apiUrl = "local://download.config/", allowMultiPart = false) {
		const downloadConfig = super.getDownloadConfig(apiUrl);
		if (allowMultiPart) {
			for (let i = 0; i < this.partCount; i++) {
				// 最后一片可能不完整
				downloadConfig.parts.push({
					index: i,
					range: [i * this.partSize, Math.min((i + 1) * this.partSize, this.size)],
					url: this.getSignedPartUrl(apiUrl, i),
					uploaded: this.status === FileStatus.UPLOADED
				});
			}
		} else {
			downloadConfig.parts.push({
				index: -1,
				range: [0, this.size],
				url: this.getSignedPartUrl(apiUrl),
				uploaded: this.status === FileStatus.UPLOADED
			});
		}
		return downloadConfig;
	}

	download(index) {
		if (index === -1) {
			const downloadConfig = this.getDownloadConfig(undefined, false);
			const activePart = downloadConfig.parts[0];
			if (activePart.uploaded) {
				// 返回整个文件流
				return fs.createReadStream(this.#path);
			} else {
				return null;
			}
		} else {
			const downloadConfig = this.getDownloadConfig(undefined, true);
			const activePart = downloadConfig.parts[index];
			if (activePart.uploaded) {
				// 返回分片文件流
				return fs.createReadStream(this.#path, {start: activePart.range[0], end: activePart.range[1] - 1
				});
			} else {
				return null;
			}
		}
	}
}

export class MultipartFile extends File {
	#paths = [];

	constructor({name, size}) {
		super({name, size});
	}

	/**
	 * 上传
	 * @param {number} index
	 * @param file
	 * @return {boolean}
	 */
	upload(index, file) {
		if (super.upload()) {
			// 检查索引
			if (index < 0 || index >= this.partCount) {
				return false;
			}
			const uploadConfig = this.getUploadConfig();
			const activePart = uploadConfig.parts[index];
			// 检查文件大小
			if (file.size !== activePart.range[1] - activePart.range[0]) {
				return false;
			}
			this.#paths[index] = file.path;
			if (this.#paths.filter(item => item).length === this.partCount) {
				this._changeStatus(FileStatus.UPLOADED);
			}
			return true;
		} else {
			return false;
		}
	}

	getUploadConfig() {
		const uploadConfig = super.getUploadConfig();
		for (let i = 0; i < this.partCount; i++) {
			// 最后一片可能不完整
			uploadConfig.parts.push({
				index: i,
				range: [i * this.partSize, Math.min((i + 1) * this.partSize, this.size)]
			});
		}
		return uploadConfig;
	}

	getDownloadConfig(apiUrl = "local://download.config/", allowMultiPart = false) {
		const downloadConfig = super.getDownloadConfig(apiUrl);
		if (allowMultiPart) {
			for (let i = 0; i < this.partCount; i++) {
				// 最后一片可能不完整
				downloadConfig.parts.push({
					index: i,
					range: [i * this.partSize, Math.min((i + 1) * this.partSize, this.size)],
					url: this.getSignedPartUrl(apiUrl, i),
					uploaded: this.#paths[i] !== undefined,
				});
			}
		} else {
			downloadConfig.parts.push({
				index: -1,
				range: [0, this.size],
				url: this.getSignedPartUrl(apiUrl),
				uploaded: this.status === FileStatus.UPLOADED
			});
		}
		return downloadConfig;
	}

	download(index) {
		if (index === -1) {
			const downloadConfig = this.getDownloadConfig(undefined, false);
			const activePart = downloadConfig.parts[0];
			if (activePart.uploaded) {
				// 返回整个文件流
				return Stream.mergeStreams(this.#paths.map(function (path) {
					return fs.createReadStream(path);
				}));
			} else {
				// 返回空流
				return Stream.mergeStreams([]);
			}
		} else {
			const downloadConfig = this.getDownloadConfig(undefined, true);
			const activePart = downloadConfig.parts[index];
			if (activePart.uploaded) {
				// 返回分片文件流
				return fs.createReadStream(this.#paths[index]);
			} else {
				// 返回空流
				return Stream.mergeStreams([]);
			}
		}
	}

	remove() {
		if (super.remove()) {
			this.#paths.forEach(path => {
				try {
					fs.unlinkSync(path);
				} catch (e) {
					console.error("[RemoveMultipartFile]", e);
				}
			});
		}
	}
}
