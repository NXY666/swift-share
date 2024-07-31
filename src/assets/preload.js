import "core-js/stable";
import "regenerator-runtime/runtime";
import './js/page.js';
import {SelectUploadDialog} from "./js/dialog.js";
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
			console.log("has share");
			const shareTargets = JSON.parse(decodeURIComponent(params.get("share")));

			// 移除链接中的查询参数
			params.delete("share");
			history.replaceState(null, "", currentUrl.toString());

			if (Array.isArray(shareTargets)) {
				const shareFilePromises = shareTargets.map(async target => {
					const response = await fetch("/system-share?id=" + target.id);
					const blob = await response.blob();
					return new File([blob], target.name, {size: target.size});
				});

				const shareFiles = await Promise.allSettled(shareFilePromises)
				.then(results => results.filter(({status}) => status === "fulfilled")
				.map(({value}) => value));

				const {SelectUploadDialog} = await import("./js/dialog.js");
				const dialog = new SelectUploadDialog(shareFiles, (files) => {
					uploadFiles(files)
					.catch(({message}) => alert(message));
				});
				dialog.open();
			} else if (typeof shareTargets === "number") {
				const response = await fetch("/system-share?id=" + shareTargets);
				const text = await response.text();

				api.post("/upload/text", text)
				.then(({data}) => alert(`文本上传成功。请凭【${data.code.toUpperCase()}】提取文本。`))
				.catch(({message}) => alert(message));
			}
		}
	});
}
