export class api {
	static #requestQueue = [];

	static #requestingCount = 0;

	static #slowRequestingCount = 0;

	static #maxRequestingCount = 16;

	static #maxSlowRequestingCount = 4;

	static #processQueue = async () => {
		if (this.#requestQueue.length > 0) {
			for (let i = 0; i < this.#requestQueue.length; i++) {
				const request = this.#requestQueue[i];
				if (request.slowRequest ? this.#slowRequestingCount >= this.#maxSlowRequestingCount : this.#requestingCount >= this.#maxRequestingCount) {
					continue;
				}

				this.#requestQueue.splice(i, 1);
				if (request.slowRequest) {
					this.#slowRequestingCount++;
					await request.callback();
					this.#slowRequestingCount--;
				} else {
					this.#requestingCount++;
					await request.callback();
					this.#requestingCount--;
				}
				setTimeout(this.#processQueue);
				return;
			}
			console.debug("Request full.", `normal: (${this.#requestingCount}/${this.#maxRequestingCount})`, `slow: (${this.#slowRequestingCount}/${this.#maxSlowRequestingCount})`);
		}
	};

	static #request(url, options, config) {
		const {slowRequest, retryCount, bodyType} = config;
		return new Promise(async (resolve, reject) => {
			this.#requestQueue.push({
				slowRequest,
				pushTime: Date.now(),
				callback: async () => {
					await fetch(completeUrl(url), options)
					.then(async response => ({
						ok: response.ok, code: response.status,
						body: await response[bodyType === "auto" ? "text" : bodyType]()
					}))
					.then(response => {
						let body = response.body;
						if (bodyType === "auto") {
							try {
								body = JSON.parse(body);
							} catch {
							}
						}
						if (response.ok) {
							resolve({code: response.code, data: body});
						} else if (!body) {
							throw new Error(`HTTP code ${response.code} without body.`);
						} else {
							reject({code: response.code, message: body?.message ?? response.code});
						}
					})
					.catch(error => {
						if (error instanceof Error) {
							if (retryCount > 0) {
								console.warn("Request", url, "failed, retrying...", error.stack);
								this.#request(url, options, {...config, retryCount: retryCount - 1})
								.then(resolve)
								.catch(reject);
							} else {
								console.error("Request", url, "failed finally.", error.stack);
								reject({code: -1, message: error.toString()});
							}
						} else {
							reject(error);
						}
					});
				}
			});
			await this.#processQueue();
		});
	}

	/**
	 * 发送 GET 请求
	 * @param {string} url 请求地址
	 * @param {RequestInit} [options] 请求选项
	 * @param {boolean} [slowRequest] 是否为慢速请求
	 * @param {number} [retryCount] 重试次数
	 * @param {string} [bodyType] 响应体类型
	 * @return {Promise<{code: number, data: any}>} 响应数据
	 * @throws {{code: number, message: string}} 响应错误
	 */
	static get(
		url, options = {},
		{slowRequest = false, retryCount = 3, bodyType = "auto"} = {
			slowRequest: false, retryCount: 3, bodyType: "auto"
		}
	) {
		return this.#request(url, {
			...options,
			method: 'GET'
		}, {slowRequest, retryCount, bodyType});
	}

	/**
	 * 发送 POST 请求
	 * @param {string} url 请求地址
	 * @param {string|object} body 请求体
	 * @param {object} [options] fetch 选项
	 * @param {boolean} [slowRequest] 是否为慢速请求
	 * @param {number} [retryCount] 重试次数
	 * @param {string} [bodyType] 响应体类型
	 * @return {Promise<{code: number, data: any}>} 响应数据
	 * @throws {{code: number, message: string}} 响应错误
	 */
	static post(
		url, body, options = {},
		{slowRequest = false, retryCount = 3, bodyType = "auto"} = {
			slowRequest: false, retryCount: 3, bodyType: "auto"
		}
	) {
		if (!options.headers) {
			options.headers = {};
		}
		if (body instanceof FormData) {
			// do nothing
		} else if (typeof body == 'object') {
			try {
				body = JSON.stringify(body);
				options.headers['Content-Type'] = 'application/json';
			} catch (e) {
				console.error(e);
			}
		} else if (typeof body == 'string') {
			options.headers['Content-Type'] = 'text/plain';
		} else {
			throw new Error('Unsupported body type.');
		}

		return this.#request(url, {
			...options,
			method: 'POST',
			body
		}, {slowRequest, retryCount, bodyType});
	}
}
