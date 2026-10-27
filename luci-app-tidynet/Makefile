include $(TOPDIR)/rules.mk

LUCI_TITLE:=TidyNet - Mihomo, DNS and Ad Blocking Manager
LUCI_DEPENDS:=+luci-base +rpcd +libubox +libubus +ubus +jsonfilter +curl +adblock-fast +luci-app-nikki
LUCI_PKGARCH:=all
PKG_LICENSE:=GPL-3.0-or-later
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

define Package/luci-app-tidynet/conffiles
/etc/config/tidynet
endef

define Package/luci-app-tidynet/install
	$(INSTALL_DIR) $(1)/usr/lib/tidynet
	$(INSTALL_DATA) ./root/usr/lib/tidynet/core.sh $(1)/usr/lib/tidynet/core.sh
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/tidynet $(1)/usr/libexec/rpcd/tidynet
	$(INSTALL_BIN) ./root/usr/libexec/tidynet-job $(1)/usr/libexec/tidynet-job
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/tidynet $(1)/etc/config/tidynet
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/90-tidynet $(1)/etc/uci-defaults/90-tidynet
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-tidynet.json $(1)/usr/share/luci/menu.d/luci-app-tidynet.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-tidynet.json $(1)/usr/share/rpcd/acl.d/luci-app-tidynet.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/tidynet
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/tidynet/home.js $(1)/www/luci-static/resources/view/tidynet/home.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/tidynet/home.css $(1)/www/luci-static/resources/view/tidynet/home.css
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

