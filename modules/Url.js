import crypto from "crypto";

export class Url {
	static #secretKey = crypto.randomBytes(32);

	static #iv = crypto.randomBytes(16);

	static #digest(text) {
		// 创建一个哈希对象
		const hash = crypto.createHash('sha256');

		// 更新哈希对象的内容
		hash.update(text, 'utf8');

		// 计算哈希值并以十六进制字符串的形式返回
		return hash.digest('hex');
	}

	static sign(url, expireInterval) {
		const expireTime = Date.now() + expireInterval;

		const urlObj = new URL(url);

		// 所有参数key按字母排序，然后和值一起拼接起来
		const urlParams = new URLSearchParams(urlObj.searchParams);
		const urlParamsStr = Array.from(urlParams.keys()).sort().map(key => `${key}=${urlParams.get(key)}`).join(';');

		// 把路径和查询参数（按字母排序）拼接起来
		const toSign = `${urlObj.pathname}-${urlParamsStr}-${expireTime}`;

		// 把签名和过期时间加到查询参数里
		urlParams.set('url-expr', expireTime.toString());
		urlParams.set('url-sign', this.#digest(toSign));

		urlObj.search = urlParams.toString();
		return urlObj.toString();
	}

	static check(url) {
		const urlObj = new URL(url);

		const expireTime = urlObj.searchParams.get('url-expr');
		const signature = urlObj.searchParams.get('url-sign');

		if (expireTime === null || signature === null || Date.now() > parseInt(expireTime, 10)) {
			return false;
		}

		const urlParams = new URLSearchParams(urlObj.searchParams);
		urlParams.delete('url-expr');
		urlParams.delete('url-sign');
		const urlParamsStr = Array.from(urlParams.keys()).sort().map(key => `${key}=${urlParams.get(key)}`).join(';');

		const toSign = `${urlObj.pathname}-${urlParamsStr}-${expireTime}`;
		return this.#digest(toSign) === signature;
	}

	static unSign(url) {
		const urlObj = new URL(url);
		const params = new URLSearchParams(urlObj.searchParams);
		params.delete('url-expr');
		params.delete('url-sign');
		urlObj.search = params.toString();
		return urlObj.toString();
	}
}
