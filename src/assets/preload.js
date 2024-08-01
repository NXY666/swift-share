import "core-js/stable";
import "regenerator-runtime/runtime";
import './js/page.js';
import {uploadFiles} from "./js/transfer.js";
import {api} from "./js/api.js";

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/service-worker.js', {type: 'module'})
	.then(registration => {
		console.log('Service Worker registered with scope:', registration.scope);
	})
	.catch(error => {
		console.log('Service Worker registration failed:', error);
	});

	document.addEventListener('DOMContentLoaded', async () => {
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

				if (shareFiles.length === 0) {
					showAlertDialog("提示", "文件已失效，请重试。");
					return;
				}

				const dialog = new SelectUploadDialog(shareFiles, (files) => {
					uploadFiles(files).catch(({message}) => showAlertDialog('上传失败', message));
				});
				dialog.open();
			} else if (typeof shareTargets === "number") {
				const response = await fetch("/system-share?id=" + shareTargets);

				if (!response.ok) {
					showAlertDialog("提示", "文本已失效，请重试。");
					return;
				}

				const text = await response.text();

				const dialog = new ConfirmUploadTextDialog(text, () => {
					api.post("/upload/text", text)
					.then(({data}) => showAlertDialog('上传成功', `请凭【${data.code.toUpperCase()}】提取文本。`))
					.catch(({message}) => showAlertDialog('上传失败', message));
				});
				dialog.open();
			}
		}
	});
}

// 如果可以访问剪贴板api，那么支持Ctrl+V粘贴上传
if (navigator.clipboard) {
	document.addEventListener('paste', async () => {
		// 获取当前焦点元素
		const activeElement = document.activeElement;

		// 判断当前元素是否是输入框或文本区域等可输入的元素
		const isInputElement = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;

		const {showAlertDialog, ConfirmUploadTextDialog, SelectUploadDialog} = await import("./js/dialog.js");

		if (!isInputElement || activeElement.readOnly || activeElement.disabled) {
			const clipboardItems = await navigator.clipboard.read();
			const clipboardItem = clipboardItems[0];

			if (clipboardItem.types.includes('text/plain')) {
				const textBlob = await clipboardItem.getType('text/plain');
				const text = await textBlob.text();
				const dialog = new ConfirmUploadTextDialog(text, () => {
					api.post("/upload/text", textBlob)
					.then(({data}) => showAlertDialog('上传成功', `请凭【${data.code.toUpperCase()}】提取文本。`))
					.catch(({message}) => showAlertDialog('上传失败', message));
				});
				dialog.open();
			} else if (clipboardItem.types.includes('image/png')) {
				const blob = await clipboardItem.getType('image/png');
				const file = new File([blob], 'image.png', {type: 'image/png'});
				const dialog = new SelectUploadDialog([file], (files) => {
					uploadFiles(files).catch(({message}) => showAlertDialog('上传失败', message));
				});
				dialog.open();
			}
		}
	});
}