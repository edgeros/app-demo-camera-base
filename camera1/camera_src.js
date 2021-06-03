/*
 * Copyright (c) 2021 EdgerOS Team.
 * All rights reserved.
 *
 * Detailed license information can be found in the LICENSE file.
 *
 * File: camera_src.js camera source module.
 *
 * Author: Cheng.yongbin
 *
 */

var MediaDecoder = require('mediadecoder');
var FlvSrc = require('webmedia/source/flv');
var util = require('util');

var extend = util.extend;
var clone = util.clone;

/* Pixel format. */
const MEDIA_PIXEL_FORMAT = MediaDecoder.PIX_FMT_RGB24;

/* Default input options. */
const DEF_IN_OPTS = {
	protocol: 'tcp',
	host: null,
	port: 554,
	path: '/',
	user: 'admin',
	pass: 'admin',
}

/* Default face detec view setting. */
const DEF_DETEC_VIEW = {
	disable: false,
	width: 640,
	height: 320,
	fps: 1,
	noDrop: false,
	pixelFormat: MEDIA_PIXEL_FORMAT,
}

/*
 * CameraSource.
 * op: start, stop.
 * emit: start, stop, stream, data, end, error.
 */
class CameraSource extends FlvSrc {
	/* 
	 * constructor(ser, mode, inOpts[, outOpts])
	 * inOpts:
	 * 	host {String}
	 * 	[port] {Integer} Default: 10000
	 * 	[path] {String} Default: '/'
	 * 	[user] {String} Default: 'admin'
	 * 	[pass] {String} Default: 'admin'
	 */
	constructor(ser, mode, inOpts, outOpts) {
		super(ser, mode, inOpts, outOpts);

		if (typeof inOpts !== 'object') {
			throw new TypeError('Argument error.');
		}
		var input = clone(DEF_IN_OPTS);
		extend(input, inOpts);
		if (!input.host) {
			throw new TypeError('Argument inOpts.host error.');
		}

		this.inOpts = input;
		this._netcam = null;
	}

	/*
	 * start()
	 */
	start() {
		var netcam = new MediaDecoder();
		this._netcam = netcam;
		var self = this;
		var input = this.inOpts;
		var url = `rtsp://${input.user}:${input.pass}@${input.host}:${input.port}${input.path}`;
		var name = `${input.host}:${input.port}${input.path}`;

		new Promise((resolve, reject) => {
			netcam.open(url, { proto: 'tcp', name: name }, 10000, (err) => {
				if (err) {
					console.error('Open netcam fail:', url, err);
					reject(err);
				} else {
					netcam.destVideoFormat(DEF_DETEC_VIEW);
					netcam.destAudioFormat({ disable: true });
					netcam.remuxFormat({ enable: true, enableAudio: true, format: 'flv' });
	
					netcam.on('remux', self.onStream.bind(self));
					netcam.on('header', self.onStream.bind(self));
					netcam.on('eof', self.onEnd.bind(self));
					resolve(netcam);
				}
			});
		})
		.then((netcam) => {
			super.start.call(self);
			netcam.start();
		})
		.catch((err) => {
			console.error('Open netcam fail:', url, err);
			this.end();
		});
	}

	/*
	 * stop()
	 */
	stop() {
		console.info('Src stop');
		if (this._netcam) {
			this._netcam.close();
			this._netcam = null;
		}
		Task.nextTick(() => {
			super.stop.call(this);
		});
	}

	/*
	 * onStream(frame)
	 */
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

	/*
	 * onEnd()
	 */
	onEnd() {
		console.info('Src end');
		this.end();
	}
}

/*
 * Export module.
 */
module.exports = CameraSource;
