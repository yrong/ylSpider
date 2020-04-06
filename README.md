yooli-spider项目说明
-----
ylw数据采集工具

## 基本功能

+ 互金信批平台月度数据采集
+ 官网每日出借数据采集
+ 合同一键下载


## 安装依赖应用

* [chrome](https://www.google.com/intl/zh-CN/chrome/)
* [nodejs](https://nodejs.org/zh-cn/)
* [elasticsearch](https://www.elastic.co/cn/downloads/elasticsearch)


### 配置

配置文件 | 说明
--- | --- 
.env.example                 |配置环境变量(主要完成登录配置和chrome浏览器配置,其它配置项参考文件说明)

.env.example配置完成后重命名为.env

### 安装依赖

```
npm install
```

### 启动脚本说明

```
npm run init//初始化elasticsearch
npm run download//一键下载合同（平台封闭了下载接口,目前只能下载明细数据）
```

![](/contract.png)

### 小tips

> windows环境封装了一键安装脚本,解压[安装包](https://github.com/yrong/ylSpider/releases/download/1.0/release.zip)后install.bat批处理文件上右键以管理员身份运行可一键安装依赖服务及应用程序

> 若不用elasticsearch做数据查询,.env中的SaveSearch配置项可以配置为false,无需运行`npm run init`

> 测试程序期间.env中的PlanName配置项可配置为一个金额较小的定存宝项目编号（例如24-180125）运行`npm run download`，程序运行完成后观察download目录下是否生成了相关合同文件，没有问题再下载所有项目
