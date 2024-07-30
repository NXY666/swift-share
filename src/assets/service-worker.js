console.log('Service Worker！');

const cacheName = 'pwa-cache-v1';
const cacheFileList = [
	'/',
	'/index.css',
	'/index.js',
	'/preload.js',
	'/favicon.ico'
];

const cache = {};
let cacheId = 0;

function addCache(cacheContent) {
	const id = cacheId++;
	cache[id] = cacheContent;
	setTimeout(() => {
		delete cache[id];
	}, 1000 * 60 * 5);
	return id;
}

function popCache(id) {
	const cacheContent = cache[id];
	delete cache[id];
	return cacheContent;
}

async function refreshCache() {
	const cacheNames = await caches.keys();
	for (const cacheName of cacheNames) {
		await caches.delete(cacheName);
	}

	// 更新缓存
	const cache = await caches.open(cacheName);
	await cache.addAll(cacheFileList);
}

// 安装 Service Worker 并缓存文件
self.addEventListener('install', event => {
	console.log('Service Worker 安装成功！');
	event.waitUntil(refreshCache());
});

// 激活 Service Worker 并清理过期缓存
self.addEventListener('activate', event => {
	console.log('Service Worker 激活成功！');
	const cacheWhitelist = [cacheName];
	event.waitUntil(caches.keys().then(cacheNames => Promise.all(cacheNames.map(cache => {
		if (cacheWhitelist.indexOf(cache) === -1) {
			return caches.delete(cache);
		}
	}))));
});

// 拦截网络请求并缓存动态的 JavaScript 文件
self.addEventListener('fetch', event => {
	const url = new URL(event.request.url);

	// 只处理本站的请求
	if (url.origin !== location.origin) {
		return;
	}

	if (
		event.request.method === 'POST' &&
		url.pathname === '/system-share'
	) {
		console.log("POST", event.request.url);
		event.respondWith((async () => {
			const formData = await event.request.formData();

			const files = formData.getAll('file');
			if (files.length !== 0) {
				// 跳转到/，并带上id参数
				return Response.redirect('/?share=' + encodeURIComponent(JSON.stringify(files.map((file) => {
					const id = addCache(file);
					return {
						id,
						name: file.name,
						size: file.size
					};
				}))), 303);
			}

			const text = formData.get('url') ?? formData.get('text') ?? formData.get('title');
			if (text) {
				const id = addCache(text);
				return Response.redirect('/?share=' + id, 303);
			}

			return new Response('参数错误。', {status: 400});
		})());
	} else if (event.request.method === 'GET' && url.pathname === '/system-share') {
		console.log("GET", event.request.url);
		event.respondWith((async () => {
			const cacheId = url.searchParams.get('id');
			if (cacheId in cache) {
				const content = popCache(cacheId);
				if (content instanceof File) {
					return new Response(content.stream(), {
						status: 200, headers: {'Content-Type': content.type}
					});
				} else if (typeof content === 'string') {
					return new Response(content, {
						status: 200, headers: {'Content-Type': "text/plain"}
					});
				}
			} else {
				return new Response('内容不存在。', {status: 404});
			}
		})());
	} else {
		console.log('fetch', event.request.url);
		// 使用缓存
		event.respondWith(fetch(event.request));
	}
});
