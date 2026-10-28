"use strict";
"require view";
"require rpc";
"require ui";

if (!document.getElementById("tidynet-style")) {
	var style = document.createElement("link");
	style.id = "tidynet-style";
	style.rel = "stylesheet";
	style.href = L.resource("view/tidynet/home.css");
	document.head.appendChild(style);
}

var callStatus = rpc.declare({ object: "tidynet", method: "status", expect: {} });
var callSettings = rpc.declare({ object: "tidynet", method: "settings", expect: {} });
var callStats = rpc.declare({ object: "tidynet", method: "stats", expect: {} });
var callProxyStatus = rpc.declare({ object: "tidynet", method: "proxy_status", expect: {} });
var callProxySelect = rpc.declare({ object: "tidynet", method: "proxy_select", params: [ "group", "member" ], expect: {} });
var callConfigure = rpc.declare({ object: "tidynet", method: "configure", params: [ "payload" ], expect: {} });
var callAction = rpc.declare({ object: "tidynet", method: "action", params: [ "operation", "section" ], expect: {} });
var callResolve = rpc.declare({ object: "tidynet", method: "resolve", params: [ "domain" ], expect: {} });

return view.extend({
	load: function() {
		return Promise.all([
			callStatus().catch(function() { return { error: "无法连接 TidyNet 服务" }; }),
			callSettings().catch(function() { return {}; }),
			callStats().catch(function() { return { connected: false }; }),
			callProxyStatus().catch(function() { return { connected: false }; })
		]).then(function(result) { return { status: result[0] || {}, settings: result[1] || {}, stats: result[2] || {}, proxies: result[3] || { connected: false } }; });
	},

	notify: function(message, isError) {
		ui.addNotification(null, E("p", {}, [ message || (isError ? "操作失败" : "已完成") ]), isError ? "error" : "info");
	},

	action: function(operation, section) {
		var self = this;
		return callAction(operation, section || "").then(function(result) {
			if (!result || !result.ok) { self.notify(result && result.error, true); return; }
			self.notify(result.message || "任务已提交");
			return self.refresh();
		}).catch(function() { self.notify("路由器没有响应，请检查连接", true); });
	},

	configure: function(payload) {
		var self = this;
		return callConfigure(JSON.stringify(payload)).then(function(result) {
			if (!result || !result.ok) { self.notify(result && result.error, true); return; }
			self.notify(result.message || "设置已保存");
			if (result.accepted) window.setTimeout(function() { self.refresh(); }, 1000);
			else self.refresh();
		}).catch(function() { self.notify("保存失败：路由器没有响应", true); });
	},

	refresh: function() {
		var self = this;
		return Promise.all([
			callStatus().catch(function() { return self.data.status; }),
			callSettings().catch(function() { return self.data.settings; }),
			callStats().catch(function() { return self.data.stats; }),
			callProxyStatus().catch(function() { return self.data.proxies || { connected: false }; })
		]).then(function(result) {
			self.data = { status: result[0] || {}, settings: result[1] || {}, stats: result[2] || {}, proxies: result[3] || { connected: false } };
			var old = document.querySelector(".tidynet");
			if (old) old.replaceWith(self.render(self.data));
		});
	},

	selectProxy: function(group, member) {
		var self = this;
		return callProxySelect(group, member).then(function(result) {
			if (!result || !result.ok) { self.notify(result && result.error, true); return; }
			self.notify(result.message || "已切换代理"); return self.refresh();
		}).catch(function() { self.notify("切换失败：无法连接 Mihomo 本机控制器", true); });
	},

	form: function(title, definitions, submitLabel, submit) {
		var fields = {}, body = [];
		definitions.forEach(function(def) {
			var control;
			if (def.type === "select") {
				control = E("select", { "class": "tn-input", name: def.id }, def.options.map(function(option) {
					return E("option", { value: option[0], selected: option[0] === String(def.value) }, [ option[1] ]);
				}));
			}
			else if (def.type === "textarea") {
				control = E("textarea", { "class": "tn-input tn-textarea", name: def.id, rows: def.rows || 5 }, [ def.value || "" ]);
			}
			else {
				control = E("input", { "class": "tn-input", name: def.id, type: def.type || "text", value: def.value || "", placeholder: def.placeholder || "", autocomplete: "off" });
			}
			fields[def.id] = control;
			body.push(E("label", { "class": "tn-field" }, [ E("span", {}, [ def.label ]), control, def.hint ? E("small", { "class": "tn-help" }, [ def.hint ]) : "" ]));
		});
		ui.showModal(title, [ E("div", { "class": "tn-form" }, body) ], E("div", { "class": "tn-modal-actions" }, [
			E("button", { "class": "cbi-button", click: function() { ui.hideModal(); } }, [ "取消" ]),
			E("button", { "class": "cbi-button cbi-button-action", click: ui.createHandlerFn(this, function() {
				var values = {};
				Object.keys(fields).forEach(function(key) { values[key] = fields[key].value; });
				ui.hideModal(); return submit(values);
			}) }, [ submitLabel || "保存" ])
		]));
	},

	confirm: function(title, detail, yes, operation, section) {
		var self = this;
		ui.showModal(title, [ E("p", { "class": "tn-confirm-copy" }, [ detail ]) ], E("div", { "class": "tn-modal-actions" }, [
			E("button", { "class": "cbi-button", click: function() { ui.hideModal(); } }, [ "取消" ]),
			E("button", { "class": "cbi-button cbi-button-action", click: ui.createHandlerFn(this, function() {
				ui.hideModal(); return self.action(operation, section);
			}) }, [ yes ])
		]));
	},

	removeConfigured: function(title, detail, operation, id) {
		var self = this;
		ui.showModal(title, [ E("p", { "class": "tn-confirm-copy" }, [ detail ]) ], E("div", { "class": "tn-modal-actions" }, [
			E("button", { "class": "cbi-button", click: function() { ui.hideModal(); } }, [ "取消" ]),
			E("button", { "class": "cbi-button tn-danger", click: ui.createHandlerFn(this, function() {
				ui.hideModal(); return self.configure({ operation: operation, id: id });
			}) }, [ "删除" ])
		]));
	},

	editSubscription: function(item) {
		var self = this;
		this.form(item ? "编辑订阅" : "添加订阅", [
			{ id: "name", label: "显示名称", value: item ? item.name : "", placeholder: "例如：我的订阅" },
			{ id: "url", label: "订阅地址", type: "url", value: "", placeholder: item && item.url_set ? "已保存；留空保持原地址" : "https://", hint: "首版支持完整 Mihomo/Clash YAML 配置；订阅 URL 不会返回浏览器。" },
			{ id: "format", label: "订阅格式", type: "select", value: item ? item.format : "clash-yaml", options: [ [ "clash-yaml", "Clash YAML" ], [ "mihomo-yaml", "Mihomo YAML" ] ] }
		], "保存订阅", function(values) {
			if (!values.name.trim() || (!values.url.trim() && !(item && item.url_set))) { self.notify("请填写名称和订阅地址", true); return; }
			self.configure({ operation: "subscription-save", id: item ? item.id : "", name: values.name.trim(), url: values.url.trim(), format: values.format });
		});
	},

	editSource: function(item) {
		var self = this;
		this.form(item ? "编辑广告规则源" : "添加广告规则源", [
			{ id: "name", label: "规则源名称", value: item ? item.name : "" },
			{ id: "url", label: "规则地址", type: "url", value: "", placeholder: item && item.url_set ? "已保存；留空保持原地址" : "https://" },
			{ id: "format", label: "文件格式", type: "select", value: item ? item.format : "hosts", options: [ [ "hosts", "Hosts 列表" ], [ "domains", "纯域名列表" ] ] },
			{ id: "action", label: "规则用途", type: "select", value: item ? item.action : "block", options: [ [ "block", "拦截" ], [ "allow", "允许" ] ] },
			{ id: "enabled", label: "启用", type: "select", value: item && item.enabled === false ? "0" : "1", options: [ [ "1", "启用" ], [ "0", "停用" ] ] }
		], "保存规则源", function(values) {
			if (!values.name.trim() || (!values.url.trim() && !(item && item.url_set))) { self.notify("请填写规则源名称和地址", true); return; }
			self.configure({ operation: "source-save", id: item ? item.id : "", name: values.name.trim(), url: values.url.trim(), format: values.format, action: values.action, enabled: values.enabled });
		});
	},

	manageDomains: function(settings) {
		var self = this;
		this.form("自定义域名", [
			{ id: "allowed", label: "允许域名（每行一个）", type: "textarea", rows: 6, value: settings.allowed_domains || "" },
			{ id: "blocked", label: "拦截域名（每行一个）", type: "textarea", rows: 6, value: settings.blocked_domains || "" }
		], "保存域名", function(values) { return self.configure({ operation: "domains-save", allowed: values.allowed, blocked: values.blocked }); });
	},

	manageSources: function(sources, busy) {
		var self = this;
		var rows = (sources || []).map(function(source) {
			return E("div", { "class": "tn-source-manage-row" }, [
				E("div", {}, [ E("strong", {}, [ source.name || source.id ]), E("small", {}, [ source.action === "allow" ? "允許列表" : "拦截列表" ]) ]),
				E("div", { "class": "tn-row-buttons" }, [
					E("button", { "class": "tn-link-btn", disabled: busy, click: ui.createHandlerFn(self, function() { self.editSource(source); }) }, [ "编辑" ]),
					E("button", { "class": "tn-link-btn", disabled: busy, click: ui.createHandlerFn(self, function() { return self.action("adblock-update", source.id); }) }, [ "更新" ]),
					E("button", { "class": "tn-link-btn tn-delete-link", disabled: busy, click: ui.createHandlerFn(self, function() { self.removeConfigured("删除规则源", "确定删除“%s”？".format(source.name), "source-delete", source.id); }) }, [ "删除" ])
				])
			]);
		});
		ui.showModal("广告规则源", [ E("div", { "class": "tn-source-manage" }, rows.length ? rows : [ E("p", { "class": "tn-muted" }, [ "暂无规则源" ]) ]) ], E("div", { "class": "tn-modal-actions" }, [ E("button", { "class": "cbi-button", click: function() { ui.hideModal(); } }, [ "关闭" ]) ]));
	},

	manageDns: function(settings) {
		var self = this;
		this.form("DNS 设置", [
			{ id: "enabled", label: "系统 DNS 接入", type: "select", value: settings.dns_enabled ? "1" : "0", options: [ [ "0", "关闭" ], [ "1", "启用 TidyNet DNS" ] ], hint: "启用后 dnsmasq 将把 LAN DNS 上游转发到 TidyNet Mihomo DNS；关闭时撤销 TidyNet 自己添加的配置。" },
			{ id: "mode", label: "解析模式", type: "select", value: settings.dns_mode || "redir-host", options: [ [ "redir-host", "真实 IP（redir-host）" ], [ "fake-ip", "Fake IP" ] ] },
			{ id: "ipv6", label: "IPv6 解析", type: "select", value: settings.dns_ipv6 ? "1" : "0", options: [ [ "0", "关闭" ], [ "1", "开启" ] ] },
			{ id: "upstreams", label: "DNS 上游（每行一个）", type: "textarea", rows: 5, value: settings.dns_upstreams || "223.5.5.5\nhttps://dns.alidns.com/dns-query", hint: "dnsmasq 继续为 LAN 和 DHCP 提供服务；TidyNet Mihomo DNS 使用独立的 127.0.0.1:10535 端口。" }
		], "保存设置", function(values) {
			if (values.enabled === "1" && !settings.dns_enabled) {
				ui.showModal("启用 TidyNet DNS", [ E("p", { "class": "tn-confirm-copy" }, [ "这会将 dnsmasq 上游切换到 TidyNet 本机 DNS，并记录原 noresolv 设置以便关闭时恢复。请确认没有其它插件同时管理全局 DNS 上游。" ]) ], E("div", { "class": "tn-modal-actions" }, [
					E("button", { "class": "cbi-button", click: function() { ui.hideModal(); } }, [ "取消" ]),
					E("button", { "class": "cbi-button cbi-button-action", click: ui.createHandlerFn(self, function() {
						ui.hideModal(); return self.configure({ operation: "dns-save", enabled: values.enabled, mode: values.mode, ipv6: values.ipv6, upstreams: values.upstreams });
					}) }, [ "启用并保存" ])
				]));
				return;
			}
			return self.configure({ operation: "dns-save", enabled: values.enabled, mode: values.mode, ipv6: values.ipv6, upstreams: values.upstreams });
		});
	},

	manageSettings: function(settings) {
		var self = this;
		this.form("面板设置", [
			{ id: "dashboard_url", label: "Mihomo WebUI 地址", type: "url", value: settings.dashboard_url || "", placeholder: "http://192.168.1.8:9090/ui/", hint: "填写浏览器可访问的 Mihomo WebUI；控制接口由该面板按自身设置连接。" }
		], "保存设置", function(values) { return self.configure({ operation: "settings-save", url: values.dashboard_url.trim() }); });
	},

	render: function(data) {
		var self = this;
		this.data = data || this.data || {};
		var s = this.data.status || {}, settings = this.data.settings || {}, stats = this.data.stats || {}, proxyState = this.data.proxies || {};
		var mihomo = s.mihomo || {}, ad = s.adblock || {}, dns = s.dns || {}, subs = settings.subscriptions || [], sources = settings.sources || [];
		var proxyGroups = [];
		if (proxyState.connected && proxyState.data) {
			try {
				var apiProxies = JSON.parse(proxyState.data).proxies || {};
				proxyGroups = Object.keys(apiProxies).map(function(name) { return apiProxies[name]; }).filter(function(group) {
					return Array.isArray(group.all) && group.all.length > 0 && group.type !== "LoadBalance";
				});
			}
			catch (e) { proxyGroups = []; }
		}
		var root = E("main", { "class": "tidynet" });
		var busy = !!s.busy;
		root.appendChild(E("header", { "class": "tn-header" }, [
			E("div", { "class": "tn-brand" }, [ E("span", { "class": "tn-mark" }, [ "T" ]), E("div", {}, [ E("h2", {}, [ "TidyNet" ]), E("p", {}, [ "代理、DNS 与广告过滤，一处管理" ]) ]) ]),
			E("div", { "class": "tn-header-actions" }, [
				settings.dashboard_url ? E("a", { "class": "cbi-button", href: settings.dashboard_url, target: "_blank", rel: "noopener noreferrer" }, [ "打开 Mihomo 面板 ↗" ]) : "",
				E("button", { "class": "cbi-button", click: ui.createHandlerFn(this, function() { self.manageSettings(settings); }) }, [ "面板设置" ]),
				E("button", { "class": "cbi-button", disabled: busy, click: ui.createHandlerFn(this, function() { return self.refresh(); }) }, [ "刷新状态" ])
			])
		]));

		var stateText = mihomo.running ? "运行中" : (mihomo.installed ? "已停止" : "尚未下载核心");
		root.appendChild(E("section", { "class": "tn-card tn-hero" }, [
			E("div", { "class": "tn-hero-copy" }, [ E("div", { "class": "tn-eyebrow" }, [ "MIHOMO CORE" ]),
				E("div", { "class": "tn-status" }, [ E("i", { "class": "tn-dot " + (mihomo.running ? "ok" : "muted") }), E("strong", {}, [ stateText ]) ]),
				E("p", {}, [ "TidyNet 自行管理 Mihomo 服务和核心文件，不需要 Nikki。" ]),
				E("small", { "class": "tn-core-version" }, [ mihomo.core_version || "核心尚未安装" ])
			]),
			E("div", { "class": "tn-hero-actions" }, [
				E("button", { "class": "cbi-button cbi-button-action", disabled: busy, click: ui.createHandlerFn(this, function() {
					self.confirm(mihomo.core_installed ? "下载并更新 Mihomo 核心" : "下载 Mihomo 核心", "从 Mihomo 官方发布页获取适配本机架构的核心，校验 SHA-256 后安装。", mihomo.core_installed ? "更新核心" : "下载核心", "mihomo-core-update");
				}) }, [ mihomo.core_installed ? "下载 / 更新核心" : "下载核心" ]),
				mihomo.installed ? E("button", { "class": "cbi-button", disabled: busy, click: ui.createHandlerFn(this, function() { return self.action(mihomo.running ? "mihomo-reload" : "mihomo-start"); }) }, [ mihomo.running ? "重载配置" : "启动 Mihomo" ]) : "",
				mihomo.running ? E("button", { "class": "cbi-button tn-danger", disabled: busy, click: ui.createHandlerFn(this, function() { self.confirm("停止 Mihomo", "这会停止 TidyNet 管理的代理核心。", "停止", "mihomo-stop"); }) }, [ "停止" ]) : ""
			])
		]));

		var subRows = subs.map(function(item) {
			return E("article", { "class": "tn-list-row" }, [
				E("div", { "class": "tn-row-main" }, [ E("span", { "class": "tn-mini-icon" }, [ "↗" ]), E("div", {}, [ E("strong", {}, [ item.name || "未命名订阅" ]), E("small", {}, [ item.active ? "当前使用" : (item.updated || "尚未更新") ]) ]) ]),
				E("div", { "class": "tn-row-buttons" }, [
					E("button", { "class": "tn-link-btn", disabled: busy, click: ui.createHandlerFn(self, function() { self.editSubscription(item); }) }, [ "编辑" ]),
					E("button", { "class": "tn-link-btn", disabled: busy || !mihomo.core_installed, click: ui.createHandlerFn(self, function() { return self.action("subscription-update", item.id); }) }, [ "更新" ]),
					E("button", { "class": "tn-link-btn", disabled: busy || !mihomo.core_installed || item.active, click: ui.createHandlerFn(self, function() { return self.action("subscription-use", item.id); }) }, [ item.active ? "使用中" : "更新并应用" ]),
					E("button", { "class": "tn-link-btn tn-delete-link", disabled: busy || item.active, click: ui.createHandlerFn(self, function() { self.removeConfigured("删除订阅", "确定删除“%s”？".format(item.name), "subscription-delete", item.id); }) }, [ "删除" ])
				])
			]);
		});
		var subCard = E("section", { "class": "tn-card" }, [
			E("div", { "class": "tn-card-head" }, [ E("div", {}, [ E("span", { "class": "tn-eyebrow" }, [ "PROFILES" ]), E("h3", {}, [ "订阅管理" ]) ]), E("button", { "class": "cbi-button cbi-button-action", disabled: busy, click: ui.createHandlerFn(this, function() { self.editSubscription(null); }) }, [ "＋ 添加订阅" ]) ]),
			subRows.length ? E("div", { "class": "tn-list" }, subRows) : E("div", { "class": "tn-empty" }, [ "还没有订阅，添加 Mihomo/Clash YAML 地址即可。" ])
		]);

		var sourceRows = sources.slice(0, 4).map(function(source) {
			return E("div", { "class": "tn-source-row" }, [ E("span", { "class": "tn-source-dot " + (source.enabled === false ? "off" : "") }), E("span", {}, [ source.name || source.id ]), E("small", {}, [ source.action === "allow" ? "允许" : "拦截" ]) ]);
		});
		var adCard = E("section", { "class": "tn-card tn-ad-card" }, [
			E("div", { "class": "tn-card-head" }, [ E("div", {}, [ E("span", { "class": "tn-eyebrow" }, [ "DNS FILTER" ]), E("h3", {}, [ "广告拦截" ]) ]), E("span", { "class": "tn-pill " + (ad.enabled ? "pill-on" : "") }, [ ad.enabled ? "已启用" : "已暂停" ]) ]),
			E("div", { "class": "tn-metrics" }, [
				E("div", { "class": "tn-metric tn-metric-primary" }, [ E("span", {}, [ "实际拦截请求" ]), E("strong", {}, [ stats.blocked == null ? "—" : Number(stats.blocked).toLocaleString() ]), E("small", {}, [ stats.connected ? ("总 DNS 查询 " + Number(stats.queries || 0).toLocaleString() + " · " + (stats.time_units || "")) : (stats.time_units || "启用过滤后开始统计") ]) ]),
				E("div", { "class": "tn-metric" }, [ E("span", {}, [ "规则域名" ]), E("strong", {}, [ ad.blocked_domains == null ? "0" : Number(ad.blocked_domains).toLocaleString() ]), E("small", {}, [ "规则覆盖量，不代表拦截请求" ]) ]),
				E("div", { "class": "tn-metric" }, [ E("span", {}, [ "规则源" ]), E("strong", {}, [ String(ad.enabled_sources || 0) ]), E("small", {}, [ "TidyNet 本地管理" ]) ])
			]),
			E("div", { "class": "tn-sources" }, sourceRows.length ? sourceRows : [ E("p", { "class": "tn-muted" }, [ "暂无规则源" ]) ]),
			E("div", { "class": "tn-card-actions" }, [
				E("button", { "class": "cbi-button", disabled: busy, click: ui.createHandlerFn(this, function() { self.editSource(null); }) }, [ "添加规则源" ]),
				E("button", { "class": "cbi-button", disabled: busy, click: ui.createHandlerFn(this, function() { self.manageSources(sources, busy); }) }, [ "管理列表" ]),
				E("button", { "class": "cbi-button", disabled: busy || !ad.enabled, click: ui.createHandlerFn(this, function() { return self.action("adblock-update"); }) }, [ "更新规则" ]),
				E("button", { "class": "cbi-button", disabled: busy, click: ui.createHandlerFn(this, function() { self.manageDomains(settings); }) }, [ "自定义域名" ]),
				E("button", { "class": "cbi-button cbi-button-action", disabled: busy, click: ui.createHandlerFn(this, function() {
					if (ad.enabled) return self.action("adblock-stop");
					self.confirm("启用广告过滤和统计", "TidyNet 会把拦截域名接入 dnsmasq，并启用本机 DNS 查询日志来累计拦截数与查询数。TidyNet 持久保存汇总计数；dnsmasq 系统日志可能短暂包含查询域名和来源地址，保留时长由系统日志设置决定。使用路由器以外的 DoH/DoT 的客户端无法纳入统计。", "启用", "adblock-start");
				}) }, [ ad.enabled ? "暂停过滤" : "启用过滤" ])
			]),
			E("p", { "class": "tn-footnote" }, [ "实际拦截数由 dnsmasq 查询日志统计；规则域名数仅表示覆盖范围。" ]),
			ad.last_update ? E("p", { "class": "tn-footnote" }, [ "最近更新：" + ad.last_update ]) : ""
		]);
		root.appendChild(E("div", { "class": "tn-dashboard-grid" }, [ subCard, adCard ]));

		var proxyRows = proxyGroups.map(function(group) {
			var selected = group.now || group.fixed || "";
			var selector = E("select", { "class": "tn-input tn-proxy-select", disabled: busy, change: ui.createHandlerFn(self, function(ev) {
				if (ev.target.value && ev.target.value !== selected) return self.selectProxy(group.name, ev.target.value);
			}) }, group.all.map(function(member) {
				return E("option", { value: member, selected: member === selected }, [ member ]);
			}));
			return E("div", { "class": "tn-proxy-row" }, [
				E("div", { "class": "tn-proxy-group-name" }, [ E("strong", {}, [ group.name || "代理策略" ]), E("small", {}, [ group.type || "策略组" ]) ]),
				selector
			]);
		});
		root.appendChild(E("section", { "class": "tn-card tn-proxy-card" }, [
			E("div", { "class": "tn-card-head" }, [ E("div", {}, [ E("span", { "class": "tn-eyebrow" }, [ "MIHOMO CONTROL" ]), E("h3", {}, [ "代理策略" ]) ]), E("span", { "class": "tn-pill " + (proxyState.connected ? "pill-on" : "") }, [ proxyState.connected ? "已连接" : "未连接" ]) ]),
			proxyRows.length ? E("div", { "class": "tn-proxy-list" }, proxyRows) : E("div", { "class": "tn-empty" }, [ proxyState.connected ? "当前配置没有可切换的代理策略组。" : "启动 Mihomo 后，可在这里切换代理策略。控制接口仅由路由器本机访问。" ])
		]));

		var dnsCard = E("section", { "class": "tn-card tn-dns-card" }, [
			E("div", { "class": "tn-card-head" }, [ E("div", {}, [ E("span", { "class": "tn-eyebrow" }, [ "DNS" ]), E("h3", {}, [ "解析设置" ]) ]), E("span", { "class": "tn-dns-value" }, [ dns.listen || "127.0.0.1:10535" ]) ]),
			E("p", { "class": "tn-help" }, [ "解析模式：" + (dns.mode || "redir-host") + " · IPv6：" + (dns.ipv6 ? "开启" : "关闭") + " · 系统接入：" + (dns.enabled ? "已启用" : "关闭") ]),
			E("p", { "class": "tn-help" }, [ "关闭时会移除 TidyNet 添加的 dnsmasq 上游，并尝试恢复原 noresolv 设置。" ]),
			E("div", { "class": "tn-card-actions" }, [
				E("button", { "class": "cbi-button", click: ui.createHandlerFn(this, function() { self.manageDns(settings); }) }, [ "DNS 设置" ]),
				E("button", { "class": "cbi-button", click: ui.createHandlerFn(this, function() { self.openDns(); }) }, [ "解析测试" ])
			])
		]);
		root.appendChild(dnsCard);

		var job = s.job || {};
		if (job.state === "running") root.appendChild(E("div", { "class": "tn-job tn-job-running" }, [ "◌  " + (job.message || "后台任务进行中") ]));
		else if (job.state === "error") root.appendChild(E("div", { "class": "tn-job tn-job-error" }, [ "！  " + (job.message || "后台任务失败"), " · ", job.time || "" ]));
		else if (job.state === "success") root.appendChild(E("div", { "class": "tn-job tn-job-success" }, [ "✓  " + (job.message || "后台任务已完成"), " · ", job.time || "" ]));
		root.appendChild(E("footer", { "class": "tn-footer" }, [ "TidyNet 独立管理 Mihomo、DNS 和广告规则" ]));
		if (!this.timer) this.timer = window.setInterval(function() {
			if (document.querySelector(".tidynet") && !document.querySelector(".modal") && !document.hidden) self.refresh();
		}, 10000);
		return root;
	},

	openDns: function() {
		var input = E("input", { "class": "tn-input", value: "", placeholder: "example.com" });
		var output = E("pre", { "class": "tn-resolve-output" }, [ "查询路由器本机 DNS" ]);
		ui.showModal("DNS 解析测试", [ E("div", { "class": "tn-form" }, [
			E("label", { "class": "tn-field" }, [ E("span", {}, [ "输入域名" ]), input ]),
			E("button", { "class": "cbi-button cbi-button-action", click: ui.createHandlerFn(this, function() {
				return callResolve(input.value.trim()).then(function(result) { output.textContent = (result.resolver ? "查询路径：" + result.resolver + "\n\n" : "") + (result.output || result.error || "没有结果"); });
			}) }, [ "开始查询" ]), output
		]) ], E("div", { "class": "tn-modal-actions" }, [ E("button", { "class": "cbi-button", click: function() { ui.hideModal(); } }, [ "关闭" ]) ]));
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
