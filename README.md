# TidyNet

**TidyNet** is a friendly LuCI control center for ImmortalWrt and OpenWrt. It brings Mihomo subscriptions, DNS health, and DNS-based ad blocking into one clear, responsive home page.

> Project status: early prototype. The home page and rpcd status endpoint are in place; Mihomo provider-specific subscription integration and verified adblock statistics are still pending.

## Product direction

The home page is the daily operations workspace. Subscription management and ad-blocking controls are visible immediately, alongside live blocking statistics. Mihomo's full proxy dashboard is provided by the upstream MetaCubeXD project instead of being reimplemented here.

### Home page (prototype)

- **Mihomo status:** running state, selected profile, and quick restart.
- **Subscriptions:** reserved for configured subscriptions, last update, and provider update actions. Provider schemas are not guessed in the prototype.
- **Ad blocking:** `adblock-fast` installed/enabled state, configured backend, an update action, and available statistics.
- **Blocking statistics:** blocked domains/rules, active sources, and most recent processing result. Show “Unavailable” when the installed backend does not expose a metric; never fabricate counts.
- **DNS health:** active resolver/backend and a simple reachability check.
- **Dashboard shortcut:** open the locally installed MetaCubeXD interface.

### Supporting pages

1. **Mihomo** — profile/configuration management, runtime status, diagnostics, and MetaCubeXD link.
2. **DNS** — selected DNS backend, upstream overview, query/reachability diagnostics, and conflict hints.
3. **Ad blocking** — detailed `adblock-fast` feed, allowlist, blocklist, and refresh settings.
4. **Settings** — integrations, dashboard URL, privacy/security guidance, and UI preferences.

## Architecture

- LuCI JavaScript views provide the responsive interface and call router-side RPC methods.
- A small rpcd/ucode backend performs narrowly scoped status and service operations.
- UCI remains the source of truth for configuration.
- Mihomo is managed through its existing service and Clash API; MetaCubeXD is upstream static UI content.
- DNS ad blocking is delegated to `adblock-fast`, which supports dnsmasq, SmartDNS, and Unbound.
- No extra always-running daemon and no bundled Mihomo core in the initial release.

## Compatibility target

Initial target: ImmortalWrt/OpenWrt 24.10 and newer, subject to SDK build verification. Older versions can be considered after the first supported release is stable.

## Planned repository layout

```text
luci-app-tidynet/
  Makefile
  htdocs/luci-static/resources/view/tidynet/
  root/usr/share/rpcd/acl.d/
  root/usr/libexec/rpcd/
  po/zh_Hans/
  po/en/
docs/
  architecture.md
  security.md
  compatibility.md
```

## Development milestones

1. Confirm package builds on current ImmortalWrt/OpenWrt SDKs and refine service/ACL integration.
2. Add subscription providers behind explicit adapters for Nikki and other Mihomo managers.
3. Integrate an authoritative `adblock-fast` status source for loaded domains and last update.
4. Add DNS health diagnostics and the MetaCubeXD shortcut/local asset option.
5. Add Chinese and English translations, accessibility and mobile layout polish.
6. Build IPK/APK packages with OpenWrt SDKs and publish signed/checksummed release artifacts and feed indexes.

## Security principles

- Never expose Mihomo's controller or secret to unauthenticated networks.
- Keep secrets out of browser local storage where possible; use LuCI authenticated RPC and same-origin integration.
- Avoid shell interpolation of user-controlled values. Validate subscription URLs and configuration fields server-side.
- Require LuCI administrator authorization for service control and config changes.
- Do not claim a blocking statistic unless the selected backend provides a reliable value and its meaning is documented.

## Upstream projects

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) — reference for Mihomo proxy integration on OpenWrt.
- [MetaCubeXD](https://github.com/MetaCubeX/metacubexd) — upstream Mihomo dashboard (MIT).
- [adblock-fast](https://github.com/openwrt/packages/tree/master/net/adblock-fast) and [LuCI frontend](https://github.com/openwrt/luci/tree/master/applications/luci-app-adblock-fast) — DNS ad-blocking backend and management reference.
- [ImmortalWrt LuCI](https://github.com/immortalwrt/luci) — target platform interface.

## License

The proposed package license is GPL-3.0-or-later. Upstream components remain separate dependencies or assets with their original notices and licenses. Verify each included upstream version's license before packaging.

## Build

This repository is intended to be added as a package feed to an OpenWrt/ImmortalWrt source tree. Add the repository as a feed, update/install the feed, then compile `luci-app-tidynet` with the target SDK. This prototype has not yet been compiled against a target SDK; do not install it on a production router without building and reviewing the package for your firmware release.
