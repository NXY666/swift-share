import {api} from "./api.js";
import {completeUrl} from "./url.js";

export async function downloadConfigs(configs) {
	const {DownloadDialog} = await import("./dialog.js");
	const downloadDialog = new DownloadDialog(configs);
	downloadDialog.open();

	const failedConfigs = [];

	for (let activeConfigIndex = 0; activeConfigIndex < configs.length; activeConfigIndex++) {
		const activeConfig = configs[activeConfigIndex];

		try {
			// 请求文件的第一个字，请求到了说明可以开始下载
			await api.get(activeConfig.downUrl, {headers: {"Range": `bytes=0-0`}});

			// 说明下载完成，下载整个文件
			const a = document.createElement('a');
			a.href = completeUrl(activeConfig.downUrl);
			a.download = activeConfig.name;
			a.click();
		} catch {
			failedConfigs.push(activeConfig);
		}

		downloadDialog.addFileProgress();
		downloadDialog.addTotalProgress();
	}

	if (failedConfigs.length > 0) {
		alert(`以下文件未能下载：\n${failedConfigs.map(config => config.name).join('\n')}`);
	}
}

export function uploadFiles(blobFiles) {
	let checkpointTimeout = null;

	return api.post('/upload/files/apply', {
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

		const {UploadDialog} = await import('./dialog.js');
		const uploadDialog = new UploadDialog(configs, extractCode);
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
	}).finally(() => {
		clearTimeout(checkpointTimeout);
		checkpointTimeout = null;
	});
}