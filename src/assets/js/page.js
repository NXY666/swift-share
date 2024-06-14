document.pages = {};

function onDOMReady(callback) {
	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		callback();
	} else {
		document.addEventListener('DOMContentLoaded', callback);
	}
}

class HTMLPageBarElement extends HTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});

		const style = document.createElement('style');
		style.textContent = `
						:host {
							line-height: 1;
							position: relative;
							display: flex;
							justify-content: center;
							width: fit-content;
							padding: 5px;
							user-select: none;
							border-radius: 100px;
							background-color: var(--background-color-1);
							gap: 5px;
							box-shadow: 0 0px 5px 0px var(--primary-color-3);
						}

						.slider {
							position: absolute;
							top: 5px;
							height: 2em;
							transition: all var(--base-transition-duration) ease;
							border-radius: 100px;
							background-color: var(--primary-color-2);
						}
					`;

		this.slider = document.createElement('div');
		this.slider.classList.add('slider');

		const slot = document.createElement('slot');

		shadow.appendChild(style);
		shadow.appendChild(this.slider);
		shadow.appendChild(slot);
	}

	connectedCallback() {
		this.shadowRoot.querySelector('slot').addEventListener('slotchange', () => {
			this.onSlotChange();
		});
	}

	onSlotChange() {
		const items = this.querySelectorAll('page-item');
		items.forEach((item, index) => this.initItem(item, index));
		onDOMReady(() => this.updateSlider());
	}

	onPageChange(index) {
		// location的page参数变化
		const url = new URL(location);
		url.searchParams.set('page', index);
		history.pushState(null, '', url);

		// 更新活动项
		this.updateSlider(index);
	}

	initItem(item, index) {
		// 移除活动项
		item.classList.remove('active');

		// 重新设置点击事件
		if (item.clickListener) {
			item.removeEventListener('click', item.clickListener);
		}
		item.addEventListener('click', item.clickListener = () => this.onPageChange(index));

		// 移除设置活动项的延时
		if (item.toActiveTimeout) {
			clearTimeout(item.toActiveTimeout);
			delete item.toActiveTimeout;
		}
	}

	updateSlider(index = new URL(location).searchParams.get('page') || 0) {
		const items = this.querySelectorAll('page-item');

		const item = items[index];

		if (item?.classList.contains('active')) {
			return;
		}

		const activeItem = Array.from(items).filter((item) => item.classList.contains('active'))[0];
		if (activeItem) {
			activeItem.classList.remove('active');
			clearTimeout(activeItem.toActiveTimeout);

			const activePageId = activeItem.getAttribute('for');

			document.pages[activePageId].style.display = 'none';
		}

		if (item) {
			const itemRect = item.getBoundingClientRect();
			const barRect = this.getBoundingClientRect();
			const left = itemRect.left - barRect.left;
			const width = itemRect.width;

			this.slider.style.left = `${left}px`;
			this.slider.style.width = `${width}px`;

			item.toActiveTimeout = setTimeout(() => {
				item.classList.add('active');
				delete item.toActiveTimeout;
			}, activeItem ? 100 : 0);

			const itemPageId = item.getAttribute('for');

			document.pages[itemPageId].style.display = 'block';
		}
	}
}

customElements.define('page-bar', HTMLPageBarElement);

class HTMLPageItemElement extends HTMLElement {
	connectedCallback() {
		this.tabIndex = 0;
	}

	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});

		const style = document.createElement('style');
		style.textContent = `
						:host {
							display: flex;
							align-items: center;
							justify-content: center;
							width: 5em;
							height: 2em;
							border-radius: 100px;
							cursor: pointer;
						}

						:host(:hover) {
							background-color: var(--form-background-hover-color);
						}

						:host(:active) {
							background-color: var(--form-background-active-color);
						}

						:host(.active) {
							color: var(--background-color-1);
							background-color: unset;
						}

						:host > slot {
							display: block;
							position: relative;
							pointer-events: none;
						}
					`;

		const innerText = document.createElement('slot');

		shadow.appendChild(style);
		shadow.appendChild(innerText);
	}
}

customElements.define('page-item', HTMLPageItemElement);

class HTMLPageContentElement extends HTMLElement {
	constructor() {
		super();
	}

	connectedCallback() {
		this.style.display = 'none';

		const idValue = this.id;

		document.pages[idValue] = this;
	}
}

customElements.define('page-content', HTMLPageContentElement);
