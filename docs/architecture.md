# TidyNet architecture and user experience

## Information architecture

```text
Home
├── Mihomo status and quick actions
├── Subscription list and update actions
├── Ad blocking controls and live statistics
├── DNS health
└── MetaCubeXD dashboard shortcut

Mihomo
DNS
Ad blocking
Settings
```

The home page prioritizes the tasks users perform often. Subscription and ad-blocking controls must be visible without navigating away. Detailed configuration stays on supporting pages to keep the home page readable on mobile screens.

## Statistics contract

The first release should show only metrics that the installed backend can report reliably:

- total blocked domains/rules currently loaded;
- number of enabled blocklist sources;
- last successful update time and last processing result.

If `adblock-fast` does not provide a stable machine-readable counter for a metric on a supported version, show an unavailable state or omit that metric. Do not parse volatile human-readable logs as the primary source of truth. Per-client request counts are outside the first release unless a reliable DNS query logging backend is explicitly installed and configured.

## Integration boundaries

- Mihomo subscription/profile handling remains owned by Mihomo/Nikki-compatible configuration mechanisms. The hub offers a friendly summary and common update actions.
- The DNS backend remains dnsmasq, SmartDNS, or Unbound as selected by the router administrator.
- `adblock-fast` owns blocklist download, parsing, and backend installation.
- The hub owns orchestration, status presentation, health checks, and safe shortcuts.
- MetaCubeXD owns the rich proxy traffic and connection dashboard.

## Failure behavior

- Missing packages produce an installation hint, not a failing page.
- An unreachable Mihomo API does not block DNS or ad-blocking status from loading.
- A failed list refresh preserves the last known working rules when the backend supports that behavior and reports the failure clearly.
- DNS changes and service restarts show progress and return actionable errors.
