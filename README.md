多媒体应用开发请参考指南：https://www.edgeros.com/edgeros/guide/multimedia/

# 摄像头配置注意事项
- 确认支持 `onvif` 与 `rtsp` 协议访问的网络摄像头，确认开启 `onvif` ；
- 认证方式建议配置为兼容性广泛的 `Digest&ws-username token`；
- 核对网络配置是否配置正确，建议设置为动态分配 `IP`；
- 确认摄像头设备管理账号密码正确【非 APP 登陆的账号密码】；