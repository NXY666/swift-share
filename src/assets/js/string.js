export function parseBytes(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	} else if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(2)} KB`;
	} else if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	} else if (bytes < 1024 * 1024 * 1024 * 1024) {
		return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
	} else {
		return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
	}
}

export function parseExtractCode(code) {
	if (!code) {
		return '';
	}
	return code.replace(/[.\\\/?#%\s]/g, '');
}

export async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		const textArea = document.createElement("textarea");

		textArea.style.position = 'fixed';
		textArea.style.top = "0";
		textArea.style.left = "0";

		textArea.style.opacity = "0";

		textArea.value = text;

		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		try {
			// noinspection JSDeprecatedSymbols
			document.execCommand('copy');
		} catch {
		} finally {
			document.body.removeChild(textArea);
		}
	}
}