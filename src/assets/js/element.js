export function defineKeyboardClickEvent(element) {
	if (!element.__keyboardClickEvent) {
		element.__keyboardClickEvent = function (event) {
			if (event.code === 'Space' || event.code === 'Enter') {
				event.preventDefault();
				if (element.click) {
					element.click();
				} else {
					element.dispatchEvent(new MouseEvent('click'));
				}
			}
		};
		element.addEventListener('keydown', element.__keyboardClickEvent, {capture: true});
	}
}
