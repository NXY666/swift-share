import "core-js/stable";
import "regenerator-runtime/runtime";
import './js/page.js';
import {uploadFiles} from "./js/transfer.js";
import {api} from "./js/api.js";
import {completeUrl} from "./js/url.js";

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

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register(completeUrl('/service-worker.js'), {type: 'module'})
	.then(registration => {
		console.log('Service Worker registered with scope:', registration.scope);
	})
	.catch(error => {
		console.log('Service Worker registration failed:', error);
	});

	// 获取当前页面的 URL
	const currentUrl = new URL(window.location.href);

	// 获取查询参数对象
	const params = currentUrl.searchParams;

	if (params.has("share")) {
		const shareTargets = JSON.parse(decodeURIComponent(params.get("share")));

		// 移除链接中的查询参数
		params.delete("share");
		history.replaceState(null, "", currentUrl.toString());

		const {showAlertDialog, ConfirmUploadTextDialog, SelectUploadDialog} = await import("./js/dialog.js");

		if (Array.isArray(shareTargets)) {
			const shareFilePromises = shareTargets.map(async target => {
				const response = await fetch("/system-share?id=" + target.id);

				if (!response.ok) {
					throw new Error(await response.text());
				}

				const blob = await response.blob();
				return new File([blob], target.name, {size: target.size});
			});

			const shareFiles = await Promise.allSettled(shareFilePromises)
			.then(results => results.filter(({status}) => status === "fulfilled")
			.map(({value}) => value));

			if (shareFiles.length !== 0) {
				const dialog = new SelectUploadDialog(shareFiles);
				dialog.addEventListener('confirm', (evt) => {
					const {files} = evt.data;
					uploadFiles(files).catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)));
				});
				dialog.open();
			} else {
				showAlertDialog("提示", "文件已失效，请重试。");
			}
		} else if (typeof shareTargets === "number") {
			const response = await fetch("/system-share?id=" + shareTargets);

			if (response.ok) {
				const text = await response.text();

				const dialog = new ConfirmUploadTextDialog(text);
				dialog.addEventListener('confirm', () => {
					api.post("/upload/text", text)
					.then(({data}) => showAlertDialog('上传成功', `请凭【${data.code.toUpperCase()}】提取文本。`))
					.catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)));
				});
				dialog.open();
			} else {
				showAlertDialog("提示", "文本已失效，请重试。");
			}
		}
	}
}

// 如果可以访问剪贴板api，那么支持Ctrl+V粘贴上传
if (navigator.clipboard) {
	document.addEventListener('paste', async () => {
		const activeElement = document.activeElement;

		const isInputElement = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;

		const {showAlertDialog, ConfirmUploadTextDialog, ConfirmUploadImageDialog} = await import("./js/dialog.js");

		// 如果有对话框正在显示，则不处理
		if (dialogManager.any()) {
			return;
		}

		if (!isInputElement || activeElement.readOnly || activeElement.disabled) {
			try {
				const clipboardItems = await navigator.clipboard.read();
				const clipboardItem = clipboardItems[0];

				if (clipboardItem.types.includes('text/plain')) {
					const textBlob = await clipboardItem.getType('text/plain');
					const text = await textBlob.text();
					const dialog = new ConfirmUploadTextDialog(text);
					dialog.addEventListener('confirm', () => {
						api.post("/upload/text", text)
						.then(({data}) => showAlertDialog('上传成功', `请凭【${data.code.toUpperCase()}】提取文本。`))
						.catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)));
					});
					dialog.open();
				} else if (clipboardItem.types.includes('image/png')) {
					const blob = await clipboardItem.getType('image/png');
					const blobUrl = URL.createObjectURL(blob);
					const dialog = new ConfirmUploadImageDialog(blobUrl);
					dialog.addEventListener('confirm', () => {
						uploadFiles([new File([blob], 'image.png', {type: 'image/png'})])
						.catch(reason => showAlertDialog('上传失败', commonErrorReasonHandler(reason)));
					});
					dialog.open();
				}
			} catch (error) {
				if (error.name === 'NotAllowedError') {
					await showAlertDialog('上传失败', '请允许网站访问剪贴板，以便通过剪贴板上传文本和图片。');
				} else {
					await showAlertDialog('上传失败', `未知错误，请联系开发者。（${error.message}）`);
				}
			}
		}
	});
}
