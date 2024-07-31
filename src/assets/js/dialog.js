import {defineKeyboardClickEvent} from "./element.js";
import {copyText, parseBytes} from "./string.js";

/**
 * @abstract
 */
class Dialog {
	static defaultTitle = '对话框';

	static defaultStyles = `
		.dialog-overlay {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: rgba(0, 0, 0, 0.5);
			user-select: none;
			animation: overlay-appear var(--base-transition-duration);
		}
		@keyframes overlay-appear {
			0% {
				opacity: 0;
			}
			100% {
				opacity: 1;
			}
		}
		@keyframes overlay-disappear {
			0% {
				opacity: 1;
			}
			100% {
				opacity: 0;
			}
		}
		.dialog-container {
			width: 500px;
			max-width: calc(100% - 40px);
			font-size: 14px;
			position: fixed;
			z-index: 114514;
			top: 0;
			margin: 10vh auto;
			max-height: 80vh;
			left: 50%;
			transform: translateX(-50%);
			animation: dialog-appear var(--base-transition-duration);
			border: 1px solid var(--dialog-border-color);
			border-radius: 5px;
			background-color: var(--dialog-background-color);
			box-shadow: 0 0 18px rgba(0,0,0,.3);
		}
		@keyframes dialog-appear {
			0% {
				transform: translateX(-50%) scale(0.8);
				opacity: 0;
			}
			100% {
				transform: translateX(-50%) scale(1);
				opacity: 1;
			}
		}
		@keyframes dialog-disappear {
			0% {
				transform: translateX(-50%) scale(1);
				opacity: 1;
			}
			100% {
				transform: translateX(-50%) scale(0.8);
				opacity: 0;
			}
		}
		.dialog-header {
			padding: 16px;
			border-bottom: 1px solid var(--dialog-border-color);
			border-top-left-radius: 5px;
			border-top-right-radius: 5px;
			background-color: var(--dialog-header-background-color);
			display: flex;
			align-items: center;
		}
		.dialog-header .dialog-title {
		    margin: 0px;
		    overflow: hidden;
		    text-overflow: ellipsis;
		    white-space: nowrap;
	    }
		.dialog-close-button {
			flex: 0 0 auto;
			margin-left: auto;
			cursor: pointer;
			color: var(--dialog-header-close-color);
		}
		.dialog-close-button:hover {
			color: var(--dialog-header-close-hover-color);
		}
		.dialog-body {
			padding: 16px;
			max-height: 60vh;
			overflow: auto;
		}
		.dialog-footer {
			padding: 0 16px 16px;
			display: flex;
			align-items: center;
		}
		.dialog-footer button {
			height: 30px;
		}
	`;

	/**
	 * 遮罩层
	 * @type {HTMLDivElement}
	 */
	#overlay = document.createElement('div');

	/**
	 * 样式
	 * @type {HTMLStyleElement}
	 */
	#style = document.createElement('style');

	/**
	 * 对话框
	 * @type {HTMLDivElement}
	 */
	#dialog = document.createElement('div');

	/**
	 * 头部
	 * @type {HTMLDivElement}
	 */
	#headerContainer = document.createElement('div');

	/**
	 * 身体
	 * @type {HTMLDivElement}
	 */
	#bodyContainer = document.createElement('div');

	/**
	 * 底部
	 * @type {HTMLDivElement}
	 */
	#footerContainer = document.createElement('div');

	#hasOpened = false;

	#hasClosed = false;

	/**
	 * 内容
	 * @type {string|HTMLDivElement}
	 */
	#content = '';

	/**
	 * 底部
	 * @type {?HTMLDivElement}
	 */
	#footer = null;

	/**
	 * 点击遮罩层关闭
	 * @type {boolean}
	 */
	#closeOnClickOverlay = false;

	/**
	 * 按 ESC 关闭
	 */
	#closeOnEsc = false;

	/**
	 * 显示关闭按钮
	 * @type {boolean}
	 */
	#showCloseButton = true;

	#closeDialogKeyboardEvent;

	get title() {
		return this.constructor.defaultTitle;
	}

	get styles() {
		return this.constructor.defaultStyles;
	}

	get allStyles() {
		let result = '';
		let current = Reflect.getPrototypeOf(this);

		while (current) {
			if (Reflect.has(current, 'styles')) {
				result += Reflect.get(current, 'styles');
			}
			current = Reflect.getPrototypeOf(current);
		}

		return result;
	}

	set content(content) {
		this.#content = content;
	}

	set footer(footer) {
		this.#footer = footer;
	}

	set closeOnClickOverlay(closeOnClickOverlay) {
		this.#closeOnClickOverlay = closeOnClickOverlay;
	}

	set closeOnEsc(closeOnEsc) {
		this.#closeOnEsc = closeOnEsc;
		if (closeOnEsc) {
			document.addEventListener('keydown', this.#closeDialogKeyboardEvent = (e) => {
				if (e.key === 'Escape') {
					document.removeEventListener('keydown', this.#closeDialogKeyboardEvent);
					this.close();
				}
			});
		} else {
			document.removeEventListener('keydown', this.#closeDialogKeyboardEvent);
		}
	}

	set showCloseButton(showCloseButton) {
		this.#showCloseButton = showCloseButton;
	}

	/**
	 * 打开对话框
	 */
	open() {
		if (this.#hasOpened) {
			return;
		}
		this.#hasOpened = true;

		this.#overlay.classList.add('dialog-overlay');
		{
			this.#style.textContent = this.allStyles;
			this.#overlay.appendChild(this.#style);

			this.#dialog.classList.add('dialog-container');
			{
				// 头部
				this.#headerContainer.classList.add('dialog-header');
				{
					this.#headerContainer.classList.add('dialog-header');
					{
						const titleText = document.createElement('h3');
						titleText.classList.add('dialog-title');
						titleText.textContent = this.title;
						this.#headerContainer.appendChild(titleText);
					}

					if (this.#showCloseButton) {
						const closeButton = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
						closeButton.classList.add('dialog-close-button');
						closeButton.setAttribute('tabindex', '0');
						closeButton.setAttribute('role', 'button');
						closeButton.setAttribute('width', '16');
						closeButton.setAttribute('height', '16');
						closeButton.setAttribute('viewBox', '0 0 16 16');
						closeButton.setAttribute('fill', 'currentColor');
						{
							const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
							path.setAttribute('d', 'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z');
							closeButton.appendChild(path);
						}
						closeButton.addEventListener('click', () => {
							this.close();
						});
						defineKeyboardClickEvent(closeButton);
						this.#headerContainer.appendChild(closeButton);
					}
				}
				this.#dialog.appendChild(this.#headerContainer);

				// 身体
				this.#bodyContainer.classList.add('dialog-body');
				{
					if (typeof this.#content === 'string') {
						this.#bodyContainer.textContent = this.#content;
					} else {
						this.#bodyContainer.appendChild(this.#content);
					}
				}
				this.#dialog.appendChild(this.#bodyContainer);

				// 底部
				if (this.#footer) {
					this.#footerContainer.classList.add('dialog-footer');
					{
						this.#footerContainer.appendChild(this.#footer);
					}
					this.#dialog.appendChild(this.#footerContainer);
				}
			}
			if (this.#closeOnClickOverlay) {
				this.#overlay.addEventListener('click', (ev) => {
					if (ev.target === this.#overlay) {
						this.close();
					}
				});
			}
			this.#overlay.appendChild(this.#dialog);
		}
		document.body.appendChild(this.#overlay);
	}

	/**
	 * 关闭对话框
	 */
	close() {
		if (!this.#hasOpened || this.#hasClosed) {
			return;
		}
		this.#hasClosed = true;
		this.#overlay.style.animationName = 'overlay-disappear';
		this.#dialog.style.animationName = 'dialog-disappear';
		this.#dialog.addEventListener('animationend', () => {
			document.body.removeChild(this.#overlay);
		});
	}
}

class TransferDialog extends Dialog {
	static defaultStyles = `
		.transfer-tip {
			width: 100%;
			height: 100%;
			position: relative;
			padding: 10px;
			border-radius: 3px;
			font-size: 14px;
			background-color: var(--dialog-on-background-color);
			border-left: 5px solid var(--primary-color-1);
			margin-bottom: 5px;
		}
		.transfer-container {
			width: 100%;
			height: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 5px;
		}
		.transfer-progress-label-container {
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 20px;
			padding: 5px;
		}
		.transfer-progress-label {
			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
		}
		.transfer-progress-label + .transfer-progress-label {
			flex: 0 0 auto;
		}
		.transfer-progress {
			width: 100%;
			height: 10px;
			margin-bottom: 5px;
		}
		.transfer-cancel-button {
			width: 100%;
			height: 30px;
			margin-top: 5px;
		}
	`;

	/**
	 * 传输对话框容器
	 * @type {HTMLDivElement}
	 */
	#transferContainer = document.createElement('div');

	/**
	 * 文件进度
	 * @type {HTMLProgressElement}
	 */
	#fileProgress = document.createElement('progress');

	/**
	 * 文件进度文本容器
	 * @type {HTMLDivElement}
	 */
	#fileProgressLabelContainer = document.createElement('div');

	/**
	 * 文件名称文本
	 * @type {HTMLSpanElement}
	 */
	#fileNameLabel = document.createElement('span');

	/**
	 * 文件进度百分比
	 * @type {HTMLSpanElement}
	 */
	#filePercentLabel = document.createElement('span');

	/**
	 * 总进度
	 * @type {HTMLProgressElement}
	 */
	#totalProgress = document.createElement('progress');

	/**
	 * 总进度文本容器
	 * @type {HTMLDivElement}
	 */
	#totalProgressLabelContainer = document.createElement('div');

	/**
	 * 总进度文本
	 * @type {HTMLSpanElement}
	 */
	#totalProgressLabel = document.createElement('span');

	/**
	 * 总进度百分比
	 * @type {HTMLSpanElement}
	 */
	#totalPercentLabel = document.createElement('span');

	/**
	 * @typedef {{name: string, max: number, value: number | null, start: number}[]} TransferConfigs
	 * @property {number?} max - 文件片段总数
	 */

	/**
	 * @typedef {{name: string, max?: number}[]} TransferConfigsInit
	 */

	/**
	 * 取消按钮
	 * @type {HTMLButtonElement}
	 */
	#cancelButton = document.createElement('button');

	/**
	 * 传输配置
	 * @type {TransferConfigs}
	 */
	#configs;

	/**
	 * 当前配置索引
	 * @type {number}
	 */
	#activeConfigIndex = 0;

	/**
	 * 中止信号
	 * @type {AbortSignal}
	 */
	#signal;

	#updateTimeout = null;

	/**
	 * 构造函数
	 * @param {TransferConfigsInit} configs
	 * @param {string} [tipContent] 提示内容
	 * @param {(tipElement: HTMLElement) => void} [tipHandler] 提示处理器
	 * @param {boolean} [allowCancel] 是否允许取消
	 */
	constructor({configs, tipContent, tipHandler, allowCancel = false}) {
		super();

		let count = 0;
		this.#configs = configs.map(config => {
			const result = {
				name: config.name,
				max: 0,
				value: null,
				start: 0
			};

			if (config.max) {
				result.max = config.max;
				result.value = 0;
				result.start = count;
				count += config.max;
			} else {
				result.max = 1;
				result.value = null;
				result.start = count;
				count++;
			}

			return result;
		});
		this.#configs.max = count;

		const abortController = allowCancel ? new AbortController() : null;
		this.#signal = abortController?.signal;

		this.showCloseButton = false;

		this.#transferContainer.classList.add('transfer-container');
		{
			if (tipContent) {
				const tipElement = document.createElement('div');
				tipElement.classList.add('transfer-tip');
				tipElement.innerHTML = tipContent;
				if (tipHandler) {
					tipHandler(tipElement);
				}
				this.#transferContainer.appendChild(tipElement);
			}

			this.#fileProgressLabelContainer.classList.add('transfer-progress-label-container');
			{
				this.#fileNameLabel.classList.add('transfer-progress-label');
				this.#fileProgressLabelContainer.appendChild(this.#fileNameLabel);

				this.#filePercentLabel.classList.add('transfer-progress-label');
				this.#fileProgressLabelContainer.appendChild(this.#filePercentLabel);
			}
			this.#transferContainer.appendChild(this.#fileProgressLabelContainer);

			this.#fileProgress.classList.add('transfer-progress');
			this.#transferContainer.appendChild(this.#fileProgress);

			this.#totalProgressLabelContainer.classList.add('transfer-progress-label-container');
			{
				this.#totalProgressLabel.classList.add('transfer-progress-label');
				this.#totalProgressLabelContainer.appendChild(this.#totalProgressLabel);

				this.#totalPercentLabel.classList.add('transfer-progress-label');
				this.#totalProgressLabelContainer.appendChild(this.#totalPercentLabel);
			}
			this.#transferContainer.appendChild(this.#totalProgressLabelContainer);

			this.#totalProgress.classList.add('transfer-progress');
			this.#transferContainer.appendChild(this.#totalProgress);

			this.#cancelButton.innerText = '取消';
			this.#cancelButton.classList.add('transfer-cancel-button');
			if (!abortController) {
				this.#cancelButton.disabled = true;
			}
			this.#cancelButton.addEventListener('click', () => {
				const activeConfig = this.#configs[this.#activeConfigIndex];
				const totalProgressValue = activeConfig.start + (activeConfig.value || 0);
				if (totalProgressValue === this.#configs.max || this.#signal?.aborted) {
					this.close();
				} else {
					abortController?.abort();
				}
				this.update();
			});
			this.#transferContainer.appendChild(this.#cancelButton);
		}
		this.content = this.#transferContainer;

		this.update();
	}

	get signal() {
		return this.#signal;
	}

	addFileProgress() {
		const activeConfig = this.#configs[this.#activeConfigIndex];
		if (activeConfig.value == null) {
			activeConfig.value = 1;
		} else if (activeConfig.value < activeConfig.max) {
			activeConfig.value++;
		}
		this.update();
	}

	addTotalProgress() {
		if (!this.#configs[this.#activeConfigIndex + 1]) {
			return;
		}
		this.#activeConfigIndex++;
		this.update();
	}

	update() {
		if (!this.#updateTimeout) {
			this.#updateTimeout = setTimeout(() => {
				this.#updateTimeout = null;

				const activeConfig = this.#configs[this.#activeConfigIndex];

				if (this.#signal?.aborted) {
					this.#filePercentLabel.innerText = '已取消';
					this.#totalPercentLabel.innerText = '已取消';

					if (!this.#fileProgress.hasAttribute('value')) {
						this.#fileProgress.value = 0;
					}

					this.#cancelButton.disabled = false;
					this.#cancelButton.innerText = '关闭';
				} else {
					// 文件名称
					this.#fileNameLabel.innerText = activeConfig.name;

					// 文件进度
					this.#fileProgress.max = activeConfig.max;
					if (activeConfig.value == null) {
						this.#fileProgress.removeAttribute('value');
					} else {
						this.#fileProgress.value = activeConfig.value;
					}

					// 文件进度百分比
					if (activeConfig.value === activeConfig.max) {
						this.#filePercentLabel.innerText = '已完成';
					} else if (activeConfig.value == null) {
						this.#filePercentLabel.innerText = '';
					} else {
						this.#filePercentLabel.innerText = `${Math.round(activeConfig.value / activeConfig.max * 100)}%`;
					}

					// 总进度
					const totalProgressValue = activeConfig.start + (activeConfig.value || 0);
					this.#totalProgress.max = this.#configs.max;
					this.#totalProgress.value = totalProgressValue;

					// 总进度文本
					if (totalProgressValue === this.#configs.max) {
						this.#totalProgressLabel.innerText = `总进度 (${this.#configs.length}/${this.#configs.length})`;
					} else {
						this.#totalProgressLabel.innerText = `总进度 (${this.#activeConfigIndex}/${this.#configs.length})`;
					}

					// 总进度百分比
					if (totalProgressValue === this.#configs.max) {
						this.#totalPercentLabel.innerText = '已完成';
					} else {
						this.#totalPercentLabel.innerText = `${Math.round(totalProgressValue / this.#configs.max * 100)}%`;
					}

					if (totalProgressValue === this.#configs.max) {
						this.#cancelButton.disabled = false;
						this.#cancelButton.innerText = '关闭';
					}
				}
			});
		}
	}
}

export class UploadDialog extends TransferDialog {
	static defaultTitle = '上传文件';

	/**
	 * 构造函数
	 * @param {TransferConfigsInit} configs
	 * @param {string} [extractCode] 提取码
	 * @param {boolean} [showTip] 是否显示提示
	 */
	constructor(configs, extractCode, showTip = true) {
		extractCode = extractCode.toUpperCase();
		super({
			tipContent: showTip ? `请凭<button class="link" id="code">【${extractCode}】</button>提取文件。<button class="link" id="link" style="float: right;">复制链接</button>` : '',
			tipHandler: (tipElement) => {
				tipElement.querySelector("#code").addEventListener('click', () => copyText(extractCode));
				tipElement.querySelector("#link").addEventListener('click', () => copyText(completeUrl(`#FILE-${extractCode}`)));
			},
			configs: configs.map(config => ({
				name: config.name,
				max: config.parts[0].index !== -1 ? config.parts.length : null
			})),
			allowCancel: true
		});
	}
}

export class DownloadDialog extends TransferDialog {
	static defaultTitle = '下载文件';

	constructor(configs) {
		super({
			configs: configs.map(config => ({
				name: config.name,
				max: null
			}))
		});
	}
}

export class SelectUploadDialog extends Dialog {
	static defaultTitle = '上传文件';

	static defaultStyles = `
		.dialog-checkbox-list {
			margin: 0;
			overflow-y: auto;
			max-height: 300px;
			padding: 5px;
			list-style-type: none;
			border-radius: 5px;
			background-color: var(--dialog-on-background-color);
			border: 1px solid var(--dialog-border-color);
		}
		@media (prefers-color-scheme: dark) {
			.dialog-checkbox-list {
				border-color: transparent;
			}
		}
		.dialog-checkbox-list li label {
			display: flex;
			align-items: center;
			overflow-wrap: anywhere;
			padding: 10px;
			border-radius: 5px;
			gap: 10px;
		}
		.dialog-checkbox-list li label:hover {
			background-color: var(--dialog-background-color);
		}
		.dialog-checkbox-list li label.disabled {
			opacity: 0.5;
			cursor: not-allowed;
			background-color: transparent;
		}
		.dialog-button-group {
			display: flex;
			align-items: center;
			width: 100%;
		}
	`;

	/**
	 * 复选框列表
	 * @type {HTMLUListElement}
	 */
	#checkboxList = document.createElement('ul');

	/**
	 * 按钮组
	 * @type {HTMLDivElement}
	 */
	#buttonGroup = document.createElement('div');

	/**
	 * 全选标签
	 * @type {HTMLLabelElement}
	 */
	#selectAllLabel = document.createElement('label');

	/**
	 * 全选复选框
	 * @type {HTMLInputElement}
	 */
	#selectAllCheckbox = document.createElement('input');

	/**
	 * 确认按钮
	 * @type {HTMLButtonElement}
	 */
	#confirmButton = document.createElement('button');

	/**
	 * 上传文件
	 * @type {any[]}
	 */
	#files = [];

	constructor(files, callback) {
		super();

		this.#files = files;

		this.#checkboxList.classList.add('dialog-checkbox-list');
		files.forEach((file, index) => {
			const checkboxListItem = document.createElement('li');
			const checkboxLabel = document.createElement('label');
			const checkbox = document.createElement('input');
			const fileContentSpan = document.createElement('span');
			const fileSizeSpan = document.createElement('span');

			{
				checkboxLabel.title = file.name;
				{
					checkbox.type = 'checkbox';
					checkbox.value = index;
					checkbox.checked = true;
					checkbox.addEventListener('change', () => {
						// 更新全选框状态
						const checkboxItems = Array.from(this.#checkboxList.querySelectorAll('input'));
						this.#selectAllCheckbox.checked = checkboxItems.every(checkbox => checkbox.checked);
						this.#selectAllCheckbox.indeterminate = !this.#selectAllCheckbox.checked && checkboxItems.some(checkbox => checkbox.checked);
					});
					checkboxLabel.appendChild(checkbox);

					fileContentSpan.textContent = file.name;
					{
						fileSizeSpan.textContent = parseBytes(file.size);
						fileSizeSpan.style.fontSize = '80%';
						fileSizeSpan.style.padding = '0.1em 0.2em';
						fileSizeSpan.style.borderRadius = '0.2em';
						fileSizeSpan.style.backgroundColor = 'var(--dialog-background-color)';
						fileSizeSpan.style.color = 'var(--text-color-2)';
						fileSizeSpan.style.marginLeft = '5px';
						fileContentSpan.appendChild(fileSizeSpan);
					}
					checkboxLabel.appendChild(fileContentSpan);
				}
				checkboxListItem.appendChild(checkboxLabel);
			}
			this.#checkboxList.appendChild(checkboxListItem);
		});

		this.#buttonGroup.classList.add('dialog-button-group');
		{
			this.#selectAllLabel.style.display = 'flex';
			this.#selectAllLabel.style.alignItems = 'center';
			this.#selectAllLabel.style.gap = '5px';
			{
				this.#selectAllCheckbox.type = 'checkbox';
				this.#selectAllCheckbox.checked = true; // 默认全选
				this.#selectAllCheckbox.addEventListener('change', () => {
					// 全选或取消全选
					this.#checkboxList.querySelectorAll('input').forEach(checkbox => {
						checkbox.checked = this.#selectAllCheckbox.checked;
					});
				});
				this.#selectAllLabel.appendChild(this.#selectAllCheckbox);

				// 全选文字
				this.#selectAllLabel.appendChild(document.createTextNode(' 全选'));
			}
			this.#buttonGroup.appendChild(this.#selectAllLabel);

			this.#confirmButton.textContent = '上传';
			this.#confirmButton.style.marginLeft = 'auto';
			this.#confirmButton.addEventListener('click', async () => {
				const selectedConfigs = Array.from(this.#checkboxList.querySelectorAll('input:checked')).map(checkbox => this.#files[checkbox.value]);
				if (selectedConfigs.length !== 0) {
					callback(selectedConfigs);
				}
				this.close();
			});
			this.#buttonGroup.appendChild(this.#confirmButton);
		}

		this.content = this.#checkboxList;
		this.footer = this.#buttonGroup;

		this.closeOnClickOverlay = true;
		this.closeOnEsc = true;
	}
}

export class SelectDownloadDialog extends Dialog {
	static defaultTitle = '从集合中下载文件';

	static defaultStyles = `
		.dialog-checkbox-list {
			margin: 0;
			overflow-y: auto;
			max-height: 300px;
			padding: 5px;
			list-style-type: none;
			border-radius: 5px;
			background-color: var(--dialog-on-background-color);
			border: 1px solid var(--dialog-border-color);
		}
		@media (prefers-color-scheme: dark) {
			.dialog-checkbox-list {
				border-color: transparent;
			}
		}
		.dialog-checkbox-list li label {
			display: flex;
			align-items: center;
			overflow-wrap: anywhere;
			padding: 10px;
			border-radius: 5px;
			gap: 10px;
		}
		.dialog-checkbox-list li label:hover {
			background-color: var(--dialog-background-color);
		}
		.dialog-checkbox-list li label.disabled {
			opacity: 0.5;
			cursor: not-allowed;
			background-color: transparent;
		}
		.dialog-button-group {
			display: flex;
			align-items: center;
			width: 100%;
		}
	`;

	/**
	 * 复选框列表
	 * @type {HTMLUListElement}
	 */
	#checkboxList = document.createElement('ul');

	/**
	 * 按钮组
	 * @type {HTMLDivElement}
	 */
	#buttonGroup = document.createElement('div');

	/**
	 * 全选标签
	 * @type {HTMLLabelElement}
	 */
	#selectAllLabel = document.createElement('label');

	/**
	 * 全选复选框
	 * @type {HTMLInputElement}
	 */
	#selectAllCheckbox = document.createElement('input');

	/**
	 * 确认按钮
	 * @type {HTMLButtonElement}
	 */
	#confirmButton = document.createElement('button');

	/**
	 * 下载配置
	 * @type {any[]}
	 */
	#configs = [];

	constructor(configs, callback) {
		super();

		this.#configs = configs;

		this.#checkboxList.classList.add('dialog-checkbox-list');
		configs.forEach((downloadConfig, index) => {
			const checkboxListItem = document.createElement('li');
			const checkboxLabel = document.createElement('label');
			const checkbox = document.createElement('input');
			if (downloadConfig.removed) {
				checkboxLabel.classList.add('disabled');
			}

			checkbox.type = 'checkbox';
			checkbox.value = index;
			checkbox.disabled = downloadConfig.removed;
			checkbox.checked = !downloadConfig.removed; // 设置初始状态为全选，但是如果被移除了就不选
			checkbox.addEventListener('change', () => {
				// 更新全选框状态
				const checkboxItems = Array.from(this.#checkboxList.querySelectorAll('input'));
				this.#selectAllCheckbox.checked = checkboxItems.every(checkbox => checkbox.checked || checkbox.disabled);
				this.#selectAllCheckbox.indeterminate = !this.#selectAllCheckbox.checked && checkboxItems.some(checkbox => checkbox.checked);
			});

			checkboxLabel.title = downloadConfig.removed ? '文件已损坏，请重新上传' : downloadConfig.name;
			checkboxLabel.appendChild(checkbox);
			checkboxLabel.appendChild(document.createTextNode(` ${downloadConfig.name}`));

			checkboxListItem.appendChild(checkboxLabel);

			this.#checkboxList.appendChild(checkboxListItem);
		});

		this.#buttonGroup.classList.add('dialog-button-group');
		{
			if (!configs.every(config => config.removed)) {
				this.#selectAllLabel.style.display = 'flex';
				this.#selectAllLabel.style.alignItems = 'center';
				this.#selectAllLabel.style.gap = '5px';
				{
					this.#selectAllCheckbox.type = 'checkbox';
					this.#selectAllCheckbox.checked = true; // 默认全选
					this.#selectAllCheckbox.addEventListener('change', () => {
						// 全选或取消全选
						this.#checkboxList.querySelectorAll('input').forEach(checkbox => {
							checkbox.checked = this.#selectAllCheckbox.checked && !checkbox.disabled;
						});
					});
					this.#selectAllLabel.appendChild(this.#selectAllCheckbox);

					// 全选文字
					this.#selectAllLabel.appendChild(document.createTextNode(' 全选'));
				}
				this.#buttonGroup.appendChild(this.#selectAllLabel);
			}

			this.#confirmButton.textContent = '下载';
			this.#confirmButton.style.marginLeft = 'auto';
			this.#confirmButton.addEventListener('click', async () => {
				const selectedConfigs = Array.from(this.#checkboxList.querySelectorAll('input:checked')).map(checkbox => this.#configs[checkbox.value]);
				if (selectedConfigs.length !== 0) {
					callback(selectedConfigs);
				}
				this.close();
			});
			this.#buttonGroup.appendChild(this.#confirmButton);
		}

		this.content = this.#checkboxList;
		this.footer = this.#buttonGroup;

		this.closeOnClickOverlay = true;
		this.closeOnEsc = true;
	}
}

export class SelectPlayDialog extends Dialog {
	static defaultTitle = '从集合中播放媒体';

	static defaultStyles = `
		.dialog-radio-list {
			margin: 0;
			overflow-y: auto;
			max-height: 300px;
			padding: 5px;
			list-style-type: none;
			border-radius: 5px;
			background-color: var(--dialog-on-background-color);
			border: 1px solid var(--dialog-border-color);
		}
		@media (prefers-color-scheme: dark) {
			.dialog-radio-list {
				border-color: transparent;
			}
		}
		.dialog-radio-list li label {
			display: flex;
			align-items: center;
			overflow-wrap: anywhere;
			padding: 10px;
			border-radius: 5px;
			gap: 10px;
		}
		.dialog-radio-list li label:hover {
			background-color: var(--dialog-background-color);
		}
		.dialog-radio-list li label.disabled {
			opacity: 0.5;
			cursor: not-allowed;
			background-color: transparent;
		}
	`;

	/**
	 * 单选框列表
	 * @type {HTMLUListElement}
	 */
	#radioList = document.createElement('ul');

	/**
	 * 确认按钮
	 * @type {HTMLButtonElement}
	 */
	#confirmButton = document.createElement('button');

	/**
	 * 播放配置
	 * @type {any[]}
	 */
	#configs = [];

	constructor(configs, callback) {
		super();

		this.#configs = configs;

		this.#radioList.classList.add('dialog-radio-list');
		configs.forEach((playConfig, index) => {
			const radioListItem = document.createElement('li');
			const radioLabel = document.createElement('label');
			const radio = document.createElement('input');
			if (playConfig.removed) {
				radioLabel.classList.add('disabled');
			}

			radio.type = 'radio';
			radio.name = 'play';
			radio.value = index;
			radio.disabled = playConfig.removed;

			radioLabel.title = playConfig.removed ? '文件已损坏，请重新上传' : playConfig.name;
			radioLabel.appendChild(radio);
			radioLabel.appendChild(document.createTextNode(` ${playConfig.name}`));

			radioListItem.appendChild(radioLabel);

			this.#radioList.appendChild(radioListItem);
		});

		this.#confirmButton.textContent = '播放';
		this.#confirmButton.style.marginLeft = 'auto';
		this.#confirmButton.addEventListener('click', () => {
			const selectedConfig = this.#configs[this.#radioList.querySelector('input:checked')?.value];
			if (selectedConfig) {
				callback(selectedConfig);
			}
			this.close();
		});

		this.content = this.#radioList;
		this.footer = this.#confirmButton;

		this.closeOnClickOverlay = true;
		this.closeOnEsc = true;
	}
}
