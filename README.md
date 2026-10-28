# TidyNet

**TidyNet — Mihomo、DNS 与广告拦截管理器** 是面向 ImmortalWrt / OpenWrt 的 LuCI 插件。首页集中显示 Mihomo 状态、订阅、广告过滤和 DNS；订阅及广告规则源可直接维护，并能查看规则域名数量和可选的真实拦截请求统计。

当前本地开发版本：**0.3.0**。GitHub Actions 在每次 main 分支更新时，分别使用 ImmortalWrt 24.10.6 和 25.12.2 官方 SDK 构建通用 LuCI 包，并附加校验和。

## 首页功能

- **订阅管理**：新增、编辑、删除、更新；可切换当前订阅并重载 Nikki。订阅链接不会通过状态接口发回浏览器。
- **广告过滤**：启停 adblock-fast、更新规则；新增、编辑、删除拦截/允许列表源；编辑自定义允许和拦截域名。
- **拦截统计**：显示 adblock-fast 回报的已加载域名数、启用的拦截源和 TidyNet 最近一次手动更新。域名数量代表规则覆盖范围，**不代表被拦截的请求数**。
- **真实请求计数（可选）**：连接路由器本机的 AdGuard Home 控制接口，显示其统计窗口里的 DNS 查询和过滤拦截请求，并展示窗口趋势。不开启或未连接时会明确显示“未接入”。窗口长度由 AdGuard Home 自己的统计设置决定。
- **Mihomo 面板**：从 Nikki 的控制器监听地址和 UI 路径推导面板地址；也可手动填写地址。插件不会下载、覆盖或托管第三方面板文件。
- **组件安装**：TidyNet 本身可独立安装。首页按钮会识别固件版本和设备架构，配置 Nikki 官方签名软件源，并通过系统包管理器下载 Nikki、Mihomo 核心、adblock-fast 及其依赖；不会自动开启代理或广告过滤。
- **Mihomo 核心**：首页显示核心版本，支持从 Nikki 签名软件源下载或更新 `mihomo-meta`；如已安装 `mihomo-alpha`，会继续更新当前变体。更新前会尝试停止运行中的 Nikki，完成后重新启动。
- **DNS**：查看 Mihomo DNS 状态，编辑现有 Nikki 上游组、解析模式和 IPv6，并通过路由器本机 `127.0.0.1:53` 测试解析。
- **后台任务**：订阅、服务启停和规则更新在后台执行；首页显示执行中、成功或失败状态，避免等待网络请求时 LuCI 页面卡住。

## 依赖与安装

TidyNet 安装包只依赖设备系统中常见的 LuCI、rpcd、libubox/jsonfilter、curl 和 CA 证书包；不会把 Nikki 或 adblock-fast 设为硬依赖，所以不必预先手动添加 Nikki feed。

每次推送到 main 后，GitHub Actions 会构建 ImmortalWrt 24.10.6 的 `.ipk` 和 25.12.2 的 `.apk`。成功构建会在仓库的 Releases 页面发布一个预发布版本；Actions 运行页面也保留 90 天的构建产物。构建使用 ImmortalWrt 官方 x86/64 SDK，TidyNet 自身标记为架构无关（`all`），适用于同版本 ImmortalWrt 的其他设备架构；Nikki、adblock-fast 等运行依赖仍由设备已配置的软件源提供。

下载与你设备大版本匹配的包并安装：
- ImmortalWrt 24.10：`opkg install ./luci-app-tidynet_*.ipk`
- ImmortalWrt 25.12：`apk add --allow-untrusted ./luci-app-tidynet-*.apk`

构建工作流及版本说明见 [Build ImmortalWrt packages](.github/workflows/build.yml)。

安装包后进入 LuCI → 服务 → TidyNet，点击首页的“安装运行组件”。TidyNet 会针对 ImmortalWrt/OpenWrt 24.10、25.12 或 SNAPSHOT 添加 Nikki 官方 feed，并用 `opkg` 或 `apk` 安装运行组件及依赖。完成后可在首页单独下载或更新 Mihomo 核心。此流程不会自动启动代理或广告过滤；安装后仍需检查 Nikki 配置，再手动启用所需服务。Mihomo 面板依赖 Nikki 安装的 UI 文件；如果默认地址打不开，请在设置中指定浏览器可达的面板 URL。管理密码不会被拼进面板 URL；如果 Mihomo 控制器设置了密钥，请按 WebUI 的提示在面板中输入。

若要显示真实请求数，在 TidyNet 设置中启用 AdGuard Home 统计，填写它**监听路由器本机回环地址**的 HTTP 控制端口和认证信息。TidyNet 只读取 `http://127.0.0.1:<端口>/control/stats`，不会安装、启动或配置 AdGuard Home，也不会将用户名和密码返回前端。若 AdGuard Home 不在本机运行，请不要把其他设备地址填进来；此版本只支持本机回环连接。

## DNS 与统计说明

TidyNet 通过 Nikki/Mihomo 和 adblock-fast 各自支持的 UCI 配置、服务命令及 rpcd 状态接口工作，不复制它们的核心程序。依赖安装和核心更新走受签名校验的软件包仓库，不运行远端安装脚本。DNS 上游编辑只改动对应 Nikki 上游组。自定义域名列表按完整域名校验，每组最多 300 条。

Mihomo 的 DNS 接管和 adblock-fast 选择的 DNS 后端必须匹配你的网络拓扑；首页会提示检测到的 DNS 接管组合，但不会替你改防火墙或 DNS 重定向。保存 DNS 或规则时，只会在相应服务已启用的情况下请求重载。请在自己的路由器和客户端验证实际解析、拦截以及代理行为。

## 安全与限制

- rpcd ACL 只开放 TidyNet 指定的读取与操作方法；后台操作使用固定命令白名单，不接受任意命令、文件路径或 URL 作为执行目标。
- 规则源和订阅地址限制为 HTTP(S)，输入长度与域名列表大小有上限。写入使用独立 UCI 暂存文件，并发任务由锁串行化。
- AdGuard Home 查询固定连接本机回环地址、4 秒超时和 256 KiB 响应上限。认证信息保存在权限为 root-only 的配置文件中。
- 依赖安装只支持识别出的 24.10、25.12 和 SNAPSHOT feed 分支；软件包由系统 `opkg`/`apk` 校验签名后安装。核心更新保留已安装的 `mihomo-alpha` 变体，否则默认使用 `mihomo-meta`。
- TidyNet 与 adblock-fast 使用的 DNS 监听端口、客户端 DNS 劫持、Nikki 的版本差异以及第三方面板访问方式，需按实际设备验证。控制器监听在 loopback 时，自动推导出的面板链接可能无法从浏览器直接访问，可手动配置浏览器可达的地址。
- CI 软件包构建验证不等于在具体路由器上的安装和服务集成验证。Nikki 的版本差异、DNS 拓扑及硬件运行行为仍需在目标设备确认。

## 项目文档与许可证

- [架构与 RPC 接口](docs/architecture.md)
- [GNU GPL v3 许可证](LICENSE)

TidyNet 使用 GPL-3.0-or-later。Nikki/Mihomo、adblock-fast、AdGuard Home 和 WebUI 均为独立上游项目，请按各自许可证和文档安装、配置与升级。

