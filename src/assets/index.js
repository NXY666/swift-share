import "core-js/stable";
import "regenerator-runtime/runtime";
import './index.css';
import {api} from "./js/api.js";
import {copyText, parseExtractCode} from "./js/string.js";
import {downloadConfigs, uploadFiles} from "./js/transfer.js";
import {completeUrl, completeWsUrl} from "./js/url.js";

function disableForm(form) {
	const formId = form.id;
	form.querySelectorAll('input, textarea, button').forEach(element => {
		if (element.disabled === false) {
			element.dataset.disabledBy = formId;
			element.disabled = true;
		}
	});
}

function enableForm(form) {
	const formId = form.id;
	form.querySelectorAll('input, textarea, button').forEach(element => {
		if (element.dataset.disabledBy === formId) {
			element.disabled = false;
			delete element.dataset.disabledBy;
		}
	});
}

function commonErrorReasonHandler(reason) {
	let message;

	if (reason.code === -1 && reason.message === "TypeError: Failed to fetch") {
		message = `网络异常，请检查网络连接。`;
	} else if (reason instanceof Error || reason.code === -1) {
		message = `未知错误，请联系开发者。（${reason.message}）`;
	} else {
		message = reason.message;
	}

	return message;
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

	uploadTextInput.addEventListener('keydown', e => {
		if (e.ctrlKey && e.key === 'Enter') {
			uploadTextForm.dispatchEvent(new SubmitEvent('submit'));
		}
	});
	uploadTextForm.addEventListener('submit', async e => {
		e.preventDefault();

		const text = uploadTextInput.value;
		if (text.trim() === '') {
			return;
		}

		const {showAlertDialog} = await import('./js/dialog.js');

		disableForm(uploadTextForm);

		api.post("/upload/text", text)
		.then(({data}) => showAlertDialog('上传成功', `请凭【${data.code.toUpperCase()}】提取文本。`))
		.catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)))
		.finally(() => enableForm(uploadTextForm));
	});

	const extractTextForm = document.getElementById('extractTextForm');
	const extractTextCode = document.getElementById('extractTextCode');
	const extractedText = document.getElementById('extractedText');
	const copyExtractedTextButton = document.getElementById('copyExtractedTextButton');

	extractTextForm.addEventListener("submit", e => {
		e.preventDefault();

		const extractionCode = parseExtractCode(extractTextCode.value);
		if (!extractionCode.length) {
			return;
		}

		disableForm(extractTextForm);

		api.get(`/extract/text/${extractionCode}`)
		.then(({data}) => {
			extractedText.style.backgroundColor = 'var(--background-color-3)';
			extractedText.style.color = 'var(--form-color)';
			extractedText.textContent = data.text;
		})
		.catch(reason => {
			extractedText.style.backgroundColor = 'var(--form-background-error-color)';
			extractedText.style.color = 'var(--form-error-color)';
			extractedText.textContent = commonErrorReasonHandler(reason);
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

	uploadFileForm.addEventListener('submit', async e => {
		e.preventDefault();

		const blobFiles = uploadFileInput.files;
		if (!blobFiles.length) {
			return;
		}

		const {showAlertDialog} = await import('./js/dialog.js');

		disableForm(uploadFileForm);

		uploadFiles(blobFiles)
		.catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)))
		.finally(() => enableForm(uploadFileForm));
	});

	const extractFileCode = document.getElementById('extractFileCode');
	const extractFileForm = document.getElementById('extractFileForm');

	extractFileForm.addEventListener('submit', async e => {
		e.preventDefault();

		const extractionCode = parseExtractCode(extractFileCode.value);
		if (!extractionCode.length) {
			return;
		}

		const {showAlertDialog, SelectDownloadDialog} = await import('./js/dialog.js');

		disableForm(extractFileForm);

		api.get(`/extract/files/${extractionCode}`)
		.then(async ({data}) => {
			const {configs} = data;
			if (e.isTrusted && configs.length === 1 && !configs[0].removed) {
				await downloadConfigs(configs);
			} else {
				const dialog = new SelectDownloadDialog(configs);
				dialog.addEventListener('confirm', (evt) => {
					const {configs} = evt.data;
					downloadConfigs(configs);
				});
				dialog.open();
			}
		})
		.catch(reason => showAlertDialog('提取失败', commonErrorReasonHandler(reason)))
		.finally(() => enableForm(extractFileForm));
	});

	const playFileCode = document.getElementById('playFileCode');
	const playFileForm = document.getElementById('playFileForm');
	const playFileVideo = document.getElementById('playFileVideo');

	async function playConfig(config) {
		const {VideoTrackStation} = await import('./js/subtitle/videoTrackStation.js');
		const {SubtitleExtractor} = await import('./js/subtitle/subtitleExtractor.js');

		if (!videoTrackStation) {
			videoTrackStation = new VideoTrackStation(playFileVideo);
		}

		subExtractInst = null;

		if (videoTrackStation.reset()) {
			await videoTrackStation.flush();
		}

		const playName = config.name, playUrl = completeUrl(config.playUrl);

		playFileVideo.src = playUrl;

		if (playName.endsWith('.mkv') || playName.endsWith('.webm')) {
			subExtractInst = await SubtitleExtractor.fromUrl(videoTrackStation, playUrl);
			playFileVideo.load();
		}
	}

	let subExtractInst = null, videoTrackStation;

	playFileForm.addEventListener('submit', async e => {
		e.preventDefault();

		const extractionCode = parseExtractCode(playFileCode.value);
		if (!extractionCode.length) {
			return;
		}

		const {showAlertDialog, SelectPlayDialog} = await import('./js/dialog.js');

		disableForm(playFileForm);

		api.get(`/extract/files/${extractionCode}`)
		.then(async ({data}) => {
			const {configs} = data;

			if (configs.length === 1 && !configs[0].removed) {
				await playConfig(configs[0]);
			} else {
				const dialog = new SelectPlayDialog(configs);
				dialog.addEventListener('confirm', (evt) => {
					const {config} = evt.data;
					playConfig(config);
				});
				dialog.open();
			}
		})
		.catch(reason => showAlertDialog('提取失败', commonErrorReasonHandler(reason)))
		.finally(() => enableForm(playFileForm));
	});

	playFileVideo.addEventListener('timeupdate', () => subExtractInst?.refresh());

	playFileVideo.textTracks.addEventListener('change', () => {
		const index = Array.from(playFileVideo.textTracks).findIndex(n => n.mode === 'showing');
		videoTrackStation.onTrackChange(index);
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

	dropConnectForm.addEventListener('submit', async e => {
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

		const {showAlertDialog} = await import('./js/dialog.js');

		disableForm(dropConnectForm);

		api.get(`/drop/send/apply?code=${connectCode}`)
		.then(async ({data}) => {
			const {wsSendUrl} = data;

			const {WebSocketClient} = await import('./js/websocket.js');
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
		.catch(reason => {
			showAlertDialog('连接失败', commonErrorReasonHandler(reason));

			enableForm(dropConnectForm);
		});
	});

	const dropUploadTextInput = document.getElementById('dropUploadTextInput');
	const dropUploadTextForm = document.getElementById('dropUploadTextForm');

	dropUploadTextInput.addEventListener('keydown', e => {
		if (e.ctrlKey && e.key === 'Enter') {
			dropUploadTextForm.dispatchEvent(new SubmitEvent('submit'));
		}
	});
	dropUploadTextForm.addEventListener('submit', async e => {
		e.preventDefault();

		const text = dropUploadTextInput.value;
		if (text.trim() === '') {
			return;
		}

		const {showAlertDialog} = await import('./js/dialog.js');

		disableForm(dropUploadTextForm);

		api.post("/upload/text?drop=" + dropConnectCode.value, text)
		.then(() => dropUploadTextForm.reset())
		.catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)))
		.finally(() => enableForm(dropUploadTextForm));
	});

	const dropUploadFileInput = document.getElementById('dropUploadFileInput');
	const dropUploadFileForm = document.getElementById('dropUploadFileForm');

	dropUploadFileForm.addEventListener('submit', async e => {
		e.preventDefault();

		const blobFiles = dropUploadFileInput.files;
		if (!blobFiles.length) {
			return;
		}

		const {showAlertDialog} = await import('./js/dialog.js');

		disableForm(dropUploadFileForm);

		let checkpointTimeout = null;
		api.post('/upload/files/apply?drop=' + dropConnectCode.value, {
			files: Array.from(blobFiles).map(file => ({
				name: file.name,
				size: file.size
			}))
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

			const {UploadDialog} = await import('./js/dialog.js');
			const uploadDialog = new UploadDialog(configs, extractCode, false);
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

			dropUploadFileForm.reset();
		})
		.catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)))
		.finally(() => {
			enableForm(dropUploadFileForm);

			clearTimeout(checkpointTimeout);
			checkpointTimeout = null;
		});
	});

	const dropRecvSwitchButton = document.getElementById('dropRecvSwitchButton');
	const dropRecvHelper = document.getElementById('dropRecvHelper');
	const dropCodeButton = document.getElementById('dropCodeButton');
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

	dropRecvSwitchButton.addEventListener('click', async () => {
		if (dropRecvSwitchButton.dataset.enabled === 'true') {
			dropRecvWsClient.close();

			disableRecv();
			return;
		}

		const {showAlertDialog} = await import('./js/dialog.js');

		dropRecvSwitchButton.disabled = true;

		api.get('/drop/recv/apply')
		.then(async ({data}) => {
			const {code, wsRecvUrl} = data;

			// 制作二维码
			{
				function createQrcode(text, typeNumber, errorCorrectionLevel, mode, mb) {
					qrcode.stringToBytes = qrcode.stringToBytesFuncs[mb];

					const qr = qrcode(typeNumber || 4, errorCorrectionLevel || 'M');
					qr.addData(text, mode);
					qr.make();

					return qr.createTableTag(4, 0)
					.replaceAll('background-color: #ffffff;', '')
					.replaceAll(' border-width: 0px; border-style: none; border-collapse: collapse; padding: 0px; margin: 0px; width: 4px; height: 4px; ', '');
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

				const resizeObserver = new ResizeObserver(entries => {
					for (let entry of entries) {
						const width = entry.contentRect.width;
						dropQrCodeTable.style.height = `${width}px`;
					}
				});
				resizeObserver.observe(dropQrCodeTable);

				dropQrCode.appendChild(dropQrCodeTable);

				const qrCodeTip = document.createElement('span');
				qrCodeTip.classList.add('drop-qrcode-tip');
				qrCodeTip.textContent = '扫一扫 码上传';
				dropQrCode.appendChild(qrCodeTip);
			}

			// 设置连接码
			dropCode.textContent = code.toUpperCase();

			// 连接 WebSocket
			const {WebSocketClient} = await import('./js/websocket.js');
			dropRecvWsClient = new WebSocketClient(completeWsUrl(wsRecvUrl));
			dropRecvWsClient.onMessage = message => {
				const cloneFragment = dropRecvDataTemplate.content.cloneNode(true);
				const element = cloneFragment.firstElementChild;

				const {type, data} = JSON.parse(message);

				const typeEl = element.querySelector('.type');
				const contentEl = element.querySelector('.content');
				const operateButton = element.querySelector('.operate-button');

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
					case 'file': {
						typeEl.textContent = "文件";
						contentEl.textContent = data.fileName;
						operateButton.textContent = '下载';
						operateButton.addEventListener('click', async () => {
							operateButton.disabled = true;

							api.get(`/extract/files/${data.code}`)
							.then(async ({data}) => {
								const {configs} = data;

								if (configs[0].removed) {
									throw new Error('文件已损坏，请重新上传。');
								}

								await downloadConfigs(configs);
							})
							.catch(reason => showAlertDialog('提取失败', commonErrorReasonHandler(reason)))
							.finally(() => operateButton.disabled = false);
						});
						break;
					}
					case 'files': {
						typeEl.textContent = "集合";
						contentEl.textContent = `${data.firstFileName} 等 ${data.fileCount} 个文件`;
						operateButton.textContent = '查看';
						operateButton.addEventListener('click', async () => {
							operateButton.disabled = true;

							api.get(`/extract/files/${data.code}`)
							.then(async ({data}) => {
								const {configs} = data;

								const {SelectDownloadDialog} = await import('./js/dialog.js');
								const dialog = new SelectDownloadDialog(configs);
								dialog.addEventListener('confirm', (evt) => {
									const {configs} = evt.data;
									downloadConfigs(configs);
								});
								dialog.open();
							})
							.catch(reason => showAlertDialog('提取失败', commonErrorReasonHandler(reason)))
							.finally(() => operateButton.disabled = false);
						});
						break;
					}
				}

				if (dropRecvDataList.classList.contains('empty')) {
					dropRecvDataList.classList.remove('empty');
				}

				dropRecvDataList.firstElementChild.insertAdjacentElement('afterend', element);

				element.scrollIntoView({behavior: 'smooth', block: 'nearest'});
			};
			dropRecvWsClient.onClose = () => {
				disableRecv();
			};
			dropRecvWsClient.open();

			enableRecv();
		})
		.catch(reason => showAlertDialog('初始化失败', commonErrorReasonHandler(reason)))
		.finally(() => dropRecvSwitchButton.disabled = false);
	});

	dropCodeButton.addEventListener('click', async () => await copyText(dropCode.textContent));

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

window.addEventListener('popstate', () => {
	const pageBar = document.querySelector('page-bar');
	pageBar.updateSlider();
});
