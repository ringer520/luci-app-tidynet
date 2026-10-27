# 架构与接口

## 运行结构

LuCI 页面只调用 rpcd 注册的 `tidynet` 对象。rpcd 的 shell 入口调用 `core.sh`，通过 OpenWrt 的 UCI、ubus、init.d 和 jshn 接口读取状态或执行固定操作。慢任务由 `tidynet-job` 在后台执行，任务状态原子写入 `/tmp/tidynet/job.json`。

| 组件 | 职责 |
| --- | --- |
| `htdocs/.../home.js`、`home.css` | 中文首页、订阅/规则/DNS 控件、状态轮询 |
| `root/usr/libexec/rpcd/tidynet` | rpcd 协议入口及 ACL 对应的方法列表 |
| `root/usr/lib/tidynet/core.sh` | JSON、状态读取、校验、UCI 暂存、统计及后台任务派发 |
| `root/usr/libexec/tidynet-job` | 固定服务命令白名单和任务结果确认 |
| `/etc/config/tidynet` | 面板地址和可选 AdGuard Home 本机接口配置 |

## rpcd 方法

- `status {}`：返回 Nikki/Mihomo 运行状态、隐藏订阅地址后的订阅元数据、adblock-fast 域名/规则源数量、DNS 状态及当前任务。
- `settings {}`：返回当前面板地址、DNS 上游组、广告规则源元数据及自定义域名。订阅 URL、规则源 URL、AdGuard Home 密码均不返回。
- `stats {}`：关闭时返回 `connected=false`；启用时用回环地址请求 AdGuard Home `/control/stats`，返回查询/过滤拦截数、其统计窗口和历史序列。
- `configure { payload: JSON-string }`：仅接受订阅、规则源、自定义域名、DNS 上游或本插件连接设置的编辑和删除操作。
- `action { operation, section }`：仅接受 Nikki 启停/重载、已配置订阅更新和 adblock-fast 启停/更新/重载操作。
- `resolve { domain }`：验证完整域名后，通过 `timeout` 和 `nslookup` 向路由器 `127.0.0.1:53` 发起一次查询，最多返回 4 KiB 输出。

ACL 将状态、设置和统计方法授予 LuCI 读取权限；配置写入与服务操作另外授权。接口不提供通用 shell、UCI 命令、文件读取或 URL 抓取功能。

## 配置和任务安全

写入请求限制为 24 KiB。URL 只允许 HTTP(S) 且最长 4 KiB；域名字段逐行校验，每组不超过 300 项、总长不超过 16 KiB。RPC 用户数据作为参数传递给 UCI，不会拼接成可执行 shell 语句。DNS 上游限制长度和字符集。名称服务器只允许编辑 Nikki 已存在的 `nameserver` 匿名/命名节。

修改先写入请求专用的 UCI delta 文件，再提交指定包；如果包内存在尚未提交的其他 UCI 修改，则拒绝写入，避免覆盖 LuCI 中待保存的内容。配置提交后才触发对应已启用服务的重载。长任务持有单一锁并写入状态文件，网页定时读取状态。失败时配置保留，页面显示失败结果；用户可以核对后端状态再重试。

Mihomo、Nikki 和 adblock-fast 命令路径固定在 `/etc/init.d`，命令名和动作使用白名单。服务命令最长执行 600 秒；规则下载状态最多观察 240 秒。任务状态不会包含订阅和规则源地址。AdGuard Home 密码只保存在 root-only 的本机 UCI 配置中，curl 从标准输入读取认证配置，并限制回环地址、协议、时间和响应大小。

## 统计定义

1. **加载规则域名**来自 adblock-fast 官方 rpcd 的 `entries` 字段；若其 Lua/ucode rpcd 方法不可用，则尝试其服务数据。该数字不是请求数或用户数。
2. **拦截规则源**按 UCI 中已启用且 `action=block` 的 `file_url` 节数量计算。统计源配置，不代表全部下载/解析成功。
3. **已拦截请求、查询量和趋势**只来自 AdGuard Home `/control/stats` 接口中的 `num_blocked_filtering`、`num_dns_queries` 与 `blocked_filtering`。按 `time_units` 标示 AdGuard Home 当前配置的统计窗口。没有该数据源时显示未接入，不推算、不用规则数量代替。
4. **TidyNet 最近一次手动更新**保存在 `/tmp`，路由器重启后会清空；这不是 adblock-fast 的全局更新时间。

## 手工检查清单

部署到测试路由器后，逐项检查安装入口和 ACL、Nikki 未安装/运行/停止三种状态、订阅新增更新切换与删除、URL 留空编辑、adblock-fast 规则源和域名保存及回滚提示、规则下载后台成功/失败、adblock-fast 缺失时的退化界面、两种 DNS 模式及上游组、有效/无效解析诊断、AdGuard Home 正确凭据/错误凭据/服务离线、客户端真实 DNS 与广告拦截，以及路由器重启后的本机统计密码权限。不同 ImmortalWrt 版本、Nikki/adblock-fast release、DNS 拓扑和 WebUI 访问路径均需实机复核。

