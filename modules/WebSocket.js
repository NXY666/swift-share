export class UploadWebSocketPool {
	#broadcastWaitList = [];
	#broadcastWaitTimeout = 500;
	#broadcastWaitTimeoutId = null;

	#sendWaitList = [];
	#sendWaitTimeout = 500;
	#sendWaitTimeoutId = null;

	/**
	 * WebSocket 连接池
	 * @type {Map<number, {connection: WebSocket, data: {id: number, lastActive: number}}[]>}
	 */
	#clients = new Map();

	/**
	 * 不活跃连接的超时时间（毫秒）
	 * @type {number}
	 */
	#inactivityTimeout = 60 * 1000;

	/**
	 * 添加 WebSocket 连接到连接池
	 * @param {WebSocket} connection
	 * @param {number} id
	 */
	addConnection(connection, id) {
		const connectionData = {id, lastActive: Date.now()};

		// 添加连接到 ID 映射
		if (!this.#clients.has(id)) {
			this.#clients.set(id, []);
		}
		this.#clients.get(id).push({connection, data: connectionData});

		// 处理连接的消息
		connection.on('message', (message) => {
			this.onMessage(connection, message);
		});

		// 处理连接的关闭
		connection.on('close', (code, reason) => {
			this.onClose(connection, code, reason);
		});

		// 定期检查连接的不活动状态，关闭不活动连接
		const intervalId = setInterval(() => {
			this.checkInactiveConnections(id);
		}, this.#inactivityTimeout / 2);

		// 关闭连接时清除定时器
		connection.on('close', () => {
			clearInterval(intervalId);
		});
	}

	// 处理连接的消息
	onMessage(connection, message) {
		// 处理收到的消息
		message = message.toString();

		// 检查接收到的消息是否为 "ping"，如果是，则发送 "pong" 响应
		if (message === 'ping') {
			connection.send('pong');
		} else {
			console.log('Received unknown message:', message);
		}

		// 更新连接的最后活动时间
		const connections = Array.from(this.#clients.values()).flat();
		for (const item of connections) {
			const conn = item.connection;
			const data = item.data;

			if (conn === connection) {
				data.lastActive = Date.now();
				break;
			}
		}
	}

	// 处理连接的关闭
	onClose(connection, code, reason) {
		const id = [...this.#clients.entries()]
		.find(([_, connections]) => connections.some(({connection: conn}) => conn === connection))
		?.shift();

		if (id) {
			// 从 ID 映射中移除连接
			const idConnections = this.#clients.get(id);
			const index = idConnections.findIndex(({connection: conn}) => conn === connection);
			if (index !== -1) {
				idConnections.splice(index, 1);
			}

			// 从连接池中移除连接
			if (idConnections.length === 0) {
				this.#clients.delete(id);
			}
		}

		// 输出关闭的连接信息
		console.log(`Connection closed with code ${code} and reason: ${reason}`);
	}

	// 定期检查不活动连接并关闭它们
	checkInactiveConnections(id) {
		const currentTime = Date.now();
		const client = this.#clients.get(id) || [];
		for (const {connection, data: {lastActive}} of client) {
			if (currentTime - lastActive >= this.#inactivityTimeout) {
				connection.close(1001, 'Connection inactive');
			}
		}
	}

	/**
	 * 根据 ID 查找连接
	 * @param {number} id
	 * @return {{connection: WebSocket, data: {id: number, lastActive: number}}[]}
	 */
	#findClientsById(id) {
		return this.#clients.get(id)?.slice() || [];
	}

	broadcast(id, message) {
		this.#broadcastWaitList.push({id, message});

		if (this.#broadcastWaitTimeoutId === null) {
			const wait = () => {
				const sendingMap = {};

				// 取出0-100条数据
				this.#broadcastWaitList.splice(0, 100).forEach(({id, message}) => {
					if (!sendingMap[id]) {
						sendingMap[id] = [];
					}
					sendingMap[id].push(message);
				});

				// 发送数据
				Object.entries(sendingMap).forEach(([id, messages]) => {
					const clients = this.#findClientsById(parseInt(id));
					for (const client of clients) {
						client.connection.send(JSON.stringify(messages));
					}
				});

				// 如果还有数据，则继续等待
				this.#broadcastWaitTimeoutId = this.#broadcastWaitList.length > 0 ? setTimeout(wait, this.#broadcastWaitTimeout) : null;
			};

			this.#broadcastWaitTimeoutId = setTimeout(wait, this.#broadcastWaitTimeout);
		}
	}

	send(connection, message) {
		this.#sendWaitList.push({connection, message});

		if (this.#sendWaitTimeoutId == null) {
			const wait = () => {
				const sendingMap = new Map();

				// 取出0-100条数据
				this.#sendWaitList.splice(0, 100).forEach(({connection, message}) => {
					if (!sendingMap.has(connection)) {
						sendingMap.set(connection, []);
					}
					sendingMap.get(connection).push(message);
				});

				// 发送数据
				for (const [connection, messages] of sendingMap.entries()) {
					connection.send(JSON.stringify(messages));
				}

				// 如果还有数据，则继续等待
				this.#sendWaitTimeoutId = this.#sendWaitList.length > 0 ? setTimeout(wait, this.#sendWaitTimeout) : null;
			};

			this.#sendWaitTimeoutId = setTimeout(wait, this.#sendWaitTimeout);
		}
	}

	/**
	 * 根据 ID 关闭所有连接
	 * @param {number} id
	 * @param {number} code
	 * @param {string} reason
	 */
	closeAll(id, code, reason) {
		const clients = this.#findClientsById(id);
		for (const {connection} of clients) {
			connection.close(code, reason);
		}
	}
}
