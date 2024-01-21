import {WebSocket} from 'ws';

/**
 * WebSocket 客户端
 */
class Client {
	/**
	 * 标识符
	 * @type {number|string}
	 */
	id;

	/**
	 * WebSocket 连接
	 * @type {WebSocket}
	 */
	connection;

	/**
	 * 附加数据
	 * @type {Object}
	 */
	#data = {};

	/**
	 * 最后活动时间
	 * @type {number}
	 */
	lastActive = Date.now();

	constructor(id, connection, data) {
		this.id = id;
		this.connection = connection;
		data && Object.assign(this.#data, data);
	}

	get data() {
		return this.#data;
	}
}

export class WebSocketPool {
	#waitList = [];
	#waitTimeout = 500;
	#waitTimeoutId = null;

	/**
	 * WebSocket 连接池
	 * @type {Object.<string, Client[]>}
	 */
	#clients = {};

	/**
	 * WebSocket 连接映射
	 * @type {Map<WebSocket, Client>}
	 */
	#connMap = new Map();

	/**
	 * 不活跃连接的超时时间（毫秒）
	 * @type {number}
	 */
	#inactivityTimeout = 60 * 1000;

	/**
	 * 添加 WebSocket 连接到连接池
	 * @param {number|string} id ID
	 * @param {WebSocket} connection WebSocket 连接
	 * @param {Object} [data] 附加数据
	 */
	addConnection(id, connection, data) {
		// 添加连接到 ID 映射
		if (!this.#clients[id]) {
			this.#clients[id] = [];
		}
		const newClient = new Client(id, connection, data);
		if (this.onConnection(newClient) === false) {
			throw new Error('连接池拒绝接受此连接。');
		}
		this.#clients[id].push(newClient);

		// 添加连接到连接映射
		this.#connMap.set(connection, newClient);

		// 处理连接的消息
		connection.on('message', (message) => {
			this.#onMessage(connection, message);
		});

		// 定期检查连接的不活动状态，关闭不活动连接
		const intervalId = setInterval(() => {
			this.checkClientHealth(newClient);
		}, this.#inactivityTimeout / 4);

		// 处理连接的关闭
		connection.on('close', (code, reason) => {
			this.#onClose(connection, code, reason);
			clearInterval(intervalId);
		});
	}

	/**
	 * 处理连接的建立
	 * @param {Client} client
	 * @return {boolean} 是否接受此连接
	 */
	onConnection(client) {
		return true;
	}

	/**
	 * 处理连接的消息
	 */
	#onMessage(connection, message) {
		message = message.toString();

		// 更新连接的最后活动时间
		const client = this.#findClientByConnection(connection);
		if (client) {
			client.lastActive = Date.now();
		} else {
			console.error('未找到连接对应的客户端。');
		}

		// 检查接收到的消息是否为 "ping"，如果是，则发送 "pong" 响应
		if (message === 'ping') {
			connection.send('pong');
			return;
		}

		// 处理消息
		this.onMessage(client, message);
	}

	/**
	 * 处理连接的消息
	 * @param {Client} client
	 * @param {string} message
	 */
	onMessage(client, message) {
	}

	/**
	 * 处理连接的关闭
	 */
	#onClose(connection, code, reason) {
		const client = this.#findClientByConnection(connection);

		this.onClose(client, code, reason);

		const {id} = client;
		// 从 ID 映射中移除连接
		const idClients = this.#clients[id];
		const index = idClients.findIndex((client) => client.connection === connection);
		if (index !== -1) {
			idClients.splice(index, 1);
		}

		// 输出关闭的连接信息
		console.log(`Connection closed with code ${code} and reason: ${reason}`);
	}

	/**
	 * 处理连接的关闭
	 * @param {Client} client
	 * @param {number} code
	 * @param {string} reason
	 */
	onClose(client, code, reason) {
	}

	/**
	 * 检查客户端的活性
	 * @param {Client} client
	 */
	checkClientHealth(client) {
		const currentTime = Date.now();
		if (currentTime - client.lastActive >= this.#inactivityTimeout) {
			client.connection.close(1001, '长时间未活动');
		}
	}

	/**
	 * 根据 ID 查找客户端
	 * @param {number} id
	 * @return {Client[]}
	 */
	findClientsById(id) {
		return this.#clients[id]?.slice() || [];
	}

	/**
	 * 根据 WebSocket 连接查找客户端
	 * @param connection
	 * @return {Client}
	 */
	#findClientByConnection(connection) {
		return this.#connMap.get(connection);
	}

	queue(connection, message) {
		const client = this.#findClientByConnection(connection);
		this.#waitList.push({connection, message: this.onSend(client, message)});

		if (this.#waitTimeoutId === null) {
			const waitTimeoutCallback = () => {
				const sendingMap = new Map();

				// 取出0-100条数据
				this.#waitList.splice(0, 100).forEach(({connection, message}) => {
					if (!sendingMap.has(connection)) {
						sendingMap.set(connection, []);
					}
					sendingMap.get(connection).push(message);
				});

				// 发送数据
				sendingMap.forEach((messages, connection) => {
					connection.send(JSON.stringify(messages));
				});

				// 如果还有数据，则继续等待
				this.#waitTimeoutId = this.#waitList.length > 0 ? setTimeout(waitTimeoutCallback, this.#waitTimeout) : null;
			};

			this.#waitTimeoutId = setTimeout(waitTimeoutCallback, this.#waitTimeout);
		}
	}

	/**
	 * 发送消息前的处理
	 * @param {Client} client
	 * @param {any} message
	 * @return {any}
	 */
	onSend(client, message) {
		return message;
	}

	send(connection, message) {
		this.queue(connection, message);
	}

	broadcast(id, message) {
		this.findClientsById(id).forEach(({connection}) => {
			this.queue(connection, message);
		});
	}

	/**
	 * 根据 ID 关闭所有连接
	 * @param {number} id
	 * @param {number} code
	 * @param {string} reason
	 */
	closeAll(id, code, reason) {
		const clients = this.findClientsById(id);
		for (const {connection} of clients) {
			if (connection.readyState !== WebSocket.CONNECTING) {
				connection.close(code, reason);
			}
		}
	}
}

export class DownloadWebSocketPool extends WebSocketPool {
	/**
	 * @inheritDoc
	 */
	onSend(client, message) {
		return parseInt(message);
	}
}
