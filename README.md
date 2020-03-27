yooli-spider项目说明
-----
有利网数据采集工具

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
.env                 |配置环境变量(参考文件中的配置项说明)

### 安装依赖

```
npm install
```

### 启动脚本说明

```
npm run init//初始化elasticsearch
npm run start//启动web服务,访问http://localhost:8080页面可查看互金平台和官网相关数据
npm run cron//每日采集官网出借数据并存储到elasticsearch
npm run download//一键下载合同
```
