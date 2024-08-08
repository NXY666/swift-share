const base = window.basePath;

export function completeUrl(url) {
	return new URL(base + url.replace(/^([^/])/, "/$1"), location).href;
}

export function completeWsUrl(url) {
	return completeUrl(url).replace(/^http/, 'ws');
}
