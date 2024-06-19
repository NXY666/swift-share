import {api} from "./api.js";

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
