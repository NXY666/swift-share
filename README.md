# 快传<img align="right" alt="快传图标" src="https://github.com/NXY666/swift-share/assets/62371554/cda94cf6-9944-4706-8f5f-6199e6b5816e" title="快传" width="60"/>

### 简单、快捷、一目了然

[![npm](https://img.shields.io/npm/v/swift-share?style=flat-square)](https://www.npmjs.com/package/swift-share)
[![npm](https://img.shields.io/npm/dt/swift-share?style=flat-square)](https://www.npmjs.com/package/swift-share)
[![npm](https://img.shields.io/npm/unpacked-size/swift-share?style=flat-square)](https://www.npmjs.com/package/swift-share)
[![GitHub](https://img.shields.io/github/license/NXY666/swift-share?style=flat-square)](https://github.com/NXY666/swift-share/blob/master/LICENSE)

## 🔥 功能

<!--suppress HtmlDeprecatedAttribute -->
<details>
<summary>💬 <b>文本直传。</b>零散文本无需保存为文件，支持直接传递文本信息。</summary>
<p align="center">
  <img alt="网页截图（文本）" src="https://github.com/NXY666/swift-share/assets/62371554/2ee44445-9bd6-4811-abcd-4c44f8bbde8d" width="400"/>
</p>
</details>
<details>
<summary>🗒️ <b>文件传输。</b>提供单提取码多文件上传支持。智能上传，边传边下。</summary>
<p align="center">
  <img alt="网页截图（文件）" src="https://github.com/NXY666/swift-share/assets/62371554/be027f6f-95b6-44cb-81a6-12f3ccf5e991" width="400"/>
</p>
</details>
<details>
<summary>📨 <b>实时投送。</b>手机扫码连接设备，即使是电视也能稳定接收。</summary>
<p align="center">
  <img alt="网页截图（投送）" src="https://github.com/user-attachments/assets/0b1b34fa-c2a1-476e-a606-178ba5a13819" width="400"/>
</p>
</details>
<details>
<summary>🗃️ <b>PWA 应用。</b>贴近系统，文件互传还能更方便。</summary>
<p align="center">
  <img alt="PWA应用截图（系统分享）" src="https://github.com/user-attachments/assets/58c8b5ee-e1ab-452a-88fd-74401228269f" width="400"/>
</p>
<h4>附加功能：系统分享</h4>
<p>通过系统分享直接将文本或文件上传到快传，无需打开网页。</p>
<p>支持搭载 Android 和 Windows 系统的设备。</p>
</details>

## ✨ 亮点

### 🔀 边传边下

> 开始上传即可立即下载，传了多少就能下载多少。

* 可根据实际网络情况，在配置中自定义文件分片大小，优化传输体验。

### 🛜 快捷传输

#### 方法1：粘贴上传

> 使用粘贴快捷键一键上传剪贴板中的文本或图片。

* 受安全策略限制，非文本和图片类型的剪贴板内容无法上传。

#### 方法2：系统分享

> 将快传安装为 PWA 应用，通过系统分享上传文本和文件。

* 目前该方法支持搭载 Android 和 Windows 系统的设备。
* 安卓设备请使用 Chrome 浏览器，并确保 Google Play 商店在安装 PWA 应用时可用且网络环境支持访问谷歌服务。
* 华为（鸿蒙，NEXT除外）设备安装**原生** GMS 后亦可使用。
* Windows 设备建议使用 Edge 浏览器，Chrome 可能[尚未实现](https://issues.chromium.org/issues/40140070)该功能。
* 如果网站未使用 HTTPS 协议或设备未达到安装要求，则只会创建快捷方式，不支持系统分享。

#### 方法3：搜索栏提取

> 在浏览器的搜索栏中输入提取码，即可快速查找并下载文件。

<details>
<summary>教程</summary>
<p>不同浏览器的设置方法略有不同，以 Chrome 浏览器为例：</p>
<ol>
  <li>打开浏览器设置（<code>chrome://settings/searchEngines</code>），找到“搜索引擎”。</li>
  <p align="center"><img alt="搜索栏提取第1步截图" src="https://github.com/user-attachments/assets/d5fb509d-64aa-46d5-bb6b-f88a237ab51b" width="400"/></p>
  <li>在“未使用的快捷字词”中，找到“文件提取”条目，点击“启用”按钮。</li>
  <p align="center"><img alt="搜索栏提取第2步截图" src="https://github.com/user-attachments/assets/d80d1135-4d9a-4cee-a645-1783fd0ef87b" width="400"/></p>
  <li>在“网站搜索”中，找到刚刚启用的“文件提取”条目，设置一个合适的快捷字词。</li>
  <li>在浏览器地址栏中输入快捷字词，点击空格键或 Tab 键，然后根据提示输入提取码，按回车键即可提取文件。</li>
  <p align="center"><img alt="搜索栏提取第4步截图" src="https://github.com/user-attachments/assets/10a7aa4b-e7e3-42be-8388-408aa5bc2e2c" width="400"/></p>
</ol>
</details>

### ▶️ 在线播放

> 支持使用提取码直接在线播放媒体文件，无需下载。

* 支持读取视频文件中的软字幕。**注意，这会消耗您更多的流量。**
* 该功能支持边下边播。文件未上传完成前，媒体文件需支持流媒体才能正常播放。
* 非边下边播状态下，非流媒体文件也能正常播放。

### 💼 持久共享

> 支持设置一个常驻的共享目录，只需将文件放入该目录，即可通过快传传输。

* 如果共享目录所指向的路径不存在，则不会生成提取码。

### 🌠 夜间模式

> 当系统处于夜间模式时，快传也会自动切换到夜间模式。

### ⚙️ 灵活配置

> 支持自定义端口、提取码长度、过期时间等多项配置。

## 👀 使用方法

### 安装

```shell
npm install -g swift-share
```

### 启动

```shell
swift-share
```

### 停止

```
^C (Ctrl + C)
```

### 卸载

```shell
npm uninstall -g swift-share
```

### 反向代理

> 可使用 `Nginx` 等反向代理 Web 服务器将快传部署到子目录。

> 请根据下面的配置示例进行配置，错误的配置可能导致快传部分功能失效。

#### Nginx

在 `nginx.conf` 的 http 块中追加以下配置，使得 HTTP 协议可被升级为 WebSocket 协议。

```nginx
# /etc/nginx/nginx.conf

http {
    ...

    # WebSocket
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }
}
```

在 `sites-available` 目录下的配置文件中添加以下配置，将快传部署到 `/swift` 子路径。

* **必须**包含 `host` 标头。格式为 `example.com:3000` 。
* 当使用 HTTPS 协议时，**必须**包含 `X-Forwarded-Proto` 标头。格式为 `http` 或 `https` 。
* 当部署在子路径时，**必须**包含 `X-Forwarded-Path` 标头，格式为 `/example` 。
* 当部署在根目录时，`X-Forwarded-Path` 标头**必须**移除或置空。

```nginx
# /etc/nginx/sites-available/default

server {
    listen 80; # IPv4 端口
    listen [::]:80; # IPv6 端口

    # 使用 HTTP/2 协议（可选）
    # http2 on; 
    
    client_max_body_size 100M; # 提升上传文件大小限制
    
    location /swift {
        proxy_pass http://localhost:3000/; # 本地端口
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Path /swift; # 子目录
    }

    location /swift/ {
        proxy_pass http://localhost:3000/; # 本地端口
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Path /swift; # 子目录

        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "$connection_upgrade";
    }
}
```

### 配置

#### 编辑配置

```shell
swift-share config edit
```

#### 重置配置

```shell
swift-share config reset
```

#### 清除所有数据

> 在数据目录外的共享目录不会被清除。

```shell
swift-share clear
```

## ♾️ Biu~ 命令

> 快传没有独立的管理页面，仅支持简易的命令。

### 如何使用？

右键单击或手指长按（触发 `contextmenu` 事件）主页中的网站图标，即可打开伪装的命令窗口。

### 执行结果

* 如果命令匹配成功，则提示 `已收到您的反馈，但是我们不会处理。` ，否则提示 `已收到您的反馈，我们将尽快处理。` 。
* 命令的执行结果将以 `console.log` 的形式输出到日志。

### 命令列表

> 可在配置文件中自定义命令名称。设置为 `null` 时，表示禁用该命令。

| 命令             | 默认名称            | 说明      |
|----------------|-----------------|---------|
| `GetAllCode`   | `/getallcode`   | 获取所有提取码 |
| `ClearAllCode` | `/clearallcode` | 清除所有提取码 |
| `OpenConsole`  | `/openconsole`  | 启用虚拟控制台 |

## ⚠️ 注意事项

* 快传未设计任何保护机制，**不建议**在公网环境下部署使用。
* 关闭快传后，已上传的文件将**自动删除**，共享文件夹中的文件不受影响。
* 如果发生异常退出，在下次启动时会自动清理未删除的文件。
