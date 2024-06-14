import crypto from "crypto";

class URL2 extends URL {
	static #base = new URL('http://localhost/');

	#match: RegExpMatchArray;

	constructor(url: string) {
		super(url, URL2.#base);

		this.#match = url.match(/^(?<protocol>[^:/]+:)?(?<host>\/\/[^/]+)?/);
	}

	get protocol() {
		return super.protocol;
	}

	set protocol(value) {
		// 置空或值有效时做变动
		if (!value || (super.protocol = value) === super.protocol) {
			this.#match.groups.protocol = value;
		}
	}

	get host() {
		return super.host;
	}

	set host(value) {
		// 置空且协议也置空或值有效时做变动
		if ((!value && !this.#match.groups.protocol) || (super.host = value) === super.host) {
			this.#match.groups.host = value;
		}
	}

	get shortHref() {
		let href = this.href;
		if (!this.#match.groups.protocol) {
			href = href.replace(this.protocol, '');
		}
		if (!this.#match.groups.host) {
			href = href.replace(`//${this.host}`, '');
		}
		return href;
	}
}

export class Url {
	static #secret = crypto.randomUUID();

	static sign(url: CommonURL, expireInterval: number) {
		const expireTime = Date.now() + expireInterval;

		// 创建一个 URL2 对象
		const url2 = new URL2(url.toString());

		// 所有参数key按字母排序，然后和值一起拼接起来
		const urlParams = new URLSearchParams(url2.searchParams);
		const urlParamsStr = Array.from(urlParams.keys()).sort().map(key => `${key}=${urlParams.get(key)}`).join(';');

		// 把路径和查询参数（按字母排序）拼接起来
		const toSign = `${url2.pathname}-${urlParamsStr}-${expireTime}-${this.#secret}`;

		// 把签名和过期时间加到查询参数里
		urlParams.set('url-expr', expireTime.toString());
		urlParams.set('url-sign', this.#digest(toSign));

		url2.search = urlParams.toString();
		return url2.shortHref;
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
	static mergeUrl({protocol, host, pathname}: { protocol?: string, host?: string, pathname?: string }): URL2 {
		const url = new URL2("");
		url.protocol = protocol ?? "";
		url.host = host ?? "";
		url.pathname = pathname ?? "";
		return url;
	}

	static #digest(text: string) {
		// 创建一个哈希对象
		const hash = crypto.createHash('sha256');

		// 更新哈希对象的内容
		hash.update(text, 'utf8');

		// 计算哈希值并以十六进制字符串的形式返回
		return hash.digest('hex');
	}
}

export const Api = {
	API: "/api",

	BIU: "/biu",

	UPLOAD_TEXT: "/upload/text",
	EXTRACT_TEXT: "/extract/text/:code",

	UPLOAD_FILES_APPLY: "/upload/files/apply",
	UPLOAD_FILES: "/upload/files",
	UPLOAD_FILES_CHECKPOINT: "/upload/files/checkpoint",

	EXTRACT_FILES: "/extract/files/:code",

	FETCH: "/fetch",

	DROP_RECV_APPLY: "/drop/recv/apply",
	DROP_SEND_APPLY: "/drop/send/apply",

	WS_DROP_RECV: "/ws/recv",
	WS_DROP_SEND: "/ws/send",
};
