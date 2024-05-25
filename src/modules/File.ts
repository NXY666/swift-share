import DefaultConfig from "@/default_config.js";
import crypto from "crypto";
import fs from "fs";
import {Api, Url} from "./Url";
import {MergeablePassThrough, Stream} from "./Stream";
import EventEmitter from "events";
import {PassThrough} from "stream";
import RangeParser from "range-parser";

export class FileStatus {
	static CREATED = 0;
	static UPLOADING = 1;
	static UPLOADED = 2;
	static REMOVED = 3;
}

type DownloadPart = {
	index: number;
	url: string;
	range: number[];
	uploaded: boolean;
}

type DownloadConfig = {
	id: ObjectKey;
	name: string;
	size: number;
	/**
	 * @deprecated
	 */
	parts: DownloadPart[];
	downUrl: string;
	playUrl: string;
	/**
	 * @deprecated
	 */
	wsUrl: string;
	removed: boolean;
}

type UploadPart = {
	index: number;
	range?: [number, number];
}

type UploadConfig = {
	id: ObjectKey;
	key: crypto.UUID;
	name: string;
	parts: UploadPart[];
	wsUrl: string;
}

export abstract class File extends EventEmitter {
	static #nextId = 0;

	static #fileMap = {};

	/**
	 * 文件ID
	 */
	#id: number = File.#nextId++;
	/**
	 * 访问 UUID
	 */
	#key: crypto.UUID = crypto.randomUUID();
	/**
	 * 文件状态
	 */
	#status: number = FileStatus.CREATED;
	/**
	 * 文件名
	 */
	#name: string;
	/**
	 * 文件大小
	 */
	#size: number;
	/**
	 * 分片大小
	 */
	#partSize: number = DefaultConfig.FILE_PART_SIZE;

	/**
	 * 上传最后期限
	 */
	#uploadDeadline: number = Date.now() + DefaultConfig.FILE_UPLOAD_INTERVAL;

	/**
	 * 上传检查点
	 */
	#checkpoint: number = Date.now();

	protected constructor({name, size}) {
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

	get originalname() {
		return Buffer.from(this.#name, "utf-8").toString("latin1");
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
	 * @param id
	 * @return
	 */
	static findFileById(id: ObjectKey): File {
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
	changeStatus(status: number) {
		this.#status = status;
		this.emit("statusChange", status);
	}

	/**
	 * 获取上传配置
	 * @returns {{id: number, key: UUID, name: string, parts: {index: number, range?: [number, number]}[], wsUrl: string}}
	 */
	getUploadConfig({host}): UploadConfig {
		return {
			id: this.id,
			key: this.key,
			name: this.name,
			parts: [],
			wsUrl: this.getSignedUploadWsUrl({host})
		};
	}

	canUpload(): boolean {
		// 已上传或已删除的文件不可再上传
		if (this.status === FileStatus.UPLOADED || this.status === FileStatus.REMOVED) {
			console.warn("[CanUpload]", "Invalid status:", this.status);
			return false;
		}

		// 上传超时的文件不可再上传
		if (this.hasUploadTimeout()) {
			console.warn("[CanUpload]", "Upload timeout.");
			return false;
		}

		this.changeStatus(FileStatus.UPLOADING);
		return true;
	}

	abstract upload(index: number, file: Express.Multer.File): boolean;

	/**
	 * 获取下载配置
	 * @returns
	 */
	getDownloadConfig({protocol, host}: { protocol?: string; host?: string } = {}): DownloadConfig {
		return {
			id: this.id,
			name: this.name,
			size: this.size,
			parts: [],
			downUrl: this.getSignedDownloadUrl({protocol, host}),
			playUrl: this.getSignedPlayUrl({protocol, host}),
			wsUrl: this.getSignedDownloadWsUrl({host}),
			removed: this.status === FileStatus.REMOVED
		};
	}

	/**
	 * @deprecated
	 */
	abstract indexDownloadStream(index: number): fs.ReadStream | PassThrough;

	abstract rangeDownloadStream(range: string): fs.ReadStream | PassThrough;

	canRemove() {
		if (this.status === FileStatus.REMOVED) {
			return false;
		}

		delete File.#fileMap[this.id];
		this.changeStatus(FileStatus.REMOVED);

		console.log("[RemoveFile]", this.id, this.name, this.status);
		this.emit("remove");
		return true;
	}

	abstract remove(): void;

	/**
	 * @deprecated
	 */
	getSignedPartUrl({host}, index = -1) {
		const urlObj = Url.mergeUrl({protocol: "http", host, pathname: Api.DOWN_NEW});
		urlObj.searchParams.set("id", this.id.toString());
		urlObj.searchParams.set("index", index.toString());
		return Url.sign(urlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	getSignedDownloadUrl({protocol, host}) {
		const urlObj = Url.mergeUrl({protocol, host, pathname: Api.FETCH});
		urlObj.searchParams.set("id", this.id.toString());
		urlObj.searchParams.set("type", "download");
		return Url.sign(urlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	getSignedPlayUrl({protocol, host}) {
		const urlObj = Url.mergeUrl({protocol, host, pathname: Api.FETCH});
		urlObj.searchParams.set("id", this.id.toString());
		urlObj.searchParams.set("type", "play");
		return Url.sign(urlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	getSignedDownloadWsUrl({host}) {
		const wsUrlObj = Url.mergeUrl({protocol: "ws", host, pathname: Api.WS_DOWN});
		wsUrlObj.searchParams.set("id", this.id.toString());
		return Url.sign(wsUrlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	/**
	 * @deprecated
	 */
	getSignedUploadWsUrl({host}) {
		const wsUrlObj = Url.mergeUrl({protocol: "ws", host, pathname: Api.WS_UPLOAD});
		wsUrlObj.searchParams.set("id", this.id.toString());
		wsUrlObj.searchParams.set("key", this.key.toString());
		return Url.sign(wsUrlObj.toString(), DefaultConfig.LINK_EXPIRE_INTERVAL);
	}

	/**
	 * 检查签名
	 */
	isValidUrl(url: CommonURL): boolean {
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
	#path: string;

	constructor({name, size}) {
		super({name, size});
	}

	/**
	 * @inheritDoc
	 */
	getUploadConfig({host}) {
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
	upload(index: number, file: Express.Multer.File): boolean {
		if (!super.canUpload()) {
			return false;
		}

		// 检查索引
		if (index !== -1) {
			console.warn("[SimpleFile][Upload]", "Invalid index:", index);
			return false;
		}

		// 检查文件大小
		if (file.size !== this.size) {
			console.warn("[SimpleFile][Upload]", "Invalid file size:", file.size, "≠", this.size);
			return false;
		}

		this.#path = file.path;

		this.changeStatus(FileStatus.UPLOADED);
		this.emit("upload", index, file);

		return true;
	};

	/**
	 * @inheritDoc
	 */
	getDownloadConfig({protocol, host}: { protocol?: string; host?: string } = {}): DownloadConfig {
		const downloadConfig = super.getDownloadConfig({protocol, host});
		if (this.partCount > 1) {
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

	indexDownloadStream(index: number) {
		if (index === -1) {
			const downloadConfig = this.getDownloadConfig(undefined);
			const activePart = downloadConfig.parts[0];
			if (activePart.uploaded) {
				// 返回整个文件流
				return fs.createReadStream(this.#path);
			} else {
				return null;
			}
		} else {
			const downloadConfig = this.getDownloadConfig(undefined);
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

	rangeDownloadStream(range: string = `bytes=0-${this.size - 1}`) {
		// range = 'bytes=0-100' 也可能是 'bytes=0-' 或 'bytes=-100'
		let ranges = RangeParser(this.size, range, {combine: true});
		if (ranges === -2 || ranges === -1 || ranges.length !== 1) {
			ranges = RangeParser(this.size, `bytes=0-${this.size - 1}`, {combine: true});
		}
		const {start: startNum, end: endNum} = ranges[0];

		return fs.createReadStream(this.#path, {start: startNum, end: endNum});
	}

	remove() {
		if (super.canRemove()) {
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

	getUploadConfig({host}: { host?: string } = {}) {
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

	upload(index: number, file: Express.Multer.File): boolean {
		if (!super.canUpload()) {
			return false;
		}

		// 检查索引
		if (index < 0 || index >= this.partCount) {
			console.warn("[MultipartFile][Upload]", "Invalid index:", index);
			return false;
		}

		// 检查文件大小
		const uploadConfig = this.getUploadConfig();
		const activePart = uploadConfig.parts[index];
		if (file.size !== activePart.range[1] - activePart.range[0]) {
			console.warn("[MultipartFile][Upload]", "Invalid file size:", file.size, "≠", activePart.range[1] - activePart.range[0]);
			return false;
		}

		this.#paths[index] = file.path;
		if (this.#paths.filter(item => item).length === this.partCount) {
			this.changeStatus(FileStatus.UPLOADED);
		}

		this.emit("upload", index, file);

		return true;
	}

	getDownloadConfig({protocol, host}: { protocol?: string; host?: string } = {}): DownloadConfig {
		const downloadConfig = super.getDownloadConfig({host});
		if (!downloadConfig.removed) {
			if (this.partCount > 1) {
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

	indexDownloadStream(index: number) {
		if (index === -1) {
			const downloadConfig = this.getDownloadConfig(undefined);
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
			const downloadConfig = this.getDownloadConfig({host: undefined});
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

	rangeDownloadStream(range: string = `bytes=0-${this.size - 1}`) {
		// range = 'bytes=0-100' 也可能是 'bytes=0-' 或 'bytes=-100'
		let ranges = RangeParser(this.size, range, {combine: true});
		if (ranges === -2 || ranges === -1 || ranges.length !== 1) {
			ranges = RangeParser(this.size, `bytes=0-${this.size - 1}`, {combine: true});
		}
		const {start: startNum, end: endNum} = ranges[0];

		const rpt = new MergeablePassThrough();

		rpt.on('error', (e) => {
			console.warn("[RangeDownloadStream]", e);
		});

		setTimeout(async () => {
			const partStart = Math.floor(startNum / this.partSize);
			const partEnd = Math.floor(endNum / this.partSize);
			try {
				for (let i = partStart; i <= partEnd; i++) {
					// 如果还没有上传到这，等待上传完成
					if (this.#paths[i] == null) {
						await new Promise<void>((resolve, reject) => {
							let uploadHandler: (...args: any[]) => void,
								removeHandler: (...args: any[]) => void,
								errorHandler: (...args: any[]) => void;

							const removeAllListeners = () => {
								this.removeListener("upload", uploadHandler);
								this.removeListener("remove", removeHandler);
								rpt.removeListener("error", errorHandler);
							};

							this.on("upload", uploadHandler = (index) => {
								if (index === i) {
									removeAllListeners();
									resolve();
								}
							});

							this.once("remove", removeHandler = () => {
								removeAllListeners();
								reject(new Error("Source stream is removed."));
							});

							rpt.once('error', errorHandler = () => {
								removeAllListeners();
								reject(new Error("Source stream is destroyed."));
							});
						});
					}

					const partRange = [i * this.partSize, Math.min((i + 1) * this.partSize, this.size)];
					const partStream = fs.createReadStream(this.#paths[i], {
						start: Math.max(partRange[0], startNum) - partRange[0],
						end: Math.min(partRange[1], endNum + 1) - partRange[0]
					});
					await rpt.merge(partStream);
				}
				rpt.end();
			} catch (e) {
				console.warn("[RangeDownloadStream]", e);
				rpt.destroy(new Error("Merge stream failed."));
			}
		});
		return rpt;
	}

	remove() {
		if (super.canRemove()) {
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
