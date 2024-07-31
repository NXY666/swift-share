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
  <img alt="网页截图（投送）" src="https://github.com/NXY666/swift-share/assets/62371554/a4f319c2-6f37-453b-86f8-0b2adcf611d6" width="400"/>
</p>
</details>

## ✨ 亮点

### 🔀 边传边下

> 开始上传即可立即下载，传了多少就能下载多少。

* 可根据实际网络情况，在配置中自定义文件分片大小，优化传输体验。

### 👾 系统级直传

> 安装快传为 PWA 应用，通过系统级“分享”功能，可直接上传文本和文件。

* 需安装至少 126 版本的 Chrome 浏览器。
* 需安装 Google Play 商店，华为鸿蒙安装原生 GMS 后亦可使用。
* 需网络环境允许访问谷歌服务。

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

> 可使用 `Nginx` 等反向代理工具将快传部署到子目录。

> 以下是一个简单的 `Nginx` 配置示例。

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

```nginx
# /etc/nginx/sites-available/default

server {
    listen 80; # IPv4 端口
    listen [::]:80; # IPv6 端口
    
    client_max_body_size 100M; # 提升上传文件大小限制
    
    location /swift {
        proxy_pass http://localhost:3000/; # 本地端口
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /swift/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "$connection_upgrade";
    }
}
```

### 配置

#### 编辑

```shell
swift-share --edit-config
```

#### 重置

```shell
swift-share --reset-config
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
