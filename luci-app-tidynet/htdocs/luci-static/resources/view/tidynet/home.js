"use strict";
"require view";
"require rpc";
"require ui";
"require dom";

var style = document.createElement('link');
style.rel = 'stylesheet';
style.href = L.resource('view/tidynet/home.css');
document.head.appendChild(style);

var callStatus = rpc.declare({
	object: 'tidynet',
	method: 'status',
	expect: { }
});

var callAction = rpc.declare({
	object: 'tidynet',
	method: 'action',
	params: [ 'action', 'target' ],
	expect: { }
});

function badge(ok, text) {
	return E('span', { 'class': 'tidynet-badge ' + (ok ? 'is-ok' : 'is-muted') }, [ text ]);
}

function card(title, content, className) {
	return E('section', { 'class': 'tidynet-card ' + (className || '') }, [
		E('h3', {}, [ title ]),
		E('div', { 'class': 'tidynet-card-body' }, content)
	]);
}

function metric(value, label) {
	return E('div', { 'class': 'tidynet-metric' }, [
		E('strong', {}, [ value == null ? _('Unavailable') : String(value) ]),
		E('small', {}, [ label ])
	]);
}

function renderSubscription(sub) {
	return E('div', { 'class': 'tidynet-row' }, [
		E('div', {}, [
			E('strong', {}, [ sub.name || sub.section || _('Unnamed subscription') ]),
			E('small', {}, [ sub.updated || _('Update time unavailable') ])
		]),
		E('button', {
			'class': 'cbi-button cbi-button-action',
			'click': ui.createHandlerFn(this, function(section) {
				return callAction('subscription-update', section).then(function(result) {
					if (!result || !result.ok)
						ui.addNotification(null, E('p', {}, [ result && result.error || _('Update failed') ]), 'error');
					else {
						ui.addNotification(null, E('p', {}, [ _('Subscription update started') ]), 'info');
						window.setTimeout(function() { window.location.reload(); }, 1500);
					}
				});
			}, sub.section)
		}, [ _('Update') ])
	]);
}

return view.extend({
	load: function() {
		return callStatus();
	},

	render: function(data) {
		var s = data || {};
		var mihomo = s.mihomo || {};
		var adblock = s.adblock || {};
		var dns = s.dns || {};
		var subs = Array.isArray(s.subscriptions) ? s.subscriptions : [];
		var subList = subs.length ? subs.map(renderSubscription.bind(this)) : [
			E('p', { 'class': 'tidynet-empty' }, [ _('Subscription integration is not configured yet.') ])
		];

		var header = E('div', { 'class': 'tidynet-header' }, [
			E('div', {}, [
				E('h2', {}, [ _('TidyNet') ]),
				E('p', {}, [ _('Your subscriptions, DNS and ad blocking at a glance.') ])
			]),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': ui.createHandlerFn(this, function() { window.location.reload(); })
			}, [ _('Refresh status') ])
		]);

		var mihomoCard = card(_('Mihomo'), [
			E('div', { 'class': 'tidynet-status-line' }, [
				badge(mihomo.running === true, mihomo.running === true ? _('Running') : (mihomo.installed ? _('Stopped') : _('Not installed'))),
				E('span', {}, [ _('API: %s').format(mihomo.api || _('not detected')) ])
			]),
			mihomo.error ? E('p', { 'class': 'tidynet-hint' }, [ mihomo.error ]) : '',
			E('p', {}, [
				E('a', { 'href': s.dashboard_url || '/ui/', 'target': '_blank', 'rel': 'noreferrer' }, [ _('Open MetaCubeXD dashboard') ])
			])
		], 'mihomo-card');

		var subscriptionsCard = card(_('Subscriptions'), [
			E('div', { 'class': 'tidynet-list' }, subList)
		], 'subscription-card');

		var adblockCard = card(_('Ad blocking'), [
			E('div', { 'class': 'tidynet-status-line' }, [
				badge(adblock.enabled === true, adblock.installed ? (adblock.enabled ? _('Enabled') : _('Disabled')) : _('adblock-fast not installed')),
				E('span', {}, [ _('Backend: %s').format(adblock.backend || _('unknown')) ])
			]),
			E('div', { 'class': 'tidynet-metrics' }, [
				metric(adblock.blocked_domains, _('Blocked domains')),
				metric(adblock.enabled_sources, _('Enabled sources')),
				metric(adblock.last_update, _('Last update'))
			]),
			E('p', { 'class': 'tidynet-hint' }, [ adblock.note || _('Statistics are provided by the installed adblock backend when available.') ]),
			E('div', { 'class': 'tidynet-actions' }, [
				E('button', { 'class': 'cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, function() { return callAction('adblock-update', '').then(function() { window.location.reload(); }); }) }, [ _('Update lists') ]),
				E('a', { 'class': 'cbi-button', 'href': s.adblock_url || '/cgi-bin/luci/admin/services/adblock-fast' }, [ _('Settings') ])
			])
		], 'adblock-card');

		var dnsCard = card(_('DNS'), [
			E('div', { 'class': 'tidynet-status-line' }, [
				badge(dns.available === true, dns.available ? _('Available') : _('Status unavailable')),
				E('span', {}, [ _('Resolver: %s').format(dns.backend || _('not detected')) ])
			]),
			E('p', { 'class': 'tidynet-hint' }, [ dns.note || '' ])
		], 'dns-card');

		return E('div', { 'class': 'tidynet' }, [
			header,
			E('div', { 'class': 'tidynet-grid' }, [ mihomoCard, subscriptionsCard, adblockCard, dnsCard ])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
