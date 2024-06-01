# 快传<img align="right" alt="快传图标" src="https://github.com/NXY666/swift-share/assets/62371554/cda94cf6-9944-4706-8f5f-6199e6b5816e" title="快传" width="60"/>

### 简单、快捷、一目了然

[![npm](https://img.shields.io/npm/v/swift-share?style=flat-square)](https://www.npmjs.com/package/swift-share)
[![npm](https://img.shields.io/npm/dt/swift-share?style=flat-square)](https://www.npmjs.com/package/swift-share)
[![GitHub](https://img.shields.io/github/license/NXY666/swift-share?style=flat-square)](https://github.com/NXY666/swift-share/blob/master/LICENSE)
![GitHub](https://img.shields.io/github/repo-size/NXY666/swift-share?style=flat-square)

<details>
<summary>网页截图</summary>
<p align="center">
  <img alt="网页截图（浅色）" src="https://github.com/NXY666/swift-share/assets/62371554/bfdf5f9e-e758-4543-82c8-b5abb8a21829" width="400"/>
  <img alt="网页截图（深色）" src="https://github.com/NXY666/swift-share/assets/62371554/e40f7b7c-1de5-44f5-9556-da140ebde1ea" width="400"/>
</p>
</details>

## 功能特性

### 传递文本

> 零散文本无需保存为文件，可直接传递。

### 传输文件

> 支持多文件传输，下载前可指定需要下载的文件。

* 大文件使用多线程分片上传，小文件直接上传。
* 文件过期后不会立刻清除，因为可能存在未过期的链接。

### 持久共享

> 支持设置一个常驻的共享目录，只需将文件放入该目录，即可通过快传传输。

* 如果共享目录所指向的路径不存在，则不会生成提取码。

### 边传边下

> 上传未完成也能立即下载，传了多少就能下载多少。

### 在线播放

> 支持使用提取码在线播放视频和音频，无需下载。

* 该功能支持边下边播。文件未上传完成前，媒体文件需支持流媒体才能正常播放。
* 非边下边播状态下，非流媒体文件也能正常播放。

### 深色模式

> 当系统处于深色模式时，快传也会自动切换到深色模式。

### 自定义配置

> 支持自定义端口、提取码长度、过期时间等多项配置。

## 使用方法

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

### 配置

#### 编辑

```shell
swift-share --edit-config
```

#### 重置

```shell
swift-share --reset-config
```

## Biu~ 命令

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

## 注意事项

* 快传未设计任何保护机制，**不建议**在公网环境下部署使用。
* 关闭快传后，已上传的文件将**自动删除**，共享文件夹中的文件不受影响。
* 如果发生异常退出，在下次启动时会自动清理未删除的文件。
