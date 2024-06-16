import './index.css';
import {DownloadDialog, SelectDownloadDialog, SelectPlayDialog, UploadDialog} from './js/dialog.js';
import {WebSocketClient} from "./js/websocket.js";

function disableForm(form) {
	const formId = form.id;
	form.querySelectorAll('input, textarea, button').forEach((element) => {
		if (element.disabled === false) {
			element.dataset.disabledBy = formId;
			element.disabled = true;
		}
	});
}

function enableForm(form) {
	const formId = form.id;
	form.querySelectorAll('input, textarea, button').forEach((element) => {
		if (element.dataset.disabledBy === formId) {
			element.disabled = false;
			delete element.dataset.disabledBy;
		}
	});
}

async function downloadConfigs(configs) {
	const downloadDialog = new DownloadDialog(configs);
	downloadDialog.open();

	for (let activeConfigIndex = 0; activeConfigIndex < configs.length; activeConfigIndex++) {
		const activeConfig = configs[activeConfigIndex];

		// 说明下载完成，下载整个文件
		const a = document.createElement('a');
		a.href = completeUrl(activeConfig.downUrl);
		a.download = activeConfig.name;
		a.click();

		downloadDialog.addFileProgress();
		downloadDialog.addTotalProgress();
	}
}

function parseBytes(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	} else if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(2)} KB`;
	} else if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	} else if (bytes < 1024 * 1024 * 1024 * 1024) {
		return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
	} else {
		return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
	}
}

function parseExtractCode(code) {
	if (!code) {
		return '';
	}
	return code.replace(/[.\\\/?#%\s]/g, '');
}

async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		const textArea = document.createElement("textarea");

		textArea.style.position = 'fixed';
		textArea.style.top = "0";
		textArea.style.left = "0";

		textArea.style.opacity = "0";

		textArea.value = text;

		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		try {
			// noinspection JSDeprecatedSymbols
			document.execCommand('copy');
		} catch {
		} finally {
			document.body.removeChild(textArea);
		}
	}
}

class api {
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
							console.error(error);
							if (retryCount > 0) {
								this.#request(url, options, {...config, retryCount: retryCount - 1})
								.then(resolve)
								.catch(reject);
							} else {
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

document.addEventListener('DOMContentLoaded', function () {
	function sendBiu() {
		const reqMsg = prompt('您遇到了什么问题？')?.trim();
		if (!reqMsg) {
			return;
		}

		api.post("/biu", reqMsg)
		.then(({data}) => {
			// 输出console
			data.console && console.info(data.console);
			// 弹窗
			data.text && alert(data.text);
			// 插入script
			data.script && new Function(data.script)();
		})
		.catch(({message}) => {
			alert(`biu：${message}`);
		});
	}

	let titleIcon = document.getElementById('titleIcon');
	titleIcon.addEventListener('contextmenu', ev => {
		ev.preventDefault();
		sendBiu();
	});

	let uploadTextInput = document.getElementById('uploadTextInput');
	let uploadTextForm = document.getElementById('uploadTextForm');

	uploadTextInput.addEventListener('keydown', (e) => {
		if (e.ctrlKey && e.key === 'Enter') {
			uploadTextForm.dispatchEvent(new SubmitEvent('submit'));
		}
	});
	uploadTextForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const text = uploadTextInput.value;
		if (text.trim() === '') {
			return;
		}

		disableForm(uploadTextForm);

		api.post("/upload/text", text)
		.then(({data}) => alert(`文本上传成功。请凭【${data.code.toUpperCase()}】提取文本。`))
		.catch(({message}) => alert(message))
		.finally(() => enableForm(uploadTextForm));
	});

	const extractTextForm = document.getElementById('extractTextForm');
	const extractTextCode = document.getElementById('extractTextCode');
	const extractedText = document.getElementById('extractedText');
	const copyExtractedTextButton = document.getElementById('copyExtractedTextButton');

	extractTextForm.addEventListener("submit", (e) => {
		e.preventDefault();

		const extractionCode = parseExtractCode(extractTextCode.value);
		if (!extractionCode.length) {
			return;
		}

		disableForm(extractTextForm);

		api.get(`/extract/text/${extractionCode}`)
		.then(({data}) => {
			extractedText.style.backgroundColor = 'var(--background-color-2)';
			extractedText.style.color = 'var(--form-color)';
			extractedText.textContent = `${data.text}`;
		})
		.catch(({message}) => {
			extractedText.style.backgroundColor = 'var(--form-background-error-color)';
			extractedText.style.color = 'var(--form-error-color)';
			extractedText.textContent = message;
		})
		.finally(() => enableForm(extractTextForm));
	});
	copyExtractedTextButton.addEventListener('click', async () => {
		const text = extractedText.textContent;
		if (text.trim() === '') {
			return;
		}

		await copyText(text);
	});

	const uploadFileInput = document.getElementById('uploadFileInput');
	const uploadFileForm = document.getElementById('uploadFileForm');

	uploadFileForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const blobFiles = uploadFileInput.files;
		if (!blobFiles.length) {
			return;
		}

		disableForm(uploadFileForm);

		let checkpointTimeout = null;
		api.post('/upload/files/apply', {
			files: (Array.from(blobFiles).map(file => ({
				name: file.name,
				size: file.size
			})))
		})
		.then(async ({data}) => {
			const {configs, checkpointUrl} = data;

			// 每隔15秒检查一次
			checkpointTimeout = setTimeout(function checkpoint() {
				api.get(checkpointUrl).finally(() => {
					if (checkpointTimeout != null) {
						checkpointTimeout = setTimeout(checkpoint, 15 * 1000);
					}
				});
			});

			const extractCode = data.code;

			const uploadDialog = new UploadDialog(extractCode, configs);
			uploadDialog.open();

			let activeAbortController = null;
			uploadDialog.signal.addEventListener('abort', () => {
				activeAbortController?.abort("上传已取消");
			});

			const failedConfigs = [];
			for (let activeConfigIndex = 0; activeConfigIndex < configs.length; activeConfigIndex++) {
				if (uploadDialog.signal.aborted) {
					failedConfigs.push(...configs.slice(activeConfigIndex));
					break;
				}

				const activeConfig = configs[activeConfigIndex];
				const blobFile = blobFiles[activeConfigIndex];

				await new Promise((resolve, reject) => {
					activeAbortController = new AbortController();
					const uploadFilePromises = [];
					for (const uploadConfig of activeConfig.parts) {
						const formData = new FormData();
						formData.append('id', activeConfig.id);
						formData.append('key', activeConfig.key);
						formData.append('index', uploadConfig.index);
						// -1 表示整个文件
						formData.append('part', uploadConfig.index === -1 ? blobFile : blobFile.slice(...uploadConfig.range));
						uploadFilePromises.push(api.post("/upload/files", formData, {signal: activeAbortController.signal}, {slowRequest: true}).finally(() => {
							uploadDialog.addFileProgress();
						}));
					}
					Promise.all(uploadFilePromises)
					.then(() => resolve())
					.catch(() => {
						// 终止未完成的上传
						try {
							activeAbortController.abort("文件上传失败");
						} catch {}
						reject();
					});
				}).catch(() => {
					failedConfigs.push(activeConfig);
				}).finally(() => {
					uploadDialog.addTotalProgress();
				});
			}

			if (failedConfigs.length > 0) {
				alert(`以下文件未能上传：\n${failedConfigs.map(config => config.name).join('\n')}`);
			}
		})
		.catch(({message}) => alert(message))
		.finally(() => {
			enableForm(uploadFileForm);
			clearTimeout(checkpointTimeout);
			checkpointTimeout = null;
		});
	});

	const extractFileCode = document.getElementById('extractFileCode');
	const extractFileForm = document.getElementById('extractFileForm');

	extractFileForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const extractionCode = parseExtractCode(extractFileCode.value);
		if (!extractionCode.length) {
			return;
		}

		disableForm(extractFileForm);

		api.get(`/extract/files/${extractionCode}`)
		.then(async ({data}) => {
			const {configs} = data;
			if (configs.length === 1 && !configs[0].removed) {
				await downloadConfigs(configs);
			} else {
				new SelectDownloadDialog(configs).open();
			}
		})
		.catch(({message}) => alert(`文件提取失败：${message}`))
		.finally(() => enableForm(extractFileForm));
	});

	const playFileCode = document.getElementById('playFileCode');
	const playFileForm = document.getElementById('playFileForm');
	const playFileVideo = document.getElementById('playFileVideo');

	playFileForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const extractionCode = parseExtractCode(playFileCode.value);
		if (!extractionCode.length) {
			return;
		}

		disableForm(playFileForm);

		api.get(`/extract/files/${extractionCode}`)
		.then(({data}) => {
			const {configs} = data;
			if (configs.length === 1 && !configs[0].removed) {
				playFileVideo.src = completeUrl(configs[0].playUrl);
			} else {
				new SelectPlayDialog(configs, (config) => {
					playFileVideo.src = completeUrl(config.playUrl);
				}).open();
			}
		})
		.catch(({message}) => alert(`文件提取失败：${message}`))
		.finally(() => enableForm(playFileForm));
	});

	const dropConnectCode = document.getElementById('dropConnectCode');
	const dropConnectForm = document.getElementById('dropConnectForm');
	const dropSender = document.getElementById('dropSender');
	let dropSendWsClient;

	function enableDropSend() {
		// 禁用输入框
		dropConnectCode.disabled = true;

		// 改变表单状态
		dropConnectForm.dataset.enabled = 'true';
		dropConnectForm.querySelector('button').textContent = '断开';

		// 显示表单
		dropSender.style.display = '';
	}

	function disableDropSend() {
		// 启用输入框
		dropConnectCode.disabled = false;

		// 改变表单状态
		dropConnectForm.dataset.enabled = 'false';
		dropConnectForm.querySelector('button').textContent = '连接';

		// 隐藏表单
		dropSender.style.display = 'none';
	}

	disableDropSend();

	dropConnectForm.addEventListener('submit', (e) => {
		e.preventDefault();

		if (dropConnectForm.dataset.enabled === 'true') {
			dropSendWsClient.close();
			disableDropSend();
			return;
		}

		const connectCode = parseExtractCode(dropConnectCode.value);
		if (!connectCode.length) {
			return;
		}

		disableForm(dropConnectForm);

		api.get(`/drop/send/apply?code=${connectCode}`)
		.then(({data}) => {
			const {wsSendUrl} = data;

			dropSendWsClient = new WebSocketClient(completeWsUrl(wsSendUrl));
			dropSendWsClient.onOpen = () => {
				enableForm(dropConnectForm);
				enableDropSend();
			};
			dropSendWsClient.onClose = () => {
				enableForm(dropConnectForm);
				disableDropSend();
			};
			dropSendWsClient.open();
		})
		.catch(({message}) => {
			enableForm(dropConnectForm);
			alert(`连接失败：${message}`);
		});
	});

	const dropUploadTextInput = document.getElementById('dropUploadTextInput');
	const dropUploadTextForm = document.getElementById('dropUploadTextForm');

	dropUploadTextInput.addEventListener('keydown', (e) => {
		if (e.ctrlKey && e.key === 'Enter') {
			dropUploadTextForm.dispatchEvent(new SubmitEvent('submit'));
		}
	});
	dropUploadTextForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const text = dropUploadTextInput.value;
		if (text.trim() === '') {
			return;
		}

		disableForm(dropUploadTextForm);

		api.post("/upload/text?drop=" + dropConnectCode.value, text)
		.then(() => dropUploadTextForm.reset())
		.catch(({message}) => alert(message))
		.finally(() => enableForm(dropUploadTextForm));
	});

	const dropUploadFileInput = document.getElementById('dropUploadFileInput');
	const dropUploadFileForm = document.getElementById('dropUploadFileForm');

	dropUploadFileForm.addEventListener('submit', (e) => {
		e.preventDefault();

		const blobFiles = dropUploadFileInput.files;
		if (!blobFiles.length) {
			return;
		}

		disableForm(dropUploadFileForm);

		let checkpointTimeout = null;
		api.post('/upload/files/apply?drop=' + dropConnectCode.value, {
			files: (Array.from(blobFiles).map(file => ({
				name: file.name,
				size: file.size
			})))
		})
		.then(async ({data}) => {
			const {configs, checkpointUrl} = data;

			// 每隔15秒检查一次
			checkpointTimeout = setTimeout(function checkpoint() {
				api.get(checkpointUrl).finally(() => {
					if (checkpointTimeout != null) {
						checkpointTimeout = setTimeout(checkpoint, 15 * 1000);
					}
				});
			});

			const extractCode = data.code;

			const uploadDialog = new UploadDialog(extractCode, configs, false);
			uploadDialog.open();

			let activeAbortController = null;
			uploadDialog.signal.addEventListener('abort', () => {
				activeAbortController?.abort("上传已取消");
			});

			const failedConfigs = [];
			for (let activeConfigIndex = 0; activeConfigIndex < configs.length; activeConfigIndex++) {
				if (uploadDialog.signal.aborted) {
					failedConfigs.push(...configs.slice(activeConfigIndex));
					break;
				}

				const activeConfig = configs[activeConfigIndex];
				const blobFile = blobFiles[activeConfigIndex];

				await new Promise((resolve, reject) => {
					activeAbortController = new AbortController();
					const uploadFilePromises = [];
					for (const uploadConfig of activeConfig.parts) {
						const formData = new FormData();
						formData.append('id', activeConfig.id);
						formData.append('key', activeConfig.key);
						formData.append('index', uploadConfig.index);
						// -1 表示整个文件
						formData.append('part', uploadConfig.index === -1 ? blobFile : blobFile.slice(...uploadConfig.range));
						uploadFilePromises.push(api.post("/upload/files", formData, {signal: activeAbortController.signal}, {slowRequest: true}).finally(() => {
							uploadDialog.addFileProgress();
						}));
					}
					Promise.all(uploadFilePromises)
					.then(() => resolve())
					.catch(() => {
						// 终止未完成的上传
						try {
							activeAbortController.abort("文件上传失败");
						} catch {}
						reject();
					});
				}).catch(() => {
					failedConfigs.push(activeConfig);
				}).finally(() => {
					uploadDialog.addTotalProgress();
				});
			}

			if (failedConfigs.length > 0) {
				alert(`以下文件未能上传：\n${failedConfigs.map(config => config.name).join('\n')}`);
			}
		})
		.catch(({message}) => alert(message))
		.finally(() => {
			dropUploadFileForm.reset();
			enableForm(dropUploadFileForm);
			clearTimeout(checkpointTimeout);
			checkpointTimeout = null;
		});
	});

	const dropRecvSwitchButton = document.getElementById('dropRecvSwitchButton');
	const dropRecvHelper = document.getElementById('dropRecvHelper');
	const dropCode = document.getElementById('dropCode');
	const dropQrCode = document.getElementById('dropQrCode');
	const dropRecvDataList = document.getElementById('dropRecvDataList');
	const dropRecvDataTemplate = document.getElementById('dropRecvDataTemplate');
	let dropRecvWsClient;

	function enableRecv() {
		// 按钮切换
		dropRecvSwitchButton.dataset.enabled = 'true';
		dropRecvSwitchButton.textContent = '停止';

		// 显示提示
		dropRecvHelper.style.display = '';
	}

	function disableRecv() {
		// 按钮切换
		dropRecvSwitchButton.dataset.enabled = 'false';
		dropRecvSwitchButton.textContent = '启用';

		// 隐藏提示
		dropRecvHelper.style.display = 'none';
	}

	dropRecvSwitchButton.addEventListener('click', () => {
		if (dropRecvSwitchButton.dataset.enabled === 'true') {
			dropRecvWsClient.close();

			disableRecv();
			return;
		}

		dropRecvSwitchButton.disabled = true;

		api.get('/drop/recv/apply')
		.then(({data}) => {
			const {code, wsRecvUrl} = data;

			// 制作二维码
			{
				function createQrcode(text, typeNumber, errorCorrectionLevel, mode, mb) {
					qrcode.stringToBytes = qrcode.stringToBytesFuncs[mb];

					const qr = qrcode(typeNumber || 4, errorCorrectionLevel || 'M');
					qr.addData(text, mode);
					qr.make();

					return qr.createTableTag(3, 0)
					.replaceAll('background-color: #ffffff;', '');
				}

				function parseHTML(htmlString) {
					const template = document.createElement('template');
					template.innerHTML = htmlString.trim(); // 去除字符串两端的空白
					return template.content.firstChild;
				}

				dropQrCode.innerHTML = '';

				const qrCodeUrl = new URL(`#DROP-${code}`, location).toString();
				const dropQrCodeTable = parseHTML(createQrcode(qrCodeUrl, '0', 'H', 'Byte', 'UTF-8'));
				dropQrCodeTable.id = 'dropQrCodeTable';
				dropQrCode.appendChild(dropQrCodeTable);

				const qrCodeTip = document.createElement('span');
				qrCodeTip.classList.add('drop-qrcode-tip');
				qrCodeTip.textContent = '扫一扫 码上传';
				dropQrCode.appendChild(qrCodeTip);
			}

			// 设置连接码
			dropCode.textContent = code.toUpperCase();

			// 连接 WebSocket
			dropRecvWsClient = new WebSocketClient(completeWsUrl(wsRecvUrl));
			dropRecvWsClient.onMessage = (message) => {
				const clone = dropRecvDataTemplate.content.cloneNode(true);

				const {type, data} = JSON.parse(message);

				const typeEl = clone.querySelector('.type');
				const contentEl = clone.querySelector('.content');
				const operateButton = clone.querySelector('.operate-button');

				switch (type) {
					case 'text': {
						typeEl.textContent = "文本";
						contentEl.textContent = data.text;
						operateButton.textContent = '复制';
						operateButton.addEventListener('click', async () => {
							await copyText(data.text);
						});
						break;
					}
					case 'files': {
						typeEl.textContent = "文件";
						if (data.configs.length > 1) {
							contentEl.textContent = `${data.configs[0].name} 等 ${data.configs.length} 个文件`;
							operateButton.textContent = '查看';
							operateButton.addEventListener('click', async () => {
								new SelectDownloadDialog(data.configs).open();
							});
						} else {
							contentEl.textContent = data.configs[0].name;
							operateButton.textContent = '下载';
							operateButton.addEventListener('click', async () => {
								await downloadConfigs(data.configs);
							});
						}
						break;
					}
				}

				dropRecvDataList.appendChild(clone);
				dropRecvDataList.classList.remove("empty");
			};
			dropRecvWsClient.onClose = () => {
				disableRecv();
			};
			dropRecvWsClient.open();

			enableRecv();
		})
		.catch(({message}) => alert(`启动失败：${message}`))
		.finally(() => dropRecvSwitchButton.disabled = false);
	});

	disableRecv();

	// 处理#，# + 类型 + - + 参数
	const hash = location.hash;
	if (hash) {
		const hashMatch = hash.match(/^#(\w+)-(.+)$/);
		if (hashMatch) {
			const type = hashMatch[1];
			const param = hashMatch[2];

			switch (type) {
				case 'TEXT':
					document.querySelector('page-item[for=text]').click();
					extractTextCode.value = param;
					extractTextForm.dispatchEvent(new SubmitEvent('submit'));
					break;
				case 'FILE':
					document.querySelector('page-item[for=file]').click();
					extractFileCode.value = param;
					extractFileForm.dispatchEvent(new SubmitEvent('submit'));
					break;
				case 'PLAY':
					document.querySelector('page-item[for=file]').click();
					playFileCode.value = param;
					playFileForm.dispatchEvent(new SubmitEvent('submit'));
					break;
				case 'DROP':
					document.querySelector('page-item[for=drop]').click();
					dropConnectCode.value = param;
					dropConnectForm.dispatchEvent(new SubmitEvent('submit'));
					break;
			}

			// 清除hash replace
			const newUrl = new URL(location);
			newUrl.hash = '';
			history.replaceState(null, '', newUrl);
		}
	}
});