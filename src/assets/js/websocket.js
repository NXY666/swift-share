
class WebSocketClient {
	#url;

	#websocket;

	constructor(url) {
		this.#url = url;
	}

	set onOpen(value) {
		this.#onOpen = value;
	}

	set onMessage(value) {
		this.#onMessage = value;
	}

	set onClose(value) {
		this.#onClose = value;
	}

	set onError(value) {
		this.#onError = value;
	}

	#onOpen = () => {};

	#onMessage = () => {};

	#onClose = () => {};

	#onError = () => {};

	open() {
		if (this.#websocket) {
			return;
		}
		try {
			this.#websocket = new WebSocket(this.#url);
			this.#websocket.addEventListener('open', () => {
				this.#autoPing();
				this.#onOpen();
			});
			this.#websocket.addEventListener('message', ({data}) => {
				if (data !== "pong") {
					this.#onMessage(data);
				}
			});
			this.#websocket.addEventListener('close', ({code, reason}) => {
				this.#onClose(code, reason);
			});
			this.#websocket.addEventListener('error', (error) => {
				this.#onError(error);
			});
		} catch (e) {
			this.#onError(e);
			this.#onClose({code: -1, reason: e.toString()});
		}
	}

	send(data) {
		if (this.#websocket && this.#websocket.readyState === WebSocket.OPEN) {
			this.#websocket.send(data);
		}
	}

	close() {
		if (this.#websocket && this.#websocket.readyState === WebSocket.OPEN) {
			this.#websocket.close();
		}
	}

	#autoPing() {
		if (this.#websocket.readyState === WebSocket.OPEN) {
			this.send("ping");
			setTimeout(() => {this.#autoPing();}, 15 * 1000);
		}
	}
}