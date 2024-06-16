export async function downloadConfigs(configs) {
	const {DownloadDialog} = await import("./dialog.js");
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
