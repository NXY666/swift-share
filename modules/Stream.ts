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
				streams[index].on('data', (chunk) => {
					if (destroyed) {
						// console.log('Stream is destroyed, stop writing data.' + index);
						streams[index].destroy();
					} else {
						combinedStream.write(chunk);
					}
				});

				streams[index].on('close', () => {
					connectStreams(index + 1);
				});
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