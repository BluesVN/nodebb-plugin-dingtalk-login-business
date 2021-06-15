## Nodebb Plugin Dingtalk Login Business

NodeBB 钉钉二维码登录插件,接入接口实现企业用户信息获取。
钉钉登录
## 安装

    $ npm install nodebb-plugin-dingtalk-login-business
    
## 使用

OAuth2.0网页授权，使用此接口须通过钉钉开放平台认。

申请好 AppID 和 AppSecret 后进入 NodeBB 的 ACP 后台设置钉钉登录信息  

参考:  nodebb-plugin-dingtalk-login
在此基础上，通过自己实现接口(getUserInfoByUnionid)获取企业用户信息。