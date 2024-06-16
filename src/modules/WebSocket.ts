import {RawData, WebSocket} from 'ws';
import EventEmitter from "events";
import {setTimerInterval} from "@/modules/Timer";

/**
 * WebSocket 客户端
 */
export class Client extends EventEmitter {
	/**
	 * 类型
	 */
	readonly type: string;

	/**
	 * 标识符
	 */
	readonly id: ObjectKey;

	/**
	 * WebSocket 连接
	 */
	readonly connection: WebSocket;

	/**
	 * 最后活动时间
	 */
	lastActive: number = Date.now();

	/**
	 * 附加数据
	 */
	readonly #data: object = {};

	/**
	 * 不活跃连接的超时时间（毫秒）
	 */
	#inactivityTimeout: number = 60 * 1000;

	constructor(type: string, id: ObjectKey, connection: WebSocket, data?: object) {
		super();

		this.type = type;
		this.id = id;
		this.connection = connection;
		data && Object.assign(this.#data, data);

		this.connection.on('message', (message) => {
			this.#onMessage(message);
		});
		this.connection.on('close', (code, reason) => {
			this.#onClose(code, reason.toString());
		});

		// 检查活性
		setTimerInterval(() => {
			this.checkHealth();
		}, this.#inactivityTimeout / 4);

		// 加入连接池
		WebSocketPool.addClient(this);
	}

	get data() {
		return this.#data;
	}

	/**
	 * 检查活性
	 */
	checkHealth() {
		const currentTime = Date.now();
		if (currentTime - this.lastActive >= this.#inactivityTimeout) {
			this.close(1001, '长时间未活动。');
		}
	}
	/**
	 * 发送消息
	 * @param message
	 */
	send(message: string) {
		this.connection.send(message);
	}

	/**
	 * 关闭连接
	 * @param code
	 * @param reason
	 */
	close(code?: number, reason?: string) {
		this.connection.close(code, reason);
	}

	/**
	 * 处理连接的消息
	 */
	#onMessage(rawMessage: RawData) {
		const message = rawMessage.toString();

		// 更新连接的最后活动时间
		this.lastActive = Date.now();

		// 检查接收到的消息是否为 "ping"，如果是，则发送 "pong" 响应
		if (message === 'ping') {
			this.send('pong');
			return;
		}

		// 处理消息
		this.emit('message', message);
	}

	/**
	 * 处理连接的关闭
	 */
	#onClose(code: number, reason: string) {
		this.emit('beforeClose', this, code, reason);

		// 从连接池中移除
		WebSocketPool.removeClient(this);

		this.emit('close', this, code, reason);

		// 输出关闭的连接信息
		console.log(`Connection closed with code ${code} and reason: ${reason}`);
	}
}

class WebSocketPool {
	/**
	 * WebSocket 连接池
	 */
	static #idMap: { [s: string]: { [t: ObjectKey]: Client[]; } } = {};

	/**
	 * WebSocket 连接映射
	 */
	static #connMap: Map<WebSocket, Client> = new Map();

	static #queueWaitList: { client: Client, message: any }[] = [];
	static #queueWaitTimeout = 500;
	static #queueWaitTimeoutId = null;

	/**
	 * 添加客户端
	 * @param client 客户端
	 */
	static addClient(client: Client) {
		const {type, id, connection} = client;

		// 添加连接到 ID 映射
		if (!WebSocketPool.#idMap[type]) {
			WebSocketPool.#idMap[type] = {};
		}

		if (!WebSocketPool.#idMap[type][id]) {
			WebSocketPool.#idMap[type][id] = [];
		}

		WebSocketPool.#idMap[type][id].push(client);

		// 添加连接到连接映射
		WebSocketPool.#connMap.set(connection, client);
	}

	/**
	 * 移除客户端
	 * @param client 客户端
	 */
	static removeClient(client: Client) {
		const {type, id, connection} = client;

		// 从 ID 映射中移除连接
		const idClients = WebSocketPool.#idMap[type][id];
		const index = idClients.findIndex((idClient: Client) => idClient === client);
		if (index !== -1) {
			idClients.splice(index, 1);
		}

		// 从连接映射中移除连接
		WebSocketPool.#connMap.delete(connection);
	}

	/**
	 * 根据 ID 查找客户端
	 * @param type 类型
	 * @param id 标识符
	 * @return 客户端
	 */
	static findClientsById(type: string, id: ObjectKey): Client[] {
		return WebSocketPool.#idMap[type]?.[id]?.slice() || [];
	}

	/**
	 * 根据 WebSocket 连接查找客户端
	 * @param connection WebSocket 连接
	 * @return 客户端
	 */
	static #findClientByConnection(connection: WebSocket): Client {
		return WebSocketPool.#connMap.get(connection);
	}

	queue(client: Client, message: any) {
		WebSocketPool.#queueWaitList.push({client, message});

		if (WebSocketPool.#queueWaitTimeoutId === null) {
			const waitTimeoutCallback = () => {
				const sendingMap: Map<Client, string[]> = new Map();

				// 取出0-100条数据
				WebSocketPool.#queueWaitList.splice(0, 100).forEach(({client, message}) => {
					if (!sendingMap.has(client)) {
						sendingMap.set(client, []);
					}
					sendingMap.get(client).push(message);
				});

				// 发送数据
				sendingMap.forEach((messages, client) => {
					client.connection.send(JSON.stringify(messages));
				});

				// 如果还有数据，则继续等待
				WebSocketPool.#queueWaitTimeoutId = WebSocketPool.#queueWaitList.length > 0 ? setTimeout(waitTimeoutCallback, WebSocketPool.#queueWaitTimeout) : null;
			};

			WebSocketPool.#queueWaitTimeoutId = setTimeout(waitTimeoutCallback, WebSocketPool.#queueWaitTimeout);
		}
	}

	/**
	 * 发送消息前的处理
	 * @param {Client} client
	 * @param {any} message
	 * @return {any}
	 */
	messageHandler(client: Client, message: any): any {
		return message;
	}

	send(connection: Client, message: any) {
		this.queue(connection, message);
	}

	broadcast(type: string, id: ObjectKey, message: string) {
		WebSocketPool.findClientsById(type, id).forEach((client) => {
			this.queue(client, message);
		});
	}

	/**
	 * 根据 ID 关闭所有连接
	 * @param type 类型
	 * @param id 标识符
	 * @param code 关闭代码
	 * @param reason 关闭原因
	 */
	closeAll(type: string, id: ObjectKey, code: number, reason: string) {
		const clients = WebSocketPool.findClientsById(type, id);
		for (const {connection} of clients) {
			if (connection.readyState !== WebSocket.CONNECTING) {
				connection.close(code, reason);
			}
		}
	}
}
