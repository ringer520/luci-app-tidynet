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
var callConfigure = rpc.declare({ object: "tidynet", method: "configure", params: ["payload"], expect: {} });
var callAction = rpc.declare({ object: "tidynet", method: "action", params: ["operation", "section"], expect: {} });
var callResolve = rpc.declare({ object: "tidynet", method: "resolve", params: ["domain"], expect: {} });

return view.extend({
	load: function() {
		return Promise.all([
			callStatus().catch(function() { return { error: _("无法连接路由器服务") }; }),
			callSettings().catch(function() { return {}; }),
			callStats().catch(function() { return { connected: false, error: _("统计暂不可用") }; })
		]).then(function(results) {
			return { status: results[0] || {}, settings: results[1] || {}, stats: results[2] || {} };
		});
	},

	notify: function(message, isError) {
		ui.addNotification(null, E("p", {}, [ message || (isError ? _("操作失败") : _("已完成")) ]), isError ? "error" : "info");
	},

	action: function(operation, section) {
		var self = this;
		return callAction(operation, section || "").then(function(result) {
			if (!result || !result.ok) {
				self.notify(result && result.error, true);
				return self.refresh();
			}
			self.notify(result.message || _("任务已提交"));
			return self.refresh();
		}).catch(function() {
			self.notify(_("路由器没有响应，请检查连接"), true);
		});
	},

	configure: function(payload, successMessage) {
		var self = this;
		return callConfigure(JSON.stringify(payload)).then(function(result) {
			if (!result || !result.ok) {
				self.notify(result && result.error, true);
				return;
			}
			self.notify(result.message || successMessage || _("设置已保存"));
			if (result.accepted)
				window.setTimeout(function() { self.refresh(); }, 1000);
			else self.refresh();
		}).catch(function() {
			self.notify(_("保存失败：路由器没有响应"), true);
		});
	},

	refresh: function() {
		var self = this;
		return Promise.all([
			callStatus().catch(function() { return this.data.status; }.bind(this)),
			callSettings().catch(function() { return this.data.settings; }.bind(this)),
			callStats().catch(function() { return { connected: false, error: _("统计暂不可用") }; })
		]).then(function(results) {
			self.data = { status: results[0] || {}, settings: results[1] || {}, stats: results[2] || {} };
			var old = document.querySelector(".tidynet");
			if (old) old.replaceWith(self.render(self.data));
		});
	},

	form: function(title, definitions, submitLabel, submit) {
		var self = this, fields = {}, body = [];
		definitions.forEach(function(def) {
			var control;
			if (def.type === "select") {
				control = E("select", { "class": "tn-input", "name": def.id }, def.options.map(function(option) {
					return E("option", { value: option[0], selected: option[0] === def.value }, [ option[1] ]);
				}));
			}
			else if (def.type === "textarea") {
				control = E("textarea", { "class": "tn-input tn-textarea", "name": def.id, rows: def.rows || 5 }, [ def.value || "" ]);
			}
			else {
				control = E("input", { "class": "tn-input", "name": def.id, type: def.type || "text", value: def.value || "", placeholder: def.placeholder || "", autocomplete: "off" });
			}
			fields[def.id] = control;
			body.push(E("label", { "class": "tn-field" }, [
				E("span", {}, [ def.label ]),
				control,
				def.hint ? E("small", { "class": "tn-help" }, [ def.hint ]) : ""
			]));
		});
		var footer = E("div", { "class": "tn-modal-actions" }, [
			E("button", { "class": "cbi-button", "click": function() { ui.hideModal(); } }, [ _("取消") ]),
			E("button", { "class": "cbi-button cbi-button-action", "click": ui.createHandlerFn(this, function() {
				var values = {};
				Object.keys(fields).forEach(function(key) { values[key] = fields[key].value; });
				ui.hideModal();
				return submit(values);
			}) }, [ submitLabel || _("保存") ])
		]);
		ui.showModal(title, [ E("div", { "class": "tn-form" }, body) ], footer);
	},

	confirm: function(title, detail, yes, operation, section, positive) {
		var self = this;
		ui.showModal(title, [
			E("p", { "class": "tn-confirm-copy" }, [ detail ]),
			E("div", { "class": "tn-modal-actions" }, [
				E("button", { "class": "cbi-button", "click": function() { ui.hideModal(); } }, [ _("取消") ]),
				E("button", { "class": "cbi-button " + (positive ? "cbi-button-action" : "cbi-button-negative"), "click": ui.createHandlerFn(this, function() {
					ui.hideModal(); return self.action(operation, section);
				}) }, [ yes ])
			])
		]);
	},

	editSubscription: function(item) {
		var self = this;
		this.form(item ? _("编辑订阅") : _("添加订阅"), [
			{ id: "name", label: _("显示名称"), value: item ? item.name : "", placeholder: _("例如：我的订阅") },
			{ id: "url", label: _("订阅地址"), type: "password", value: "", placeholder: item ? _("留空则保持现有地址") : "https://", hint: _("订阅地址只写入路由器，不会返回给浏览器。") },
			{ id: "prefer", label: _("合并配置优先级"), type: "select", value: item ? item.prefer : "remote", options: [ [ "remote", _("订阅配置优先") ], [ "local", _("本地配置优先") ] ] }
		], _("保存订阅"), function(values) {
			if (!values.url && !item) { self.notify(_("请填写订阅地址"), true); return; }
			self.configure({ operation: "subscription-save", id: item ? item.id : "", name: values.name.trim(), url: values.url.trim(), prefer: values.prefer });
		});
	},

	editSource: function(source) {
		var self = this;
		this.form(source ? _("编辑广告规则源") : _("添加广告规则源"), [
			{ id: "name", label: _("规则源名称"), value: source ? source.name : "" },
			{ id: "url", label: _("规则列表地址"), type: "password", value: "", placeholder: source ? _("留空则保持现有地址") : "https://", hint: _("规则源链接可能包含访问令牌，只会保存在路由器。") },
			{ id: "action", label: _("规则用途"), type: "select", value: source ? source.action : "block", options: [ [ "block", _("拦截列表") ], [ "allow", _("允许列表") ] ] },
			{ id: "enabled", label: _("启用"), type: "select", value: source && source.enabled === false ? "0" : "1", options: [ [ "1", _("启用") ], [ "0", _("停用") ] ] }
		], _("保存规则源"), function(values) {
			if (!values.url && !source) { self.notify(_("请填写规则列表地址"), true); return; }
			self.configure({ operation: "source-save", id: source ? source.id : "", name: values.name.trim(), url: values.url.trim(), action: values.action, enabled: values.enabled });
		});
	},

	removeConfigured: function(title, detail, operation, id) {
		var self = this;
		ui.showModal(title, [
			E("p", { "class": "tn-confirm-copy" }, [ detail ]),
			E("div", { "class": "tn-modal-actions" }, [
				E("button", { "class": "cbi-button", "click": function() { ui.hideModal(); } }, [ _("取消") ]),
				E("button", { "class": "cbi-button cbi-button-negative", "click": ui.createHandlerFn(this, function() {
					ui.hideModal(); return self.configure({ operation: operation, id: id });
				}) }, [ _("删除") ])
			])
		]);
	},

	manageSources: function(settings) {
		var self = this;
		var sources = settings.sources || [];
		var list = sources.map(function(source) {
			return E("div", { "class": "tn-source-manage-row" }, [
				E("div", {}, [ E("strong", {}, [ source.name || source.id ]), E("small", {}, [ source.action === "allow" ? _("允许列表") : _("拦截列表") ]) ]),
				E("div", { "class": "tn-row-buttons" }, [
					E("button", { "class": "tn-link-btn", "click": ui.createHandlerFn(self, function() { self.editSource(source); }) }, [ _("编辑") ]),
					E("button", { "class": "tn-link-btn tn-delete-link", "click": ui.createHandlerFn(self, function() {
						self.removeConfigured(_("删除规则源"), _("删除“%s”？").format(source.name || source.id), "source-delete", source.id);
					}) }, [ _("删除") ])
				])
			]);
		});
		ui.showModal(_("管理广告规则源"), [
			E("div", { "class": "tn-source-manage" }, list.length ? list : [ E("p", { "class": "tn-muted" }, [ _("暂无规则源。") ]) ])
		], E("div", { "class": "tn-modal-actions" }, [
			E("button", { "class": "cbi-button", "click": function() { ui.hideModal(); } }, [ _("关闭") ]),
			E("button", { "class": "cbi-button cbi-button-action", "click": ui.createHandlerFn(this, function() { self.editSource(null); }) }, [ _("＋ 添加规则源") ])
		]));
	},

	saveDomains: function(settings) {
		var self = this;
		this.form(_("自定义域名规则"), [
			{ id: "blocked", label: _("拦截域名（每行一个）"), type: "textarea", rows: 6, value: settings.blocked_domains || "", hint: _("例如 ads.example.com。") },
			{ id: "allowed", label: _("允许域名（每行一个）"), type: "textarea", rows: 6, value: settings.allowed_domains || "", hint: _("允许规则优先级由 adblock-fast 决定。") }
		], _("保存并应用"), function(values) {
			self.configure({ operation: "domains-save", blocked: values.blocked.trim(), allowed: values.allowed.trim() });
		});
	},

	saveDns: function(settings, status) {
		var self = this;
		var servers = settings.nameservers || [];
		var dnsGroups = servers.map(function(item) {
			return { id: item.id, type: item.type, enabled: item.enabled, servers: item.servers };
		});
		var lines = dnsGroups.map(function(group) {
			var label = group.type === "default-nameserver" ? _("默认引导解析") : (group.type === "proxy-server-nameserver" ? _("代理域名解析") : (group.type === "direct-nameserver" ? _("直连域名解析") : _("常规解析")));
			return E("div", { "class": "tn-upstream-row" }, [
				E("div", {}, [ E("strong", {}, [ label ]), E("small", {}, [ (group.servers || "").split("\n").filter(Boolean).join(" · ") || _("未设置") ]) ]),
				E("button", { "class": "cbi-button", "click": ui.createHandlerFn(this, function() { self.editNameserver(group); }) }, [ _("编辑") ])
			]);
		});
		var dnsForm = [
			{ id: "mode", label: _("解析模式"), type: "select", value: settings.dns_mode || "fake-ip", options: [ [ "fake-ip", _("Fake-IP") ], [ "redir-host", _("真实地址") ] ] },
			{ id: "ipv6", label: _("Mihomo DNS IPv6"), type: "select", value: settings.dns_ipv6 === false ? "0" : "1", options: [ [ "1", _("启用") ], [ "0", _("关闭") ] ] },
			{ id: "override", label: _("使用上方上游配置"), type: "select", value: settings.dns_override === false ? "0" : "1", options: [ [ "1", _("启用") ], [ "0", _("由订阅接管") ] ] }
		];
		ui.showModal(_("DNS 设置与诊断"), [
			E("div", { "class": "tn-form" }, [
				E("p", { "class": "tn-help" }, [ _("DNS 由 Nikki/Mihomo 与系统 dnsmasq 协作。保存会重载已启用的 Nikki。") ]),
				E("div", { "class": "tn-upstreams" }, [ E("strong", {}, [ _("上游服务器组") ]) ].concat(lines.length ? lines : [ E("p", { "class": "tn-muted" }, [ _("未检测到 Nikki DNS 上游组。") ]) ])),
				E("button", { "class": "cbi-button", "click": ui.createHandlerFn(this, function() {
					self.form(_("DNS 工作模式"), dnsForm, _("保存并应用"), function(values) {
						self.configure({ operation: "dns-save", mode: values.mode, ipv6: values.ipv6, override: values.override });
					});
				}) }, [ _("配置 Mihomo DNS") ]),
				E("div", { "class": "tn-dns-test" }, [
					E("label", {}, [ _("域名解析诊断") ]),
					E("input", { "class": "tn-input", id: "tn-resolve-domain", value: "", placeholder: "example.com" }),
					E("button", { "class": "cbi-button", "click": ui.createHandlerFn(this, function() {
						var input = document.getElementById("tn-resolve-domain"), output = document.getElementById("tn-resolve-output");
						return callResolve(input.value.trim()).then(function(result) {
							output.textContent = result.output || result.error || _("未收到解析结果");
						});
					}) }, [ _("测试路由器解析") ]),
					E("pre", { id: "tn-resolve-output", "class": "tn-resolve-output" }, [ _("查询使用路由器本机的 127.0.0.1:53。") ])
				])
			])
		], E("div", { "class": "tn-modal-actions" }, [
			E("button", { "class": "cbi-button", "click": function() { ui.hideModal(); } }, [ _("关闭") ])
		]));
	},

	editNameserver: function(group) {
		var self = this;
		this.form(_("编辑 DNS 上游组"), [
			{ id: "servers", label: _("上游地址（每行一个）"), type: "textarea", rows: 5, value: group.servers || "", hint: _("支持 IP、https://DoH、tls://DoT、tcp:// 和 quic://。") },
			{ id: "enabled", label: _("启用此组"), type: "select", value: group.enabled === false ? "0" : "1", options: [ [ "1", _("启用") ], [ "0", _("停用") ] ] }
		], _("保存上游"), function(values) {
			self.configure({ operation: "nameserver-save", id: group.id, servers: values.servers.trim(), enabled: values.enabled });
		});
	},

	saveIntegration: function(settings) {
		var self = this;
		this.form(_("面板与拦截统计"), [
			{ id: "dashboard_url", label: _("Mihomo 面板地址（可留空自动探测）"), type: "url", value: settings.dashboard_url || "", placeholder: "http://192.168.1.1:9090/ui/" },
			{ id: "enabled", label: _("读取 AdGuard Home 请求统计"), type: "select", value: settings.agh_enabled ? "1" : "0", options: [ [ "0", _("关闭") ], [ "1", _("开启") ] ], hint: _("只从路由器本机 127.0.0.1 读取控制接口，不会安装或启动另一个 DNS 服务。") },
			{ id: "port", label: _("AdGuard Home 端口"), type: "number", value: settings.agh_port || "3000" },
			{ id: "username", label: _("统计接口用户名"), value: settings.agh_username || "" },
			{ id: "password", label: _("统计接口密码（留空保持原密码）"), type: "password", value: "", placeholder: settings.agh_password_set ? _("已设置；留空保持") : "" }
		], _("保存设置"), function(values) {
			self.configure({ operation: "settings-save", url: values.dashboard_url.trim(), enabled: values.enabled, port: values.port, username: values.username, password: values.password, clear_password: "0" });
		});
	},

	render: function(data) {
		var self = this;
		this.data = data || this.data || {};
		var s = this.data.status || {}, settings = this.data.settings || {}, stats = this.data.stats || {};
		var mihomo = s.mihomo || {}, ad = s.adblock || {}, dns = s.dns || {}, subs = s.subscriptions || [];
		var root = E("main", { "class": "tidynet" });
		var title = E("div", { "class": "tn-brand" }, [
			E("span", { "class": "tn-mark" }, [ "T" ]),
			E("div", {}, [ E("h2", {}, [ "TidyNet" ]), E("p", {}, [ _("轻松管理 Mihomo、DNS 与广告拦截") ]) ])
		]);
		var panel = settings.dashboard_url || mihomo.dashboard_url || "";
		if (!panel && mihomo.api) {
			var port = mihomo.api.match(/:(\d+)$/);
			var path = (mihomo.ui_path || "ui").replace(/^\/+|\/+$/g, "");
			if (port) panel = window.location.protocol + "//" + window.location.hostname + ":" + port[1] + "/" + path + "/";
		}
		var headerActions = E("div", { "class": "tn-header-actions" }, [
			panel ? E("a", { "class": "cbi-button cbi-button-action", href: panel, target: "_blank", rel: "noopener noreferrer" }, [ _("打开 Mihomo 面板 ↗") ]) :
			E("button", { "class": "cbi-button", disabled: true }, [ _("配置 Mihomo 面板") ]),
			E("button", { "class": "tn-icon-btn", title: _("设置"), "click": ui.createHandlerFn(this, function() { self.saveIntegration(settings); }) }, [ "⚙" ])
		]);
		root.appendChild(E("header", { "class": "tn-header" }, [ title, headerActions ]));

		var stateText = mihomo.running ? _("运行中") : (mihomo.installed ? _("已停止") : _("运行组件未安装"));
		var stateClass = mihomo.running ? "ok" : "muted";
		var primary = E("section", { "class": "tn-card tn-hero" }, [
			E("div", { "class": "tn-hero-copy" }, [
				E("div", { "class": "tn-eyebrow" }, [ _("mihomo 核心") ]),
				E("div", { "class": "tn-status" }, [ E("i", { "class": "tn-dot " + stateClass }), E("strong", {}, [ stateText ]) ]),
				E("p", {}, [ mihomo.dns_hijack && ad.enabled ? _("DNS 请求由 Mihomo 与广告过滤分别处理，请确认端口转发规则。") : _("订阅、DNS 和过滤规则都可以在此管理。") ]),
				E("small", { "class": "tn-core-version" }, [ mihomo.core_version ? _("核心版本：%s").format(mihomo.core_version) : _("尚未安装 Mihomo 核心") ])
			]),
			E("div", { "class": "tn-hero-actions" }, [
				!s.dependencies_ready ? E("button", { "class": "cbi-button cbi-button-action", disabled: !!s.busy, "click": ui.createHandlerFn(this, function() {
					self.confirm(_("下载并安装运行组件"), _("TidyNet 将通过系统软件源安装 Nikki、Mihomo 核心和 adblock-fast，并自动处理它们的依赖。不会自动启用代理或广告过滤。"), _("开始安装"), "dependencies-install", null, true);
				}) }, [ _("安装运行组件") ]) : "",
				E("button", { "class": "cbi-button", disabled: !!s.busy, "click": ui.createHandlerFn(this, function() {
					self.confirm(mihomo.core_installed ? _("下载并更新 Mihomo 核心") : _("下载 Mihomo 核心"), _("从已验证签名的 Nikki 软件源下载 Mihomo 核心。若代理正在运行，TidyNet 会在更新后尝试重新启动。"), mihomo.core_installed ? _("更新核心") : _("下载核心"), "mihomo-core-update", null, true);
				}) }, [ mihomo.core_installed ? _("下载 / 更新核心") : _("下载 Mihomo 核心") ]),
				E("button", { "class": "cbi-button", disabled: !!s.busy || !mihomo.installed, "click": ui.createHandlerFn(this, function() { return self.action(mihomo.running ? "mihomo-reload" : "mihomo-start"); }) }, [ mihomo.running ? _("重载配置") : _("启动 Mihomo") ]),
				mihomo.running ? E("button", { "class": "cbi-button tn-danger", disabled: !!s.busy, "click": ui.createHandlerFn(this, function() {
					self.confirm(_("停止 Mihomo"), _("这会暂停代理与 Mihomo DNS。"), _("停止"), "mihomo-stop");
				}) }, [ _("停止") ]) : ""
			])
		]);
		root.appendChild(primary);

		var subRows = subs.map(function(item) {
			var meta = [ item.active ? _("当前使用") : "", item.updated || "" ].filter(Boolean).join(" · ");
			if (item.success === "0" && item.updated) meta = _("上次更新失败") + " · " + item.updated;
			return E("article", { "class": "tn-list-row" }, [
				E("div", { "class": "tn-row-main" }, [
					E("span", { "class": "tn-mini-icon" }, [ "↗" ]),
					E("div", {}, [ E("strong", {}, [ item.name || _("未命名订阅") ]), E("small", {}, [ meta || _("尚未更新") ]) ])
				]),
				E("div", { "class": "tn-row-buttons" }, [
					E("button", { "class": "tn-link-btn", disabled: !!s.busy, title: _("编辑"), "click": ui.createHandlerFn(this, function() { self.editSubscription(item); }) }, [ _("编辑") ]),
					E("button", { "class": "tn-link-btn", disabled: !!s.busy, title: _("更新订阅"), "click": ui.createHandlerFn(this, function() { return self.action("subscription-update", item.id); }) }, [ _("更新") ]),
					E("button", { "class": "tn-link-btn", disabled: !!s.busy || item.active, title: _("更新并应用"), "click": ui.createHandlerFn(this, function() { return self.action("subscription-use", item.id); }) }, [ item.active ? _("使用中") : _("更新并应用") ]),
					E("button", { "class": "tn-link-btn tn-delete-link", disabled: !!s.busy || item.active, title: _("删除订阅"), "click": ui.createHandlerFn(this, function() {
						self.removeConfigured(_("删除订阅"), _("删除“%s”？当前订阅不能删除。").format(item.name || item.id), "subscription-delete", item.id);
					}) }, [ _("删除") ])
				])
			]);
		});
		var subsCard = E("section", { "class": "tn-card" }, [
			E("div", { "class": "tn-card-head" }, [ E("div", {}, [ E("span", { "class": "tn-eyebrow" }, [ _("MIHOMO") ]), E("h3", {}, [ _("订阅管理") ]) ]),
				E("button", { "class": "cbi-button cbi-button-action", disabled: !!s.busy || !mihomo.installed, "click": ui.createHandlerFn(this, function() { self.editSubscription(null); }) }, [ _("＋ 添加订阅") ]) ]),
			subRows.length ? E("div", { "class": "tn-list" }, subRows) : E("div", { "class": "tn-empty" }, [ _("还没有订阅，添加订阅地址即可开始。") ])
		]);
		var statsConnected = stats && stats.connected === true;
		var blockedLabel = statsConnected ? stats.blocked : _("未接入");
		var metrics = E("div", { "class": "tn-metrics" }, [
			E("div", { "class": "tn-metric tn-metric-primary" }, [ E("span", {}, [ _("已拦截请求") ]), E("strong", {}, [ String(blockedLabel) ]), E("small", {}, [ statsConnected ? _("统计窗口：%s").format(stats.time_units || _("以 AdGuard Home 设置为准")) : (settings.agh_enabled ? _("连接失败：请检查本机端口和认证") : _("接入 AdGuard Home 后显示真实请求数")) ]) ]),
			E("div", { "class": "tn-metric" }, [ E("span", {}, [ _("加载规则域名") ]), E("strong", {}, [ ad.blocked_domains == null ? "—" : Number(ad.blocked_domains).toLocaleString() ]), E("small", {}, [ _("与请求拦截次数分开统计") ]) ]),
			E("div", { "class": "tn-metric" }, [ E("span", {}, [ _("拦截规则源") ]), E("strong", {}, [ String(ad.enabled_sources || 0) ]), E("small", {}, [ _("已启用的拦截列表") ]) ])
		]);
		var sources = settings.sources || [];
		var sourceRows = sources.slice(0, 3).map(function(source) {
			return E("div", { "class": "tn-source-row" }, [ E("span", { "class": "tn-source-dot " + (source.enabled === false ? "off" : "") }), E("span", {}, [ source.name || source.id ]), E("small", {}, [ source.action === "allow" ? _("允许") : _("拦截") ]) ]);
		});
		var adCard = E("section", { "class": "tn-card tn-ad-card" }, [
			E("div", { "class": "tn-card-head" }, [ E("div", {}, [ E("span", { "class": "tn-eyebrow" }, [ _("ADBLOCK-FAST") ]), E("h3", {}, [ _("广告过滤") ]) ]),
				E("div", { "class": "tn-pill " + (ad.enabled ? "pill-on" : "") }, [ ad.enabled ? _("已启用") : (ad.installed ? _("未启用") : _("未安装")) ]) ]),
			metrics,
			E("div", { "class": "tn-chart" }, statsConnected && Array.isArray(stats.history) ? stats.history.map(function(point) {
				var max = Math.max.apply(null, stats.history.map(Number).concat([ 1 ]));
				return E("span", { title: String(point), style: "height:" + Math.max(5, Math.round(Number(point) / max * 100)) + "%" });
			}) : [ E("div", { "class": "tn-chart-empty" }, [ _("请求统计接入后显示历史趋势") ]) ]),
			E("div", { "class": "tn-card-head tn-subhead" }, [ E("strong", {}, [ _("过滤列表") ]),
				E("button", { "class": "tn-link-btn", disabled: !ad.installed || !!s.busy, "click": ui.createHandlerFn(this, function() { self.saveDomains(settings); }) }, [ _("自定义域名") ]),
				E("button", { "class": "tn-link-btn", disabled: !ad.installed || !!s.busy, "click": ui.createHandlerFn(this, function() { self.manageSources(settings); }) }, [ _("管理列表") ]) ]),
			sourceRows.length ? E("div", { "class": "tn-sources" }, sourceRows) : E("div", { "class": "tn-empty tn-small-empty" }, [ _("暂无规则源。") ]),
			E("div", { "class": "tn-card-actions" }, [
				E("button", { "class": "cbi-button", disabled: !!s.busy || !ad.installed, "click": ui.createHandlerFn(this, function() { self.editSource(null); }) }, [ _("添加规则源") ]),
				E("button", { "class": "cbi-button", disabled: !!s.busy || !ad.installed || !ad.enabled, "click": ui.createHandlerFn(this, function() { return self.action("adblock-update"); }) }, [ _("更新规则") ]),
				E("button", { "class": "cbi-button cbi-button-action", disabled: !!s.busy || !ad.installed, "click": ui.createHandlerFn(this, function() {
					return self.action(ad.enabled ? "adblock-stop" : "adblock-start");
				}) }, [ ad.enabled ? _("暂停过滤") : _("启用过滤") ])
			]),
			ad.last_update ? E("p", { "class": "tn-footnote" }, [ _("TidyNet 最近一次更新：%s").format(ad.last_update) ]) : ""
		]);
		var overview = E("div", { "class": "tn-dashboard-grid" }, [ subsCard, adCard ]);
		root.appendChild(overview);

		var dnsStatus = dns.enabled === false ? _("已关闭") : (dns.listen || _("等待 Nikki 状态"));
		var dnsCard = E("section", { "class": "tn-card tn-dns-card" }, [
			E("div", { "class": "tn-card-head" }, [ E("div", {}, [ E("span", { "class": "tn-eyebrow" }, [ _("DNS") ]), E("h3", {}, [ _("解析设置") ]) ]),
				E("span", { "class": "tn-dns-value" }, [ dnsStatus ]) ]),
			E("p", { "class": "tn-help" }, [ _("模式：%s · IPv6：%s").format(dns.mode || "—", dns.ipv6 ? _("开启") : _("关闭")) ]),
			dns.dnsmasq_running && ad.enabled && mihomo.dns_hijack ? E("p", { "class": "tn-warning" }, [ _("检测到 DNS 接管配置。请确认 Mihomo 与 adblock-fast 使用不同 DNS 端口，避免过滤规则被绕过。") ]) : "",
			E("div", { "class": "tn-card-actions" }, [
				E("button", { "class": "cbi-button", disabled: !mihomo.installed, "click": ui.createHandlerFn(this, function() { self.saveDns(settings, s); }) }, [ _("上游与模式") ]),
				E("button", { "class": "cbi-button", "click": ui.createHandlerFn(this, function() { self.openDns(settings, s); }) }, [ _("解析诊断") ])
			])
		]);
		root.appendChild(dnsCard);
		var job = s.job || {};
		if (job.state === "running") root.appendChild(E("div", { "class": "tn-job tn-job-running" }, [ "◌  " + (job.message || _("后台任务进行中")) ]));
		else if (job.state === "error") root.appendChild(E("div", { "class": "tn-job tn-job-error" }, [ "！  " + (job.message || _("后台任务失败")), " · ", job.time || "" ]));
		else if (job.state === "success") root.appendChild(E("div", { "class": "tn-job tn-job-success" }, [ "✓  " + (job.message || _("后台任务已完成")), " · ", job.time || "" ]));
		root.appendChild(E("footer", { "class": "tn-footer" }, [ _("adblock-fast 统计的域名数不等同于拦截请求数。请求统计来自可选的 AdGuard Home 控制接口，窗口长度由其自身设置决定。") ]));
		if (!this.timer) {
			this.timer = window.setInterval(function() {
				if (document.querySelector(".tidynet") && !document.querySelector(".modal")) self.refresh();
			}, 10000);
		}
		return root;
	},

	openDns: function(settings) {
		var self = this;
		var input = E("input", { "class": "tn-input", value: "", placeholder: "example.com" });
		var output = E("pre", { "class": "tn-resolve-output" }, [ _("查询使用路由器本机 127.0.0.1:53") ]);
		ui.showModal(_("DNS 解析诊断"), [
			E("div", { "class": "tn-form" }, [
				E("label", { "class": "tn-field" }, [ E("span", {}, [ _("输入域名") ]), input ]),
				E("button", { "class": "cbi-button cbi-button-action", "click": ui.createHandlerFn(this, function() {
					return callResolve(input.value.trim()).then(function(result) { output.textContent = result.output || result.error || _("没有结果"); });
				}) }, [ _("测试解析") ]),
				output
			])
		], E("div", { "class": "tn-modal-actions" }, [ E("button", { "class": "cbi-button", "click": function() { ui.hideModal(); } }, [ _("关闭") ]) ]));
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});

