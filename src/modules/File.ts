import crypto from "crypto";
import fs from "fs";
import {Api, parseRange, Url} from "./Request";
import {MergeablePassThrough} from "./Stream";
import EventEmitter from "events";
import {PassThrough} from "stream";
import {getConfig} from "@/modules/Config";
import {setTimerTimeout} from "@/modules/Timer";
import {DownloadConfig, UploadConfig} from "@/types/FileType";

const CONFIG = getConfig();

export class FileStatus {
	static CREATED = 0;
	static UPLOADING = 1;
	static UPLOADED = 2;
	static REMOVED = 3;
}

export abstract class File extends EventEmitter {
	static #nextId = 0;

	static #fileMap = {};

	/**
	 * 文件ID
	 */
	readonly #id: number = File.#nextId++;
	/**
	 * 访问 UUID
	 */
	readonly #key: crypto.UUID = crypto.randomUUID();
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
	readonly #partSize: number = CONFIG.STORE.FILE.PART_SIZE;

	/**
	 * 上传最后期限
	 */
	readonly #uploadDeadline: number = Date.now() + CONFIG.STORE.FILE.UPLOAD_INTERVAL;

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
		setTimerTimeout(() => {
			// 上传超时，删除文件
			if (this.status !== FileStatus.UPLOADED) {
				this.remove();
				console.debug('[File][Constructor]', 'File reached upload deadline but not uploaded:', this.id);
			}
		}, CONFIG.STORE.FILE.UPLOAD_INTERVAL);

		// 上传检查点超时
		const uploadCheckpointTimeout = () => {
			// 上传检查点超时，删除文件
			if (this.status !== FileStatus.UPLOADED) {
				if (this.hasUploadTimeout()) {
					this.remove();
					console.debug('[File][Constructor]', 'File reached upload checkpoint timeout:', this.id);
				} else {
					setTimerTimeout(uploadCheckpointTimeout, this.#checkpoint + CONFIG.STORE.FILE.UPLOAD_CHECKPOINT_INTERVAL - Date.now());
				}
			}
		};
		setTimerTimeout(uploadCheckpointTimeout, CONFIG.STORE.FILE.UPLOAD_CHECKPOINT_INTERVAL);
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

	set name(name: string) {
		this.#name = name;
	}

	get originalname() {
		return Buffer.from(this.#name, "utf-8").toString("latin1");
	}

	get size() {
		return this.status === FileStatus.REMOVED ? 0 : this.#size;
	}

	set size(size: number) {
		this.#size = size;
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
		return now - this.#checkpoint > CONFIG.STORE.FILE.UPLOAD_CHECKPOINT_INTERVAL || now > this.#uploadDeadline;
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
	getUploadConfig(): UploadConfig {
		return {
			id: this.id,
			key: this.key,
			name: this.name,
			parts: [],
		};
	}

	canUpload(): boolean {
		// 已上传或已删除的文件不可再上传
		if (this.status === FileStatus.UPLOADED || this.status === FileStatus.REMOVED) {
			console.debug('[File][CanUpload]', 'File', this.id, 'status invalid:', this.status);
			return false;
		}

		// 上传超时的文件不可再上传
		if (this.hasUploadTimeout()) {
			console.debug('[File][CanUpload]', 'File', this.id, 'upload timeout.');
			return false;
		}

		this.changeStatus(FileStatus.UPLOADING);
		return true;
	}

	abstract upload(index: number, file: Express.Multer.File | string): boolean;

	/**
	 * 获取下载配置
	 * @returns
	 */
	getDownloadConfig(): DownloadConfig {
		return {
			id: this.id,
			name: this.name,
			size: this.size,
			downUrl: this.getSignedDownloadUrl(),
			playUrl: this.getSignedPlayUrl(),
			removed: this.status === FileStatus.REMOVED
		};
	}

	abstract rangeDownloadStream(range: string): fs.ReadStream | PassThrough;

	canRemove() {
		if (this.status === FileStatus.REMOVED) {
			return false;
		}

		delete File.#fileMap[this.id];
		this.changeStatus(FileStatus.REMOVED);

		console.debug('[File][Remove]', 'File removed:', this.id);
		this.emit("remove");
		return true;
	}

	abstract remove(): void;

	getSignedDownloadUrl() {
		const urlObj = Url.mergeUrl({pathname: Api.FETCH});
		urlObj.searchParams.set("id", this.id.toString());
		urlObj.searchParams.set("type", "down");
		return Url.sign(urlObj.shortHref, CONFIG.STORE.LINK.EXPIRE_INTERVAL);
	}

	getSignedPlayUrl() {
		const urlObj = Url.mergeUrl({pathname: Api.FETCH});
		urlObj.searchParams.set("id", this.id.toString());
		urlObj.searchParams.set("type", "play");
		return Url.sign(urlObj.shortHref, CONFIG.STORE.LINK.EXPIRE_INTERVAL);
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
	getUploadConfig(): UploadConfig {
		const uploadConfig = super.getUploadConfig();
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
	upload(index: -1, file: Express.Multer.File): boolean {
		if (!super.canUpload()) {
			return false;
		}

		// 检查文件大小
		if (file.size !== this.size) {
			console.debug('[SimpleFile][Upload]', 'Invalid file size:', file.size, '≠', this.size);
			return false;
		}

		this.#path = file.path;

		this.changeStatus(FileStatus.UPLOADED);

		this.emit("upload", index, file);

		return true;
	};

	rangeDownloadStream(range: string = `bytes=0-${this.size - 1}`) {
		// range = 'bytes=0-100' 也可能是 'bytes=0-' 或 'bytes=-100'
		const {start: startNum, end: endNum} = parseRange(range, this.size);

		if (this.status === FileStatus.UPLOADED) {
			return fs.createReadStream(this.#path, {start: startNum, end: endNum});
		}

		const rpt = new MergeablePassThrough();

		rpt.on('error', (e) => {
			console.debug("[SimpleFile][RangeDownloadStream]", 'Error:', e);
		});

		setTimeout(async () => {
			try {
				await new Promise<void>((resolve, reject) => {
					let uploadHandler: (...args: any[]) => void,
						removeHandler: (...args: any[]) => void,
						errorHandler: (...args: any[]) => void;

					const removeAllListeners = () => {
						this.removeListener("upload", uploadHandler);
						this.removeListener("remove", removeHandler);
						rpt.removeListener("error", errorHandler);
					};

					this.on("upload", uploadHandler = () => {
						removeAllListeners();
						resolve();
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

				const partStream = fs.createReadStream(this.#path, {
					start: startNum,
					end: endNum
				});
				await rpt.merge(partStream);
				rpt.end();
			} catch (e) {
				console.debug('[SimpleFile][RangeDownloadStream]', 'Error:', e);
				rpt.destroy(new Error("Merge stream failed."));
			}
		});

		return rpt;
	}

	remove() {
		if (super.canRemove()) {
			try {
				fs.unlinkSync(this.#path);
			} catch (e) {
				console.debug('[SimpleFile][Remove]', 'Error:', e);
			}
		}
	}
}

export class MultipartFile extends File {
	#paths = [];

	constructor({name, size}) {
		super({name, size});
	}

	getUploadConfig(): UploadConfig {
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

	upload(index: number, file: Express.Multer.File): boolean {
		if (!super.canUpload()) {
			return false;
		}

		// 检查索引
		if (index < 0 || index >= this.partCount) {
			console.debug('[MultipartFile][Upload]', 'Invalid index:', index);
			return false;
		}

		// 检查文件大小
		const uploadConfig = this.getUploadConfig();
		const activePart = uploadConfig.parts[index];
		if (file.size !== activePart.range[1] - activePart.range[0]) {
			console.debug('[MultipartFile][Upload]', 'Invalid file size:', file.size, '≠', activePart.range[1] - activePart.range[0]);
			return false;
		}

		this.#paths[index] = file.path;
		if (this.#paths.filter(item => item).length === this.partCount) {
			this.changeStatus(FileStatus.UPLOADED);
		}

		this.emit("upload", index, file);

		return true;
	}

	rangeDownloadStream(range: string = `bytes=0-${this.size - 1}`) {
		// range = 'bytes=0-100' 也可能是 'bytes=0-' 或 'bytes=-100'
		const {start: startNum, end: endNum} = parseRange(range, this.size);

		const rpt = new MergeablePassThrough();

		rpt.on('error', (e) => {
			console.debug('[MultipartFile][RangeDownloadStream]', 'Error:', e);
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
				console.debug('[MultipartFile][RangeDownloadStream]', 'Error:', e);
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
					console.debug('[MultipartFile][Remove]', 'Error:', e);
				}
			});
		}
	}
}

export class ShareFile extends File {
	#path: string;

	constructor({name, size}) {
		super({name, size});
	}

	getUploadConfig() {
		const uploadConfig = super.getUploadConfig();
		uploadConfig.parts.push({
			index: -1
		});
		return uploadConfig;
	}

	upload(index: -1, file: string): boolean {
		if (!super.canUpload()) {
			return false;
		}

		this.#path = file;

		this.changeStatus(FileStatus.UPLOADED);

		this.emit("upload", index, file);

		return true;
	};

	rangeDownloadStream(range: string = `bytes=0-${this.size - 1}`) {
		// range = 'bytes=0-100' 也可能是 'bytes=0-' 或 'bytes=-100'
		const {start: startNum, end: endNum} = parseRange(range, this.size);

		if (this.status === FileStatus.UPLOADED) {
			return fs.createReadStream(this.#path, {start: startNum, end: endNum});
		}

		const rpt = new MergeablePassThrough();

		rpt.on('error', (e) => {
			console.debug('[ShareFile][RangeDownloadStream]', 'Error:', e);
		});

		setTimeout(async () => {
			try {
				await new Promise<void>((resolve, reject) => {
					let uploadHandler: (...args: any[]) => void,
						removeHandler: (...args: any[]) => void,
						errorHandler: (...args: any[]) => void;

					const removeAllListeners = () => {
						this.removeListener("upload", uploadHandler);
						this.removeListener("remove", removeHandler);
						rpt.removeListener("error", errorHandler);
					};

					this.on("upload", uploadHandler = () => {
						removeAllListeners();
						resolve();
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

				const partStream = fs.createReadStream(this.#path, {
					start: startNum,
					end: endNum
				});
				await rpt.merge(partStream);
				rpt.end();
			} catch (e) {
				console.debug('[ShareFile][RangeDownloadStream]', 'Error:', e);
				rpt.destroy(new Error("Merge stream failed."));
			}
		});

		return rpt;
	}

	remove() {
		super.canRemove();
		// ！！！一定不能删除共享文件夹中的文件！！！
	}
}
