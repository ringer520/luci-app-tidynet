# TidyNet

**TidyNet — Mihomo、DNS 与广告拦截管理器** 是面向 ImmortalWrt 的 LuCI 插件。目标是让用户在一个可交互首页中管理 Mihomo 核心、订阅、DNS、广告规则与统计。

## 独立版重构状态

当前本地开发版 **0.4.0** 是独立插件实现：自有 Mihomo procd 服务、官方核心下载校验、YAML 订阅管理、DNS 上游、dnsmasq hosts 广告规则、请求计数和交互首页都已接入代码。仍需在 ImmortalWrt 24.10.5 目标设备验证依赖安装、dnsmasq 实际行为、统计准确性和安装/卸载恢复。新的边界、首页操作和分阶段验收见[独立版架构基线](docs/architecture.md)。

独立版目标：

- 不安装、配置或调用 Nikki、adblock-fast、AdGuard Home。
- LuCI 插件管理自身配置、服务与 DNS/广告规则流程；Mihomo 核心由首页显式下载和更新。
- 首页可直接操作核心、订阅、DNS、广告规则与 Mihomo 代理策略组；策略切换通过路由器本机控制 API 完成。
- GitHub Actions 同时构建 ImmortalWrt 24.10.6 和 25.12.2 的 x86/64 SDK；分别生成 IPK 与 APK 安装包。

## 当前版本

本地开发版本：**0.4.0**。该版本尚未完成 ImmortalWrt 24.10.5 路由器实机验收；安装前请备份 `/etc/config/tidynet` 与 `/etc/config/dhcp`。启用 DNS/广告过滤会改动 TidyNet 管理的 dnsmasq 项，关闭或卸载时会尝试撤销这些项目。

## 架构与路线

查看[独立版架构基线](docs/architecture.md)，内容包括目标首页交互、核心更新安全流程、DNS 与广告集成边界、RPC 安全约束、实施阶段和 24.10 验收标准。

## 构建

CI 使用 ImmortalWrt 24.10.6 与 25.12.2 x86/64 SDK，生成架构无关的 LuCI IPK/APK；Mihomo 核心在设备端按架构下载，不打入安装包。

## 许可证

TidyNet 使用 GPL-3.0-or-later，详见 [LICENSE](LICENSE)。Mihomo 是独立上游项目，下载和分发遵守其上游许可与发布说明。
