# 多媒体应用开发
`EdgerOS` 提供了以下多媒体处理模块：
+ `MediaDecoder`:  多媒体解码模块，参考 API 手册：【MediaDecoder： Multi Media decoder】
+ `VideoOverlay`： 视频预览模块, 参考 API 手册：【VideoOverlay: Video overlay】
+ `WebMedia`： 流媒体服务器框架, 参考 API 手册：【WebMedia: Web Media server】

本章以流媒体摄像头监控应用为示例，介绍 `EdgerOS` 多媒体应用开发。

接下来先介绍一个流媒体应用一般实现方法，然后借助一些已有的组件构建一个较为完整的摄像头监控应用。

## 构建基础流媒体应用
本节介绍一个基本 `WebMedia` 框架的流媒体服务的一般实现方法，演示程序来源于 API 手册 【WebMedia: Web Media server】 文档的 `WS-FLV`  演示程序。

### 后端实现

+ 将演示程序的 `app` 创建方式修改为 EAP 创建方式即可用于构建一个 EAP 程序：
```javascript
var app = WebApp.createApp();
app.use(WebApp.static('./public'));
```

+ 创建流媒体服务器：
```javascript
var WebMedia = require('webmedia');
// ...
var wsSer = WsServer.createServer('/live.flv', app);

var opts = {
	mode: 1,
	path: '/live.flv',
	mediaSource: {
		source: 'flv',
	},
	streamChannel: {
		protocol: 'ws',
		server: wsSer
	},
}
var server = WebMedia.createServer(opts, app);
```
通过以上配置创建了一个单通道的基于`ws-flv`协议的流媒体服务器。配置说明：
1. `mode`: 1 - 表示服务是 `streamChannel` 单通道模式,只传输媒体流。
1. `path`:  前端  'ws-flv'  插入器获取流媒体地址路径。
1. `mediaSource.source`: `flv` 是 `JSRE` 内置的 `MediaSource`，解析 `flv` 流分发给客户端。
1. `streamChannel`: 前端接入方式，`ws` 表示使用 `WebSocket` 进行流传输，此例中挂接了一个外部创建的 `WebSocket` 服务器 `wsSer`；传输方式有多种配置方式，详情可以参考 `WebMedia` API 文档。

+ 摄像设备一般使用  `rtsp` 流媒体协议，`rtsp` 并不适合在 web 环境传输，因此我们需要引用 `MediaDecoder` 模块，用于获取 `rtsp` 流媒体，并转换为 `flv` 封包数据。
```javascript
var MediaDecoder = require('mediadecoder');
server.on('start', () => {
	var netcam = new MediaDecoder().open('rtsp://admin:admin@192.168.128.100', {proto: 'tcp'}, 10000);
	netcam.destVideoFormat({width: 640, height: 360, fps: 1, pixelFormat: MediaDecoder.PIX_FMT_RGB24, noDrop: false, disable: false});
	netcam.destAudioFormat({disable: false});
	netcam.remuxFormat({enable: true, enableAudio: true, format: 'flv'});
	// ...
}
```
创建 `MediaDecoder` 对象时需要提供 `rtsp` 地址，因此这个简单的示例只能用于已知摄像头流通道地址的情况。
接下来的代码进行了一些初始化配置，其中 `netcam.remuxFormat()` 参数选项 `format: 'flv'` 表示将原始流转换为 `flv` 流进行输出 。

+ 获取媒体流：
```javascript
server.on('start', () => {
	// ...
	netcam.on('remux', (frame) => {
		var buf = Buffer.from(frame.arrayBuffer);
		server.pushStream(buf);
	});
	netcam.on('header', (frame) => {
		var buf = Buffer.from(frame.arrayBuffer);
		server.pushStream(buf);
	});
	netcam.start();
});
```
接下来监听 `netcam` 两个事件 `remux` 与 `header` 获得帧数据。
通过 `server.pushStream()` 将数据推入 `WebMedia` 内部的 `MediaSource` 进行进一步分析，然后有效地分发给连接到 `WebMedia` 服务器的客户端。
以上便实现了一个简单的流媒体服务器。

### 前端实现
+ 前端实现 (index.html) :
```html
<script src="./flv.min.js"></script>
<video id="videoElement"></video>
<script>
	if (flvjs.isSupported()) {
		var videoElement = document.getElementById('videoElement');
		var flvPlayer = flvjs.createPlayer({
			enableStashBuffer: false,
			type: 'flv',
			isLive: true,
			url: `ws://${document.domain}:${window.location.port}/live.flv`,
		});
		flvPlayer.attachMediaElement(videoElement);
		flvPlayer.load();
		flvPlayer.play();
	}
</script>
```
本例中仅使用了流媒体单通道，前端仅需要一个支持 `ws-flv` 的播放器即可。
以上代码引入的 './flv.min.js' 模块来自 CDN: ’https://cdn.bootcss.com/flv.js/1.5.0/flv.min.js‘, 引用了一个开源的支持 `http-flv/ws-flv` 播放器(`flv.js`)。

以上便实现了一个基本的流媒体应用，这个应用有许多局限性，接下来将分析存在的一些问题及扩展方案。

### 应用分析
+ 以上示例有以下一些局限：
	+ 该示例只能连接到已知地址的流媒体设备，我们无法发现并获取连接到 `EdgerOS` 的摄像头设备。
	+ 该示例只能连接一个 `rtsp` 流。
	+ 本示例仅实现单通道模式。`WebMedia` 支持双通道模式，在数据通道上可以传输附加在流媒体上的数据，从而支持字幕、AI 识别数据等功能，还可以支持用户自定义消息。
	+ 本示例使用了 `WebMedia` 内置的 `MediaSource` - `flv`，它仅提供基础的流解析与分发功能，当我们需要对流进行更多额外处理时，我们需要定制新的 `MediaSource`。

+ 本节后续内容将继续介绍一个较为完成的流媒体摄像头应用 DEMO, 该应用中将引入一些外部模块和新的技术来实现更为实用的功能：
	+ 应用 `onvif`模块搜索发现设备；
	+ 应用 ` jsre-medias` 模块管理一组流媒体服务，可同时监控多路摄像头；
	+ 定制实现一个 `MediaSource` 组件，管理流的获取与解析；
	+ 前端应用 `web-mediaclient` 模块连接双通道流媒体服务；
	+ 使用一个性能更出色的播放器。

## 工程介绍

+ `eap-demo-camera-base` DEMO 实现摄像头监控功能，界面展示如下：

![ui](./res/camera1/ui.png)

+ `eap-demo-camera-base` 工程获取地址：【https://gitee.com/edgeros/eap-demo-camera-base.git】或 【https://github.com/edgeros/eap-demo-camera-base.git】，目录结构如下：

```
eap-demo-camera-base
|-- camera1: EAP 项目
|-- web：前端项目
|-- README.md
```

### 前端构建说明
前端项目使用 `VUE` 构建。

+ 构建方式：
	+ 执行 `npm install` 安装项目所有依赖；
	+ 运行 `npm run build` 构建项目；
	+ 构建完后会生成一个`dist` 文件夹，里面就是构建后的代码。

+ 依赖说明：
	+ `@edgeros/web-sdk`: 爱智提供与`edgeros`交互的前端`api`接口,在此项目中用于获取用户`token` 等信息。
	+ `@edgeros/web-mediaclient`: `WebMedia` 客户端 API 模块，用于连接流媒体服务器并与服务器进行数据交互。
	+ `NodePlayer.js` 播放器，【[开发文档]( https://www.nodemedia.cn/doc/web/#/1?page_id=1)】。

### EAP 构建说明
+ 构建方式：
    + 执行 `npm install` 安装项目所有依赖。
    + 将前端工程构建生成`dist`文件夹的文件 `copy` 到 `camera1/public` 文件夹下。
    + 使用`vscode edgeros` 插件将项目部署到 `edgeros`。

+ 依赖说明：
	+ `@edgeros/jsre-onvif`:  `onvif` 协议模块，发现设备，获取摄像头设备 `rtsp` 地址。
	+ `@edgeros/jsre-medias`: `WebMedia` 服务封装模块，支持管理一组流媒体服务。

## 环境配置

- 设备: 
	- 支持 `onvif` 与 `rtsp` 协议访问的网络摄像头，带云台功能优先。
	- `Spirit 1` ：【 [淘宝 THINGS翼辉官方店]( https://shop328678746.taobao.com/?spm=a1z10.1-c-s.0.0.6d16d0a1lA0llo)】
	
- 设备连接： 
	
	- 网络摄像头按产品说明接入`Spirit 1`， 注意 `onvif` 功能是否开启，确认账号密码。

**注意**：购买网络摄像头时需确定清楚摄像头是否支持 `onvif` 与 `rtsp` 协议。我们推荐部分符合要求的网络摄像头产品供参考：

| 链接 | 描述 |
| ---- | ---- |
| 【[网络摄像头](https://item.jd.com/10028525413495.html#crumb-wrap)】 | 枪形，不带云台 |
| 【[网络摄像头](https://detail.tmall.com/item.htm?spm=a230r.1.14.16.3c977beaxGTbkM&id=562800926890&ns=1&abbucket=12&skuId=4241824877180)】 | 枪形，不带云台 |
| 【[网络摄像头](https://item.jd.com/10021377024574.html#crumb-wrap)】 | 桌面，带云台 |
| 【[网络摄像头](https://item.taobao.com/item.htm?spm=a230r.1.14.94.3c977beaxGTbkM&id=599409657557&ns=1&abbucket=12#detail)】 | 桌面，带云台 |
| 【[网络摄像头](https://item.jd.com/100006551120.html#crumb-wrap)】 | 球形倒挂，带云台 |
| 【[网络摄像头](https://item.taobao.com/item.htm?spm=a230r.1.14.85.3c977beaxGTbkM&id=619210290310&ns=1&abbucket=12#detail)】 | 方形，不带云台 |

## 示例分析

### 定制 `MediaSoruce`

我们首先自定义实现一个 `MediaSource`，`MediaSoruce` 接口参考 API 手册 【WebMedia】。新实现的 `CameraSource` 位于 【eap-demo-camera-base/camera1/camera_src.js】 文件中。

+ `CameraSource` 直接继承至 `JSRE` 内置的 `FlvSrc` 类（i注册名称; `flv`，在 `FlvSrc` 基础上已经具备基础的流解析与分发功能了。
```javascript
var FlvSrc = require('webmedia/source/flv');
class CameraSource extends FlvSrc {
	constructor(ser, mode, inOpts, outOpts) {
		super(ser, mode, inOpts, outOpts);
		// ...
	}
	// ...
}
```

+ 重写 `start()` 接口，将  `MediaDecoder` 对象封装到 `CameraSource` 中，从而使 `CameraSource` 类能够完整地接收和处理 `rtsp` 流。
```javascript
var MediaDecoder = require('mediadecoder');
// ...
start() {
	var netcam = new MediaDecoder();
	this._netcam = netcam;
	var self = this;
	var input = this.inOpts;
	var url = `rtsp://${input.user}:${input.pass}@${input.host}:${input.port}${input.path}`;
	var name = `${input.host}:${input.port}${input.path}`;
	new Promise((resolve, reject) => {
		netcam.open(url, { proto: 'tcp', name: name }, 10000, (err) => {
		// ...
			netcam.on('remux', self.onStream.bind(self));
			netcam.on('header', self.onStream.bind(self));
			netcam.on('eof', self.onEnd.bind(self));
		}
	}
}
```
`rtsp` 流地址根据 `CameraSource` 创建时传入参数 `inOpts` 生成。

+ `netcam` 对象将转换后的流交由 `onStream()` 方法处理， 由于 `FlvSrc` 实现了 `pushStream()` 接口，我们直接将流推送给 `FlvSrc` 处理即可：
```javascript
onStream(frame) {
	if (!this._netcam) {
		return;
	}
	var buf = Buffer.from(frame.arrayBuffer);
	try {
		this.pushStream(buf);
	} catch (e) {
		console.error(e);
		this.stop();
	}
}
```
至此，`CameraSource` 实现了完整的获取、转换、分发流功能。

### 创建流媒体服务器

+ 在使用流媒体服务之前， 先在 `WebMedia` 框架中进行注册 `CameraSource`，  (main.js):
```javascript
var WebMedia = require('webmedia');
var CameraSource = require('./camera_src');

const sourceName = 'camera-flv';
WebMedia.registerSource(sourceName, CameraSource);
```
注册完成后，就可以使用名称为 `camera-flv` 的 `MediaSource` 了。

+ 本示例中我们引用 `@edgeros/jsre-medias` 模块创建流媒体服务器：
```javascript
const {Manager} = require('@edgeros/jsre-medias');
```
`@edgeros/jsre-medias` 由 `Media` 和  `Manager` 两部分构成:

1. `Manager` 集成了 `onvif` 模块，可以自动发现、记录设备，创建和管理摄像头对象，创建和管理 `Media` 对象。
1. `Media` 是对 `WebMedia` 服务器的封装， `Manager` 服务可以同时接入多路流媒体。

关于 `@edgeros/jsre-medias` 详细信息请参考模块文档。

+ 使用 `Manager` 创建流媒体服务器：
```javascript
var server = undefined;
// ...
function createMediaSer() {
	console.log('Create media server.');
	if (server) {
		return server;
	}
	
	var opts = {
		mediaTimeout: 1800000,
		searchCycle: 20000,
		autoGetCamera: false
	};
	server = new Manager(app, null, opts, (opts) => {
		return {
			source: sourceName,
			inOpts: opts,
			outOpts: null
		}
	});
	// ...
}
```
`Manager` 创建的流媒体服务器是双通道模式，流媒体通道与数据通道都是基于 `WebSocket` 协议，`Manager` 内部自动创建 `WebSocket` 服务器，并动态生成流媒体通道访问路径。后面将会介绍前端如何接入流媒体服务器。

创建服务器时需关注一些选项：
1. `mediaTimeout`: 每路流媒体服务的超时时长，当没有任何客户端访问服务， 超时后服务将会关闭并回收资源，避免长时间占用系统资源 。
1. `searchCycle`:  搜索设备周期。
1. `autoGetCamera`: 默认情下 `Manager` 搜索到一个设备后会尝试将设备升级为摄像头对象并获取其流地址，如果失败了将摄像头对象降级为普通设备对象。本例中我们禁用此功能，后续我们将展示用 `onvif` 模块创建摄像头对像。 

创建 `Manager` 时需传入一个回调函数，这个回调函数返回一个对象，这个对象将作为创建 `WebMedia` 流媒体服务器的参数。其中我们可以看到它指定了之前创建的 `CameraSource`，并且动态地传入了 `inOpts`，`inOpts` 中包含搜索到的设备返回的 `rtsp` 流地址参数。


### 获取设备列表
前端通过 `REST` 接口请求设备列表：
```javascript
app.get('/api/list', (req, res) => {
	// ...
	var devs = {};
	server.iterDev((key, dev) => {
		devs[key] = {
			devId: key,
			alias: `${dev.hostname}:${dev.port}${dev.path}`,
			report: dev.urn,
			path: '',
			status: false
		}
	});
	server.iterMedia((key, media) => {
		devs[key] = {
			devId: media.key,
			alias: media.alias,
			report: media.sid,
			path: '/' + media.sid,
			status: true
		}
	});

	var infos = [];
	for (var key in devs) {
		infos.push(devs[key]);
	}
	res.send(JSON.stringify(infos));
});
```

获取的列表包含两类对象：
1. `server.iterDev` 获取的是搜索到的设备对象；
2. `server.iterMedia` 获取的是已识为 `rtsp` 摄像头设备并创建的流媒体服务器对象，该对象中已经包含`path` 信息，前端根据此路径便可连接到流媒体服务器。

### 连接设备
+ 前端获取到设备列表后，对于普通设备（`server.iterDev` 获取设备）需提供账号密码尝试连接设备，创建流媒体服务：
```javascript
app.post('/api/login', (req, res) => {
	// ...
	var ret = {result: false, msg: 'error'};
	var data = [];
	req.on('data', (buf) => {
		data.push(buf);
	});

	req.on('end', () => {
		try {
			data = Buffer.concat(data);
			var info = JSON.parse(data.toString());
			console.log('login data:', info);

			connectMedia(info, (media) => {
				if (!media || media instanceof Error) {
					ret.msg = `Device ${info.devId} login fail.`;
					console.warn(media ? media.message : ret.msg);
				} else {
					ret.result = true;
					ret.msg = 'ok';
					ret.path = '/' + media.sid;
				}
				res.send(JSON.stringify(ret));
			});
			// ...
		} 
	});
});
```

`info` 包含前端传入的设备ID 与账号密码。

`connectMedia()`  是创建创建流媒体服务过程，回调返回 `media` 对象，这个过程可能会失败，失败原因可能是账号密码不正确，也可能是该设备不是 `rtsp` 设备。

+ 识别摄像头设备：
```javascript
var onvif = require('@edgeros/jsre-onvif');
// ...
function connectMedia(info, cb) {
	var devId = info.devId;
	var dev = server.findDev(devId);
	// ...
	var cam = undefined;
	new Promise((resolve, reject) => {
		dev.username = info.username;
		dev.password = info.password;
		cam = new onvif.Cam(dev);
		cam.on('connect', (err) => {
			if (err) {
				console.warn(`Camera(${cam.urn}) connection fail:`, err);
				return reject(err);
			}
			cam.getStreamUri({protocol:'RTSP'}, (err, stream) => {
				if (err) {
					console.warn(`Camera(${cam.urn}) get uri fail:`, err);
					reject(err);
				} else {
					console.info(`Camera(${cam.urn}) get uri:`, stream.uri);
					resolve(stream.uri);
				}
			});
		});
	})
	// ...
}
```
`new onvif.Cam(dev)`使用  `@edgeros/jsre-onvif` 模块创建 `onvif.Camera` 对象。
`cam.getStreamUri()` 获取 `rtsp` 流地址。

+ 创建流媒体服务：
```javascript
function connectMedia(info, cb) {
	// ...
	new Promise((resolve, reject) => {
		// ...
	})
	.then((uri) => {
		// ...
		var urlParts = server.getCamUrl(uri);
		var parts = {
			user: urlParts.user || cam.username,
			pass: urlParts.pass || cam.password,
			hostname: urlParts.hostname,
			port: urlParts.port || 554,
			path: urlParts.path || '/'
		}
		return server.createMedia(devId, parts, cam, (media) => {
			if (media instanceof Error) {
				cb();
			} else {
				server.removeDev(devId);
				cb(media);
			}
		});
	})
	.catch((err) => {
		cb(err);
	});
}
```
成功创建流媒体服务对象后，将设备对象移除。

### 连接流媒体
本节示例前端是用 `VUE` 实现，前端工程位于 【eap-demo-camera-base/web】目录下，以下代码在【Player.vue】组件中。

+ 前端连接流媒体服务时，双通道有握手过程，使用【@edgeros/web-mediaclient】模块处理连接过程，首先在页面中引用模块:
```html
<script type="text/javascript" src="./mediaclient.min.js"></script>
```

+ 页面初始化时创建 `MediaClient` 对象：
```javascript
this.np = new NodePlayer();
// ...
var proto = location.protocol === 'http:' ? 'ws:' : 'wss:';
var host = `${proto}//${window.location.host}`;
var mediaClient = new MediaClient(host, (client, path) => {
	this.np.start(host + path);
}, {path: this.dev.path});
```

创建 `MediaClient` 对象时传入参数 `this.dev.path` 是摄像头设备的流媒体服务路径。

`new MediaClient()` 回调函数是 `mediaClient` 对象握手成功后的回调处理，返回 `ws-flv` 流访问地址，在回调中播放器即可使用这个地址播放音视频。

`NodePlayer` 是一款性能优秀支持 `flv` 流媒体的播放器，本示例中使用的是它的试用版本，可持续播放 10 分钟。`NodePlayer` 播放器的使用请参考【https://www.nodemedia.cn/doc/web/#/1?page_id=1】。

+ `mediaClient` 打开连接：
```javascript
startPlay: function () {
	console.log('Start play.');
	if (!this.isStarting) {
		console.log('Start.');
		this.isStarting = true;
		this.mediaClient.open(getAuth());
	}
}
```
调用 `mediaClient.open(auth)` 方法打开 `mediaClient` 连接，连接成功后会回调上述握手函数。

`getAuth()` 传入的是实时更新的 `{token, srand}` 安全访问参数，关于安全访问参考 API 手册【SDK/ Security】。

+ `mediaClient` 关闭连接：
```javascript
stopPlay: function() {
	if (this.isStarting) {
		console.log('Stop.');
		this.mediaClient.close();
	}
}

mediaClient.on('close', () => {
	console.log('MediaClient on close');
	this.np.stop();
	this.isStarting = false;
});
```
调用 `mediaClient.close()` 方法关闭 `mediaClient` 连接。

关闭连接会触发 `close` 事件， 在事件中停止播放器。

`mediaClient` 关闭后可重新建立连接。

**注意**：本示例需要获取`网络通信`（`network` - 用于搜索设备）， `视频流`（`rtsp` - 获取视频流） 权限，获取权限方式参考API 手册【SDK/ Permission】。

