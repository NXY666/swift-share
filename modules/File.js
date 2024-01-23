import DefaultConfig from "../default_config.js";
import crypto from "crypto";
import fs from "fs";
import {Api, Url} from "./Url.js";
import {Stream} from "./Stream.js";
import {Readable} from "stream";
import EventEmitter from "events";

export class FileStatus {
	static CREATED = 0;
	static UPLOADING = 1;
	static UPLOADED = 2;
	static REMOVED = 3;
}

export class File extends EventEmitter {
	static #nextId = 0;

	static #fileMap = {};

	/**
	 * 文件ID
	 * @type {number}
	 */
	#id = File.#nextId++;
	/**
	 * 访问 UUID
	 * @type {UUID}
	 */
	#key = crypto.randomUUID();
	/**
	 * 文件状态
	 * @type {number}
	 */
	#status = FileStatus.CREATED;
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
	 * 分片大小
	 * @type {number}
	 */
	#partSize = DefaultConfig.FILE_PART_SIZE;

	/**
	 * 上传最后期限
	 * @type {number}
	 */
	#uploadDeadline = Date.now() + DefaultConfig.FILE_UPLOAD_INTERVAL;
	/**
	 * 上传检查点
	 * @type {number}
	 */
	#checkpoint = Date.now();

	constructor({name, size}) {
		super();

		File.#fileMap[this.#id] = this;
		this.#name = name;
		this.#size = size;

		// 上传超时
		setTimeout(() => {
			// 上传超时，删除文件
			if (this.status !== FileStatus.UPLOADED) {
				this.remove();
				console.log(`File ${this.id} reached upload deadline but not uploaded.`);
			}
		}, DefaultConfig.FILE_UPLOAD_INTERVAL);
	}

	get id() {
		return this.#id;
	}

	get key() {
		return this.#key;
	}

	get status() {
		return this.#status;
	}

	get name() {
		return this.#name;
	}

	get size() {
		return this.status === FileStatus.REMOVED ? 0 : this.#size;
	}

	get partSize() {
		return this.#partSize;
	}

	get partCount() {
		return Math.ceil(this.size / this.partSize);
	}

	/**
	 * 根据 ID 查找文件
	 * @param {number|string} id
	 * @return {File}
	 */
	static findFileById(id) {
		return this.#fileMap[id];
	}

	/**
	 * 刷新检查点
	 */
	checkpoint() {
		this.#checkpoint = Date.now();
	}

	hasUploadTimeout() {
		// 检查点时间间隔超过5分钟，或者时间超过最后期限
		const now = Date.now();
		return now - this.#checkpoint > DefaultConfig.FILE_UPLOAD_CHECKPOINT_INTERVAL || now > this.#uploadDeadline;
	}

	// 因为子类要用，所以不能用 private
	changeStatus(status) {
		this.#status = status;
		this.emit("statusChange", status);
	}

	/**
	 * 获取上传配置
	 * @returns {{id: number, key: UUID, name: string, parts: {index: number, range?: [number, number]}[], wsUrl: string}}
	 */
	getUploadConfig({host} = {}) {
		return {
			id: this.id,
			key: this.key,
			name: this.name,
			parts: [],
			wsUrl: this.getSignedUploadWsUrl({host})
		};
	}

	upload() {
		// 已上传或已删除的文件不可再上传
		if (this.status === FileStatus.UPLOADED || this.status === FileStatus.REMOVED) {
			return false;
		}

		// 上传超时的文件不可再上传
		if (this.hasUploadTimeout()) {
			return false;
		}

		this.changeStatus(FileStatus.UPLOADING);
		return true;
	}

	/**
	 * 获取下载配置
	 * @returns {{name: string, size: number, parts: { index: number, url: string, range: number[2], uploaded: boolean }[], wsUrl: string, removed: boolean}}
	 */
	getDownloadConfig({host} = {}, allowMultiPart = false) {
		return {
			id: this.id,
			name: this.name,
			size: this.size,
			parts: [],
			wsUrl: this.getSignedDownloadWsUrl({host}),
			removed: this.status === FileStatus.REMOVED
		};
	}

	download() {
		throw new Error("Not implemented");
	}

	remove() {
		if (this.status === FileStatus.REMOVED) {
			return false;
		}

		delete File.#fileMap[this.id];
		this.changeStatus(FileStatus.REMOVED);

		console.log("[RemoveFile]", this.id, this.name, this.status);
		this.emit("remove");
		return true;
	}

	getSignedPartUrl({host} = {}, index = -1) {
		const urlObj = Url.mergeUrl({protocol: "http", host, pathname: Api.DOWN_NEW});
		urlObj.searchParams.set("id", this.id.toString());
		urlObj.searchParams.set("index", index.toString());
		return Url.sign(urlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	getSignedDownloadWsUrl({host} = {}) {
		const wsUrlObj = Url.mergeUrl({protocol: "ws", host, pathname: Api.WS_DOWN});
		wsUrlObj.searchParams.set("id", this.id.toString());
		return Url.sign(wsUrlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	getSignedUploadWsUrl({host} = {}) {
		const wsUrlObj = Url.mergeUrl({protocol: "ws", host, pathname: Api.WS_UPLOAD});
		wsUrlObj.searchParams.set("id", this.id.toString());
		wsUrlObj.searchParams.set("key", this.key.toString());
		return Url.sign(wsUrlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	/**
	 * 检查签名
	 * @param url
	 * @return {boolean}
	 */
	isValidUrl(url) {
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

	/**
	 * @inheritDoc
	 */
	getUploadConfig({host} = {}) {
		const uploadConfig = super.getUploadConfig({host});
		uploadConfig.parts.push({
			index: -1
		});
		return uploadConfig;
	}

	/**
	 * 上传
	 * @param {number} index
	 * @param file
	 * @return {boolean}
	 */
	upload(index, file) {
		if (!super.upload()) {
			return false;
		}

		// 检查索引
		if (index !== -1) {
			return false;
		}

		// 检查文件大小
		if (file.size !== this.size) {
			return false;
		}

		this.#path = file.path;
		this.changeStatus(FileStatus.UPLOADED);
		return true;
	}

	/**
	 * @inheritDoc
	 */
	getDownloadConfig({host} = {}, allowMultiPart = false) {
		const downloadConfig = super.getDownloadConfig({host});
		if (allowMultiPart && this.partCount > 1) {
			for (let i = 0; i < this.partCount; i++) {
				// 最后一片可能不完整
				downloadConfig.parts.push({
					index: i,
					range: [i * this.partSize, Math.min((i + 1) * this.partSize, this.size)],
					url: this.getSignedPartUrl({host}, i),
					uploaded: this.status === FileStatus.UPLOADED
				});
			}
		} else {
			downloadConfig.parts.push({
				index: -1,
				range: [0, this.size],
				url: this.getSignedPartUrl({host}),
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
				return fs.createReadStream(this.#path, {
					start: activePart.range[0], end: activePart.range[1] - 1
				});
			} else {
				return null;
			}
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
}

export class MultipartFile extends File {
	#paths = [];

	constructor({name, size}) {
		super({name, size});
	}

	getUploadConfig({host} = {}) {
		const uploadConfig = super.getUploadConfig({host});
		for (let i = 0; i < this.partCount; i++) {
			// 最后一片可能不完整
			uploadConfig.parts.push({
				index: i,
				range: [i * this.partSize, Math.min((i + 1) * this.partSize, this.size)]
			});
		}
		return uploadConfig;
	}

	/**
	 * 上传
	 * @param {number} index
	 * @param file
	 * @return {boolean}
	 */
	upload(index, file) {
		if (!super.upload()) {
			return false;
		}

		// 检查索引
		if (index < 0 || index >= this.partCount) {
			return false;
		}

		// 检查文件大小
		const uploadConfig = this.getUploadConfig();
		const activePart = uploadConfig.parts[index];
		if (file.size !== activePart.range[1] - activePart.range[0]) {
			return false;
		}

		this.#paths[index] = file.path;
		if (this.#paths.filter(item => item).length === this.partCount) {
			this.changeStatus(FileStatus.UPLOADED);
		}
		return true;
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

	getDownloadConfig({host} = {}, allowMultiPart = false) {
		const downloadConfig = super.getDownloadConfig({host});
		if (!downloadConfig.removed) {
			if (allowMultiPart && this.partCount > 1) {
				for (let i = 0; i < this.partCount; i++) {
					// 最后一片可能不完整
					downloadConfig.parts.push({
						index: i,
						range: [i * this.partSize, Math.min((i + 1) * this.partSize, this.size)],
						url: this.getSignedPartUrl({host}, i),
						uploaded: this.#paths[i] !== undefined
					});
				}
			} else {
				downloadConfig.parts.push({
					index: -1,
					range: [0, this.size],
					url: this.getSignedPartUrl({host}),
					uploaded: this.status === FileStatus.UPLOADED
				});
			}
		}
		return downloadConfig;
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

export class TextFile extends File {
	#text;

	constructor({name, size}) {
		super({name, size});
	}

	getUploadConfig({host} = {}) {
		const uploadConfig = super.getUploadConfig({host});
		uploadConfig.parts.push({
			index: -1
		});
		return uploadConfig;
	}

	/**
	 * 上传
	 * @param {number} index
	 * @param text
	 * @return {boolean}
	 */
	upload(index, text) {
		if (!super.upload()) {
			return false;
		}

		// 检查索引
		if (index !== -1) {
			return false;
		}

		// 检查文件大小
		if (text.length !== this.size) {
			return false;
		}

		this.#text = text;
		this.changeStatus(FileStatus.UPLOADED);
		return true;
	}

	getDownloadConfig({host} = {}, allowMultiPart = false) {
		const downloadConfig = super.getDownloadConfig({host});
		downloadConfig.parts.push({
			index: -1,
			range: [0, this.size],
			url: this.getSignedPartUrl({host}),
			uploaded: this.status === FileStatus.UPLOADED
		});
		return downloadConfig;
	}

	download(index) {
		if (index === -1) {
			const downloadConfig = this.getDownloadConfig(undefined, false);
			const activePart = downloadConfig.parts[0];
			if (activePart.uploaded) {
				// 文本转成流
				const textStream = new Readable();
				textStream.push(this.#text);
				textStream.push(null);
				return textStream;
			} else {
				return null;
			}
		} else {
			return null;
		}
	}

	remove() {
		if (super.remove()) {
			this.#text = null;
		}
	}
}