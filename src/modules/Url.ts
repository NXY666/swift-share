import crypto from "crypto";

export class Url {
	static #secret = crypto.randomUUID();

	static #digest(text: string) {
		// 创建一个哈希对象
		const hash = crypto.createHash('sha256');

		// 更新哈希对象的内容
		hash.update(text, 'utf8');

		// 计算哈希值并以十六进制字符串的形式返回
		return hash.digest('hex');
	}

	static sign(url: CommonURL, expireInterval: number) {
		const expireTime = Date.now() + expireInterval;

		const urlObj = new URL(url);

		// 所有参数key按字母排序，然后和值一起拼接起来
		const urlParams = new URLSearchParams(urlObj.searchParams);
		const urlParamsStr = Array.from(urlParams.keys()).sort().map(key => `${key}=${urlParams.get(key)}`).join(';');

		// 把路径和查询参数（按字母排序）拼接起来
		const toSign = `${urlObj.pathname}-${urlParamsStr}-${expireTime}-${this.#secret}`;

		// 把签名和过期时间加到查询参数里
		urlParams.set('url-expr', expireTime.toString());
		urlParams.set('url-sign', this.#digest(toSign));

		urlObj.search = urlParams.toString();
		return urlObj.toString();
	}

	static check(url: CommonURL) {
		const urlObj = new URL(url);

		const expireTime = urlObj.searchParams.get('url-expr');
		const signature = urlObj.searchParams.get('url-sign');

		if (expireTime === null || signature === null || Date.now() > parseInt(expireTime)) {
			return false;
		}

		const urlParams = new URLSearchParams(urlObj.searchParams);
		urlParams.delete('url-expr');
		urlParams.delete('url-sign');
		const urlParamsStr = Array.from(urlParams.keys()).sort().map(key => `${key}=${urlParams.get(key)}`).join(';');

		const toSign = `${urlObj.pathname}-${urlParamsStr}-${expireTime}-${this.#secret}`;
		return this.#digest(toSign) === signature;
	}

	/**
	 * 合并 URL
	 * @param [protocol] 协议
	 * @param [host] 主机
	 * @param [pathname] 路径
	 * @return
	 */
	static mergeUrl({protocol, host, pathname}: { protocol?: string, host?: string, pathname?: string }): URL {
		const url = new URL("http://localhost/");
		url.protocol = protocol ?? "";
		url.host = host ?? "";
		url.pathname = pathname ?? "";
		return url;
	}

	/**
	 * 补全 URL
	 * @param url
	 * @return
	 */
	static completeUrl(url: string): URL {
		return new URL(url, "http://localhost/");
	}
}

export const Api = {
	API: "/api",

	BIU: "/biu",

	EXTRACT_CODE_LENGTH: "/extract/code/length",

	UPLOAD_TEXT_CAPACITY: "/upload/text/capacity",

	UPLOAD_FILES_CAPACITY: "/upload/files/capacity",

	UPLOAD_TEXT_NEW: "/upload/text/new",
	EXTRACT_TEXT_NEW: "/extract/text/new/:code",

	UPLOAD_FILES_APPLY: "/upload/files/apply",
	UPLOAD_FILES_NEW: "/upload/files/new",
	UPLOAD_FILES_CHECKPOINT: "/upload/files/checkpoint",

	EXTRACT_FILES_NEW: "/extract/files/new/:code",

	/**
	 * @deprecated
	 */
	DOWN_NEW: "/down",
	/**
	 * @deprecated
	 */
	PLAY_NEW: "/play",
	FETCH: "/fetch",

	/**
	 * @deprecated
	 */
	WS_UPLOAD: "/upload",
	/**
	 * @deprecated
	 */
	WS_DOWN: "/down",
};