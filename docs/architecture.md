# TidyNet 独立版架构基线

本地开发版 0.4.0 已从 Nikki/adblock-fast/AdGuard Home 的运行时绑定切换到 TidyNet 自有服务和配置。本文说明当前实现、剩余工作及 ImmortalWrt 24.10 的验收标准。当前代码尚未在目标路由器上构建和实机验证。

## 产品边界

TidyNet 直接提供 LuCI 首页、配置管理、Mihomo 服务控制、DNS 集成、广告规则管理与统计。运行时不安装、读取、配置或调用 Nikki、adblock-fast、AdGuard Home。ImmortalWrt 原有的 dnsmasq、DHCP、firewall4 属于系统服务，TidyNet 只通过明确启用和可逆配置与 dnsmasq 协作。

Mihomo 是 TidyNet 管理的独立核心。用户在首页明确触发下载或更新；设备按 CPU 架构从 Mihomo 官方 GitHub Release 获取 gzip 核心，要求 API 提供 SHA-256 digest，校验后才替换 `/usr/bin/tidynet-mihomo`。安装 LuCI IPK 不会自动下载大型核心、启动代理或接管 DNS。

## 当前代码结构

| 部件 | 职责 |
| --- | --- |
| `htdocs/.../home.js`、`home.css` | 首页核心操作、订阅、代理策略切换、DNS、规则源、统计、任务反馈 |
| `/etc/config/tidynet` | TidyNet 自有配置；订阅和规则源 URL 不返回浏览器 |
| `/etc/init.d/tidynet` | procd 管理 Mihomo 代理进程和独立 DNS 进程 |
| `/etc/init.d/tidynet-stats` | 广告过滤启用时管理 dnsmasq 查询计数监听进程 |
| `root/usr/libexec/rpcd/tidynet` | LuCI RPC 入口及读/写调用锁 |
| `root/usr/lib/tidynet/core.sh` | 状态、输入校验、配置提交、RPC 统计和后台任务派发 |
| `root/usr/libexec/tidynet-job` | 核心安装、订阅校验、规则下载、dnsmasq 可逆接入 |
| `root/usr/libexec/tidynet-stats` | 消费本机 dnsmasq 查询日志，只持久保存聚合查询计数 |
| `/etc/tidynet/` | 核心数据、订阅、DNS 配置和过滤规则的本地存储 |

安装依赖由 ImmortalWrt 24.10 包管理器处理，包含 LuCI/rpcd、libubox/libubus、JSON 工具、curl、CA、gzip 和 SHA-256 工具。Mihomo 不作为 Nikki feed 中的软件包安装，也不会运行远端安装脚本。CI 仍只构建 ImmortalWrt 24.10.6 SDK。

## 首页操作

- **核心**：从 Mihomo 官方发布页下载/更新；显示安装版本和运行状态；支持启动、停止和重载。服务默认不启动，用户显式启动后才加入开机启动。
- **订阅**：首页新增、编辑、删除、更新和切换；第一版仅支持完整 Clash/Mihomo YAML，不支持 URI/Base64 代理链接。URL 保存在 TidyNet UCI 中，状态接口不返回 URL；下载配置先经 Mihomo `-t` 校验。远端配置如将 Mihomo 控制器绑定到非本机地址会被拒绝。
- **代理策略**：首页读取当前 Mihomo 配置的代理组，通过 TidyNet 后端访问 `127.0.0.1` / `localhost` 控制器；可在首页切换组内节点。控制器密钥只在路由器本机从当前配置读取，不传给浏览器；策略选择还会由后端确认目标节点确属该组。Mihomo 官方接口通过 `GET /proxies` 列出代理组，使用 `PUT /proxies/{name}` 选择节点。[Mihomo API 文档](https://wiki.metacubex.one/en/api/)
- **广告过滤**：支持 hosts/纯域名格式的拦截源和允许源、自定义允许/拦截域名；下载和解析成功后才替换规则。dnsmasq 读取 TidyNet 生成的 hosts 文件，允许域名优先于拦截域名。仅使用路由器 DNS 的客户端会被过滤；客户端自带 DoH/DoT 可绕过路由器过滤。
- **DNS**：由一个独立 Mihomo 实例监听 `127.0.0.1:10535`，dnsmasq 仍监听系统 53 端口并服务 LAN/DHCP。使用 10535 避开常见代理配置的 1053 DNS 端口。用户启用 TidyNet DNS 后，dnsmasq 全局上游转发到该独立端口；停用时只移除 TidyNet 添加的上游值并尝试恢复之前的 `noresolv`。fake-ip/real-ip、IPv6 和上游写入 TidyNet 自己生成的 DNS 配置。
- **统计**：启用广告过滤后，TidyNet 打开 dnsmasq 查询日志，并统计 DNS 查询总量及命中当前阻断表的请求量。首页同时显示加载的阻断域名数和启用规则源数；规则数量不会替代请求计数。计数为本地持久累计值，关闭过滤期间不累计。
- **面板和解析测试**：首页提供外部 WebUI 链接设置、状态刷新和路由器本机解析测试。外部控制 API 的网络暴露由 WebUI/用户配置负责；TidyNet 不自动把未认证控制 API 暴露到 LAN。

## 配置安全与回滚

- RPC 只接受窄范围状态、设置和白名单操作，不提供任意 shell、UCI 命令、文件路径或通用 URL 下载接口。
- Mihomo 核心、订阅和规则均先写入暂存文件；限制大小并校验摘要、内容格式或 Mihomo 配置，通过后原子替换。URL/域名/名称/端口/列表数量均由后端校验。
- DNS 和广告接入仅写入 dnsmasq 的 `server`、`noresolv`、`addnhosts`、`logqueries` 相关值。TidyNet 保存自己接入前的 `noresolv` / `logqueries` 值；停用和卸载时尝试移除自己增加的列表项并恢复原值，不删除其它 server/addnhosts 项。
- 为统计而启用 `logqueries` 会让系统本机日志短暂包含查询域名和来源地址；TidyNet 持久存储的是聚合计数。首页启用前会提示这一点。logread 的实际保留策略由 ImmortalWrt 系统配置决定。
- 安装迁移会移除旧版 TidyNet 不再使用的 AdGuard Home 凭据并补齐新配置字段；旧版 TidyNet 默认 DNS 端口 1053 会迁移到 10535。不会删除 Nikki 的旧 UCI 配置或订阅数据。

## 实施状态和验收

### 已完成的本地实现，待目标机验证

- 切断运行时代码对 Nikki、adblock-fast、AdGuard Home 的服务、UCI、ubus 调用。
- 增加 TidyNet 自有 Mihomo procd 服务和按架构下载/摘要校验核心流程。
- 首页管理核心、YAML 订阅、dnsmasq hosts 规则源、DNS 模式/上游和基础统计。
- 广告规则允许表优先；DNS 与广告接入提供停用/卸载清理路径。

### 后续完善

1. **24.10.5 实机回归**：在 `192.168.1.8` 验证 `opkg` 依赖解析、24.10 x86_64 核心资产、UCI 的 list/noresolv/logqueries 行为、dnsmasq reload、procd 双实例、订阅切换回滚、统计日志格式和卸载清理。
2. **统计增强**：当前提供累计总数，不提供小时/日趋势或重置控件；先验证日志计数准确性和资源开销，再增加窗口趋势与重置操作。
3. **订阅增强**：当前不做 URI/Base64 转换；代理组节点切换已通过本机 API 集成，后续可增加节点延迟测试、连接列表和流量统计。
4. **发布**：完成实机验证后，更新 24.10-only Actions 构建并发布 IPK、SHA256 和升级/卸载说明。若未来加入架构相关二进制，必须调整包架构和 24.10 构建矩阵。

## 目标设备记录

用户路由器为 ImmortalWrt 24.10.5 x86_64。此前诊断到 0.3.0 已安装，Mihomo、Nikki、adblock-fast 均未安装；既有 Nikki 订阅属于遗留外部 UCI。该次设备检查只读取状态，没有安装包或改写配置。0.4.0 尚未上传或在该设备部署。
