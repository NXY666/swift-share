import { PassThrough } from 'stream';

export class Stream {
	static mergeStreams(streams) {
		// 创建一个 PassThrough 流，用于合并多个流
		const combinedStream = new PassThrough();

		// 使用递归函数来依次连接流
		function connectStreams(index) {
			if (index < streams.length) {
				streams[index].on('data', (chunk) => {
					combinedStream.write(chunk);
				});

				streams[index].on('end', () => {
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