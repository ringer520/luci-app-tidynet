<div align="center">
  <img src="assets/tidynet-icon.svg" alt="TidyNet 项目图标" width="112" height="112">
  <h1>TidyNet</h1>
  <p><strong>让 Mihomo、DNS 和广告过滤，在 ImmortalWrt 上一目了然。</strong></p>
  <p>
    <a href="https://github.com/ringer520/luci-app-tidynet/actions/workflows/build.yml"><img src="https://github.com/ringer520/luci-app-tidynet/actions/workflows/build.yml/badge.svg?branch=main" alt="构建状态"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-79a995.svg" alt="GPL-3.0-or-later"></a>
    <img src="https://img.shields.io/badge/LuCI-ImmortalWrt-76b7a5.svg" alt="ImmortalWrt LuCI">
  </p>
</div>

TidyNet 是一个独立的 ImmortalWrt LuCI 插件，用一个简洁的交互页面管理 Mihomo 核心、订阅、代理策略、DNS、广告过滤和流量接管。插件按需下载 Mihomo 核心，安装包不捆绑核心文件。

## 功能一览

- **Mihomo 核心**：查看本机版本、官方最新版本和运行状态；从首页下载、更新、启动、停止或重载核心。
- **订阅管理**：添加远程订阅或上传本地配置，手动更新或设置更新周期，并查看上次更新时间和当前使用的配置。
- **代理策略**：查看策略组与当前节点，手动切换节点；支持节点延时测试和一键优选。
- **DNS 设置**：分别配置直连域名与代理域名、上游 DNS 和缓存；可查看 DNS 接管状态。
- **广告过滤**：管理规则源和自定义域名，设置自动更新周期；查看生效规则数量、累计拦截统计。
- **流量接管**：独立配置 TCP、UDP 接管方式，并在页面查看运行状态。
- **连接状态**：按需测试 Google、OpenAI 和阿里云连通延时，刷新后保留上次结果。
- **轻量易用**：以独立首页集中呈现常用状态和操作，适配桌面与窄屏布局。

## 独立运行

TidyNet 自行管理 Mihomo 服务、订阅、DNS 和过滤规则，不依赖或调用 Nikki、adblock-fast、AdGuard Home。DNS 与广告过滤通过 ImmortalWrt 自带的 dnsmasq 协作；启用相应功能后，插件会维护所需的 dnsmasq 配置。使用客户端自带的 DoH/DoT 时，客户端可能绕过路由器的 DNS 过滤。

安装插件不会自动下载 Mihomo、启用代理或接管流量。请在首页按需配置并启用相关功能。移除插件前，建议备份配置；卸载流程会尝试清理插件添加的 dnsmasq 项目并恢复其记录的原始设置。

## 安装

从 [GitHub Releases](https://github.com/ringer520/luci-app-tidynet/releases) 下载与你的 ImmortalWrt 版本相符的安装包：

| ImmortalWrt | 安装包 | 构建目标 |
| --- | --- | --- |
| 24.10 | `.ipk` | 24.10.6 x86/64 SDK |
| 25.12 | `.apk` | 25.12.2 x86/64 SDK |

也可以在 [GitHub Actions](https://github.com/ringer520/luci-app-tidynet/actions/workflows/build.yml) 查看每次构建的产物。上传前请确认设备版本与包格式匹配，并让系统包管理器从已配置的软件源安装依赖。安装后在 LuCI 的 **服务 → TidyNet** 打开管理页面。

当前工作流针对 x86/64 SDK 生成架构无关的 LuCI 包。Mihomo 核心在设备端由用户显式触发下载，并按设备架构选择对应文件。

## 从源码构建

将 `luci-app-tidynet` 放到 ImmortalWrt 源码树的 `package/` 目录下，并在 SDK 中准备好 LuCI feed 后构建：

```sh
make package/luci-app-tidynet/compile V=s
```

GitHub Actions 工作流可作为依赖准备、构建环境和 SDK 版本的参考：[`build.yml`](.github/workflows/build.yml)。

## 项目结构

```text
.
├── assets/                 # README 与项目使用的品牌图标
├── docs/                   # 架构与设计说明
└── luci-app-tidynet/
    ├── htdocs/             # LuCI 页面、样式和界面图标
    └── root/               # 服务、RPC、配置与后台任务
```

## 版本与许可

当前软件包版本为 **0.4.0-r37**。项目采用 [GPL-3.0-or-later](LICENSE)。Mihomo 为独立上游项目，其核心许可和使用条款以 [Mihomo 项目](https://github.com/MetaCubeX/mihomo)的说明为准。

欢迎通过 [Issues](https://github.com/ringer520/luci-app-tidynet/issues) 报告问题或提出改进建议。
