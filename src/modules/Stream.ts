import {PassThrough} from 'stream';
import fs from "fs";

export class Stream {
	static mergeStreams(streams: fs.ReadStream[]): PassThrough {
		// 创建一个 PassThrough 流，用于合并多个流
		const combinedStream = new PassThrough();
		// 检测是否已经被destroy
		let destroyed = false;
		combinedStream.on('close', () => {
			destroyed = true;
		});

		// 使用递归函数来依次连接流
		function connectStreams(index: number) {
			if (index < streams.length) {
				streams[index].on('close', () => {
					connectStreams(index + 1);
				});

				streams[index].on('error', (err) => {
					combinedStream.destroy(err);
				});

				streams[index].pipe(combinedStream, {end: false});
			} else {
				// 当所有流连接完毕时，结束合并流
				combinedStream.end();
			}
		}

		// 开始连接流
		connectStreams(0);

		return combinedStream;
	}
}

export class MergeablePassThrough extends PassThrough {
	constructor() {
		super();
	}

	async merge(stream: fs.ReadStream) {
		if (this.writableEnded) {
			return Promise.reject(new Error('Source stream cannot be written anymore.'));
		} else if (this.destroyed) {
			return Promise.reject(new Error('Source stream is destroyed.'));
		} else if (stream.readableEnded) {
			return Promise.reject(new Error('Target stream cannot be read anymore.'));
		} else if (stream.destroyed) {
			return Promise.reject(new Error('Target stream is destroyed.'));
		}

		return new Promise<void>((resolve, reject) => {
			stream.on('end', () => {
				resolve();
			});

			stream.on('error', (err) => {
				reject(err);
			});

			stream.pipe(this, {end: false});
		});
	}
}