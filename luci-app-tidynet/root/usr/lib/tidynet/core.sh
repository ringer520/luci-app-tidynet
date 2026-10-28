#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
. /usr/share/libubox/jshn.sh
TN_RUN=${TN_RUN:-/tmp/tidynet}
TN_INIT=${TN_INIT:-/etc/init.d}
TN_WORKER=${TN_WORKER:-/usr/libexec/tidynet-job}
TN_CORE=/usr/bin/tidynet-mihomo
TN_HOME=/etc/tidynet
umask 077

get() { uci -q get "$1" 2>/dev/null; }
list_values() { uci -q -X show "$1" 2>/dev/null | sed -n "s/^$1\.$2\.$3='\(.*\)'$/\1/p"; }
jget() { printf '%s' "$1" | jsonfilter -e "$2" 2>/dev/null; }
sections() { uci -q -X show "$1" 2>/dev/null | sed -n "s/^$1\.\([A-Za-z0-9_]*\)=$2$/\1/p"; }
is_id() { case "$1" in ''|*[!A-Za-z0-9_]*) return 1;; esac; [ "${#1}" -le 64 ]; }
is_section() { is_id "$2" && [ "$(get "$1.$2")" = "$3" ]; }
is_bool() { [ "$1" = 0 ] || [ "$1" = 1 ]; }
is_uint() { case "$1" in ''|*[!0-9]*) return 1;; esac; [ "${#1}" -le 12 ]; }
is_url() { [ "${#1}" -le 4096 ] && printf '%s' "$1" | LC_ALL=C grep -Eq '^https://[^/@[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'; }
is_web_url() { [ "${#1}" -le 4096 ] && printf '%s' "$1" | LC_ALL=C grep -Eq '^https?://[^/@[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'; }
is_domain() {
	[ -n "$1" ] && [ "${#1}" -le 253 ] || return 1
	printf '%s\n' "$1" | LC_ALL=C awk -F. 'BEGIN {ok=1} {if (NF<2) ok=0; for(i=1;i<=NF;i++) if(length($i)>63 || $i !~ /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/) ok=0} END {exit !ok}'
}
is_text() { [ -n "$1" ] && [ "${#1}" -le 128 ] && ! printf '%s' "$1" | LC_ALL=C grep -q '[[:cntrl:]]'; }
is_upstream() { [ "${#1}" -le 512 ] && printf '%s' "$1" | LC_ALL=C grep -Eq '^(https://|tls://|tcp://|quic://)?[A-Za-z0-9.:_\[\]-]+(:[0-9]+)?(/[A-Za-z0-9._~%/?=&+-]*)?$'; }
api_config_file() {
	local profile
	profile=$(get tidynet.main.profile)
	case "$profile" in ''|*[!A-Za-z0-9_-]*) printf '%s\n' "$TN_HOME/config.yaml";; *) [ -s "$TN_HOME/profiles/$profile.yaml" ] && printf '%s\n' "$TN_HOME/profiles/$profile.yaml" || printf '%s\n' "$TN_HOME/config.yaml";; esac
}
api_controller() {
	local file controller port
	file=$(api_config_file)
	controller=$(sed -n 's/^[[:space:]]*external-controller:[[:space:]]*//p' "$file" | head -n 1 | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
	case "$controller" in
		\"*\") controller=${controller#\"}; controller=${controller%\"};;
		\'*\') controller=${controller#\'}; controller=${controller%\'};;
		*) controller=${controller%%#*}; controller=$(printf '%s' "$controller" | sed 's/[[:space:]]*$//');;
	esac
	case "$controller" in 127.0.0.1:*|localhost:*) port=${controller##*:};; *) return 1;; esac
	is_uint "$port" && [ "$port" -gt 0 ] && [ "$port" -le 65535 ] || return 1
	printf 'http://%s\n' "$controller"
}
api_secret() {
	local file secret
	file=$(api_config_file)
	secret=$(sed -n 's/^[[:space:]]*secret:[[:space:]]*//p' "$file" | head -n 1 | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
	case "$secret" in
		\"*\") secret=${secret#\"}; secret=${secret%\"};;
		\'*\') secret=${secret#\'}; secret=${secret%\'};;
		*) secret=${secret%%#*}; secret=$(printf '%s' "$secret" | sed 's/[[:space:]]*$//');;
	esac
	[ "${#secret}" -le 512 ] && ! printf '%s' "$secret" | grep -q '[[:cntrl:]]' || return 1
	printf '%s' "$secret"
}
api_urlencode() { printf '%s' "$1" | od -An -vtx1 | tr -d ' \n' | sed 's/../%&/g'; }
api_request() {
	local method=$1 path=$2 payload=$3 output=$4 base token code
	case "$method" in GET|PUT) ;; *) return 1;; esac
	base=$(api_controller) || return 1
	token=$(api_secret) || return 1
	set -- --silent --show-error --connect-timeout 2 --max-time 6 --max-filesize 524288 --noproxy '*' --proto '=http' -H 'Content-Type: application/json' -X "$method" -o "$output" -w '%{http_code}'
	[ -z "$token" ] || set -- "$@" -H "Authorization: Bearer $token"
	[ -z "$payload" ] || set -- "$@" --data "$payload"
	code=$(curl "$@" "$base$path" 2>/dev/null)
	case "$method:$code" in GET:200|PUT:200|PUT:204) return 0;; *) return 1;; esac
}
error() { json_init; json_add_boolean ok 0; json_add_string error "$1"; json_dump; }
success() { json_init; json_add_boolean ok 1; json_add_string message "${1:-已保存}"; json_dump; }
bool_field() { local b=0; [ "$2" = 1 ] && b=1; json_add_boolean "$1" "$b"; }
number_field() { if is_uint "$2"; then json_add_int "$1" "$2"; else json_add_null "$1"; fi; }
pending() { [ -n "$(uci -q changes "$1" 2>/dev/null)" ]; }
render_dns_config() {
	local mode ipv6 upstream tmp line count=0
	mode=$(get tidynet.main.dns_mode); ipv6=$(get tidynet.main.dns_ipv6)
	{ [ "$mode" = fake-ip ] || [ "$mode" = redir-host ]; } || mode=redir-host
	is_bool "$ipv6" || ipv6=0
	mkdir -p "$TN_HOME" || return 1
	tmp="$TN_HOME/dns.yaml.new"
	cat > "$tmp" <<EOF
mode: rule
log-level: error
proxies: []
proxy-groups: []
rules:
  - MATCH,DIRECT
dns:
  enable: true
  listen: 127.0.0.1:10535
  ipv6: $([ "$ipv6" = 1 ] && echo true || echo false)
  enhanced-mode: $mode
  nameserver:
EOF
	upstream=$(list_values tidynet main dns_upstreams)
	while IFS= read -r line; do
		[ -n "$line" ] || continue
		is_upstream "$line" || { rm -f "$tmp"; return 1; }
		count=$((count+1)); [ "$count" -le 10 ] || { rm -f "$tmp"; return 1; }
		printf "    - '%s'\n" "$line" >> "$tmp"
	done <<EOF
$upstream
EOF
	[ "$count" -gt 0 ] || printf '%s\n' '    - 223.5.5.5' >> "$tmp"
	chmod 600 "$tmp" && mv -f "$tmp" "$TN_HOME/dns.yaml"
}

lock() {
	mkdir -p "$TN_RUN" || return 1
	chmod 700 "$TN_RUN"
	if ! mkdir "$TN_RUN/lock" 2>/dev/null; then
		local pid stamp now
		pid=$(cat "$TN_RUN/lock/pid" 2>/dev/null); stamp=$(cat "$TN_RUN/lock/time" 2>/dev/null); now=$(date +%s)
		if is_uint "$pid" && is_uint "$stamp" && ! kill -0 "$pid" 2>/dev/null && [ $((now-stamp)) -gt 15 ]; then
			rm -f "$TN_RUN/lock/pid" "$TN_RUN/lock/time"
			rmdir "$TN_RUN/lock" 2>/dev/null && mkdir "$TN_RUN/lock" 2>/dev/null || return 1
		else return 1; fi
	fi
	printf '%s\n' "$$" > "$TN_RUN/lock/pid"
	date +%s > "$TN_RUN/lock/time"
}
unlock() { rm -f "$TN_RUN/lock/pid" "$TN_RUN/lock/time"; rmdir "$TN_RUN/lock" 2>/dev/null; }
job_record() {
	json_init; json_add_string operation "$1"; json_add_string state "$2"; json_add_string message "$3"
	json_add_string time "$(date '+%Y-%m-%d %H:%M:%S')"
	json_dump > "$TN_RUN/job.new" && mv "$TN_RUN/job.new" "$TN_RUN/job.json"
}
start_job_locked() {
	job_record "$1" running '后台任务进行中，请稍候。'
	nohup "$TN_WORKER" "$1" "${2:-}" </dev/null >/dev/null 2>&1 &
	TN_DETACHED=1
	json_init; json_add_boolean ok 1; json_add_boolean accepted 1
	json_add_string message '已提交后台任务，首页会显示执行状态。'; json_dump
}

status() {
	local core=0 running=0 version='' enabled=0 busy=0 job state section profile current=0 rules=0 dns_enabled=0 sources=0
	if [ -x "$TN_CORE" ]; then
		core=1
		version=$(timeout 5 "$TN_CORE" -v 2>/dev/null | head -n 1 | cut -c 1-128)
	fi
	[ "$(get tidynet.main.enabled)" = 1 ] && enabled=1
	[ "$enabled" = 1 ] && pidof tidynet-mihomo >/dev/null 2>&1 && running=1
	[ "$(get tidynet.main.dns_enabled)" = 1 ] && dns_enabled=1
	[ -s "$TN_HOME/rules/blocked.hosts" ] && rules=$(grep -c '^0\.0\.0\.0 ' "$TN_HOME/rules/blocked.hosts" 2>/dev/null)
	for section in $(sections tidynet rule_source); do
		[ "$(get "tidynet.$section.enabled")" = 1 ] && [ "$(get "tidynet.$section.action")" != allow ] && sources=$((sources+1))
	done
	job=$(cat "$TN_RUN/job.json" 2>/dev/null)
	if [ -d "$TN_RUN/lock" ]; then
		local owner stamp now
		owner=$(cat "$TN_RUN/lock/pid" 2>/dev/null); stamp=$(cat "$TN_RUN/lock/time" 2>/dev/null); now=$(date +%s)
		if is_uint "$owner" && kill -0 "$owner" 2>/dev/null; then busy=1
		elif is_uint "$stamp" && [ $((now-stamp)) -le 15 ]; then busy=1; fi
	fi
	profile=$(get tidynet.main.profile)
	json_init; json_add_boolean ok 1; json_add_string version '0.4.0'; json_add_boolean busy "$busy"
	json_add_boolean dependencies_ready "$core"
	json_add_object mihomo
	json_add_boolean installed "$core"; json_add_boolean core_installed "$core"; json_add_boolean running "$running"; bool_field enabled "$enabled"
	json_add_string core_version "$version"; json_add_string api "$(get tidynet.main.api_listen)"
	json_add_string dashboard_url "$(get tidynet.main.dashboard_url)"; json_add_string profile "$profile"
	json_close_object
	json_add_array subscriptions
	for section in $(sections tidynet subscription); do
		json_add_object ''; json_add_string id "$section"; json_add_string name "$(get "tidynet.$section.name")"
		json_add_string updated "$(get "tidynet.$section.updated")"
		if [ "$section" = "$profile" ]; then current=1; else current=0; fi
		bool_field active "$current"; json_add_boolean enabled "$(get "tidynet.$section.enabled")"; json_close_object
	done
	json_close_array
	json_add_object adblock
	json_add_boolean installed 1; bool_field enabled "$(get tidynet.main.adblock_enabled)"
	number_field blocked_domains "$rules"; json_add_int enabled_sources "$sources"
	json_add_null running; json_add_string status 'rules-managed-by-tidynet'; json_add_string last_update "$(cat "$TN_RUN/rules-updated" 2>/dev/null)"
	json_close_object
	json_add_object dns; bool_field enabled "$dns_enabled"; json_add_string listen "$(get tidynet.main.dns_listen)"
	json_add_string mode "$(get tidynet.main.dns_mode)"; bool_field ipv6 "$(get tidynet.main.dns_ipv6)"
	json_add_boolean dnsmasq_running "$(pidof dnsmasq >/dev/null 2>&1 && echo 1 || echo 0)"; json_close_object
	json_add_object job; json_add_string operation "$(jget "$job" '@.operation')"
	state=$(jget "$job" '@.state')
	if [ "$state" = running ] && [ "$busy" = 0 ]; then json_add_string state error; json_add_string message '任务意外中断，可重新操作。'
	else json_add_string state "$state"; json_add_string message "$(jget "$job" '@.message')"; fi
	json_add_string time "$(jget "$job" '@.time')"; json_close_object; json_dump
}

settings() {
	local section line
	json_init; json_add_boolean ok 1
	json_add_string dashboard_url "$(get tidynet.main.dashboard_url)"
	json_add_string dns_mode "$(get tidynet.main.dns_mode)"; bool_field dns_ipv6 "$(get tidynet.main.dns_ipv6)"
	bool_field dns_enabled "$(get tidynet.main.dns_enabled)"
	json_add_string dns_upstreams "$(list_values tidynet main dns_upstreams)"
	json_add_array subscriptions
	for section in $(sections tidynet subscription); do
		json_add_object ''; json_add_string id "$section"; json_add_string name "$(get "tidynet.$section.name")"
		json_add_string format "$(get "tidynet.$section.format")"; json_add_boolean enabled "$(get "tidynet.$section.enabled")"
		json_add_boolean url_set "$(get "tidynet.$section.url" | grep -q . && echo 1 || echo 0)"; json_close_object
	done
	json_close_array
	json_add_array sources
	for section in $(sections tidynet rule_source); do
		json_add_object ''; json_add_string id "$section"; json_add_string name "$(get "tidynet.$section.name")"
		json_add_boolean enabled "$(get "tidynet.$section.enabled")"; json_add_string format "$(get "tidynet.$section.format")"
		json_add_string action "$(get "tidynet.$section.action")"; json_add_boolean url_set "$(get "tidynet.$section.url" | grep -q . && echo 1 || echo 0)"; json_close_object
	done
	json_close_array
	json_add_string allowed_domains "$(list_values tidynet main allowed_domains)"
	json_add_string blocked_domains "$(list_values tidynet main blocked_domains)"
	json_dump
}

proxy_status() {
	local tmp data
	[ "$(get tidynet.main.enabled)" = 1 ] || { json_init; json_add_boolean ok 1; json_add_boolean connected 0; json_add_object proxies; json_close_object; json_dump; return; }
	mkdir -p "$TN_RUN" || { error '无法创建临时目录。'; return; }
	tmp=$(mktemp "$TN_RUN/proxies.XXXXXX") || { error '无法创建临时文件。'; return; }
	if api_request GET /proxies '' "$tmp"; then
		data=$(cat "$tmp"); rm -f "$tmp"
		json_init; json_add_boolean ok 1; json_add_boolean connected 1; json_add_string data "$data"; json_dump
	else
		rm -f "$tmp"; json_init; json_add_boolean ok 1; json_add_boolean connected 0; json_add_object proxies; json_close_object; json_dump
	fi
}

proxy_select() {
	local group=$1 member=$2 tmp group_data members candidate found=0 body path
	is_text "$group" && is_text "$member" || { error '策略组或节点名称无效。'; return; }
	[ "${#group}" -le 128 ] && [ "${#member}" -le 128 ] || { error '策略组或节点名称过长。'; return; }
	tmp=$(mktemp "$TN_RUN/group.XXXXXX") || { error '无法创建临时文件。'; return; }
	path="/proxies/$(api_urlencode "$group")"
	api_request GET "$path" '' "$tmp" || { rm -f "$tmp"; error '无法读取 Mihomo 策略组，请检查核心状态与本机控制器设置。'; return; }
	group_data=$(cat "$tmp"); members=$(jget "$group_data" '@.all[*]'); rm -f "$tmp"
	while IFS= read -r candidate; do [ "$candidate" = "$member" ] && found=1; done <<EOF
$members
EOF
	[ "$found" = 1 ] || { error '该节点不属于所选策略组。'; return; }
	json_init; json_add_string name "$member"; body=$(json_dump)
	tmp=$(mktemp "$TN_RUN/select.XXXXXX") || { error '无法创建临时文件。'; return; }
	api_request PUT "$path" "$body" "$tmp"; found=$?; rm -f "$tmp"
	[ "$found" = 0 ] || { error 'Mihomo 拒绝切换策略组，请检查节点状态。'; return; }
	success '代理节点已切换。'
}

stage_begin() {
	pending tidynet && return 1
	TN_STAGE=$(mktemp -d "$TN_RUN/uci.XXXXXX") || return 1
}
stage() { uci -q -t "$TN_STAGE" "$@"; }
stage_end() {
	local rc=0
	stage commit tidynet || rc=1
	rm -f "$TN_STAGE/tidynet"; rmdir "$TN_STAGE" 2>/dev/null
	chmod 600 /etc/config/tidynet
	return "$rc"
}
stage_abort() { [ -n "$TN_STAGE" ] && { rm -f "$TN_STAGE/tidynet"; rmdir "$TN_STAGE" 2>/dev/null; }; }
set_value() { stage set "tidynet.$1=$2"; }
set_lines() {
	local key=$1 line
	stage delete "tidynet.$key" 2>/dev/null || :
	while IFS= read -r line; do [ -z "$line" ] || stage add_list "tidynet.$key=$line" || return 1; done <<EOF
$2
EOF
}
validate_lines() {
	local line count=0
	[ "${#2}" -le 16000 ] || return 1
	while IFS= read -r line; do
		[ -z "$line" ] && continue
		count=$((count+1)); [ "$count" -le 300 ] || return 1
		"$1" "$line" || return 1
	done <<EOF
$2
EOF
}
configure_locked() {
	local payload=$1 op id name url enabled format action mode ipv6 upstreams allowed blocked rc=0 apply=''
	op=$(jget "$payload" '@.operation'); id=$(jget "$payload" '@.id'); name=$(jget "$payload" '@.name')
	url=$(jget "$payload" '@.url'); enabled=$(jget "$payload" '@.enabled')
	case "$op" in
		subscription-save|subscription-delete)
			[ -z "$id" ] || is_section tidynet "$id" subscription || { error '订阅不存在。'; return; }
			if [ "$op" = subscription-save ]; then
				format=$(jget "$payload" '@.format')
				is_text "$name" && { [ "$format" = clash-yaml ] || [ "$format" = mihomo-yaml ]; } || { error '订阅名称或格式不受支持。第一版仅支持 Clash/Mihomo YAML。'; return; }
				[ -z "$url" ] && [ -n "$id" ] || is_url "$url" || { error '请输入有效的 HTTPS 订阅地址。'; return; }
			else [ -n "$id" ] && [ "$(get tidynet.main.profile)" != "$id" ] || { error '请选择非当前使用的订阅。'; return; }; fi;;
		source-save|source-delete)
			[ -z "$id" ] || is_section tidynet "$id" rule_source || { error '规则源不存在。'; return; }
			if [ "$op" = source-save ]; then
				format=$(jget "$payload" '@.format')
				action=$(jget "$payload" '@.action')
				is_text "$name" && is_bool "$enabled" || { error '规则源名称或状态无效。'; return; }
				{ [ "$format" = hosts ] || [ "$format" = domains ]; } || { error '仅支持 hosts 或纯域名格式的规则源。'; return; }
				{ [ "$action" = block ] || [ "$action" = allow ]; } || { error '规则用途无效。'; return; }
				[ -z "$url" ] && [ -n "$id" ] || is_url "$url" || { error '请输入有效的 HTTPS 规则地址。'; return; }
			fi
			[ "$(get tidynet.main.adblock_enabled)" = 1 ] && apply=adblock-reload
			[ -z "$apply" ] || [ -z "$(uci -q changes dhcp 2>/dev/null)" ] || { error 'dnsmasq 有尚未保存的修改，请先保存或撤销后再更新广告规则。'; return; };;
		domains-save)
			allowed=$(jget "$payload" '@.allowed'); blocked=$(jget "$payload" '@.blocked')
			validate_lines is_domain "$allowed" && validate_lines is_domain "$blocked" || { error '域名列表格式无效，每组最多 300 条完整域名。'; return; }
			[ "$(get tidynet.main.adblock_enabled)" = 1 ] && apply=adblock-reload
			[ -z "$apply" ] || [ -z "$(uci -q changes dhcp 2>/dev/null)" ] || { error 'dnsmasq 有尚未保存的修改，请先保存或撤销后再更新广告规则。'; return; };;
		dns-save)
			mode=$(jget "$payload" '@.mode'); ipv6=$(jget "$payload" '@.ipv6'); enabled=$(jget "$payload" '@.enabled'); upstreams=$(jget "$payload" '@.upstreams')
			{ [ "$mode" = fake-ip ] || [ "$mode" = redir-host ]; } && is_bool "$ipv6" && is_bool "$enabled" && validate_lines is_upstream "$upstreams" || { error 'DNS 设置无效。'; return; }
			[ "$enabled" = 0 ] || [ -x "$TN_CORE" ] || { error '请先下载 Mihomo 核心，再启用 TidyNet DNS。'; return; }
			[ -n "$upstreams" ] || { error '请至少填写一个 DNS 上游。'; return; }
			[ -z "$(uci -q changes dhcp 2>/dev/null)" ] || { error 'dnsmasq 有尚未保存的修改，请先保存或撤销后再调整 TidyNet DNS。'; return; };;
		settings-save)
			[ -z "$url" ] || is_web_url "$url" || { error '面板地址必须是 HTTP(S) URL。'; return; };;
		*) error '不支持的设置操作。'; return;;
	esac
	stage_begin || { error 'TidyNet 有未提交的配置修改或无法创建暂存目录。请先保存或撤销页面中的待处理修改。'; return; }
	case "$op" in
		subscription-save)
			[ -n "$id" ] || id=$(stage add tidynet subscription) || rc=1
			set_value "$id.name" "$name" && set_value "$id.format" "$format" || rc=1
			if [ -n "$url" ]; then set_value "$id.url" "$url" || rc=1; fi
			set_value "$id.enabled" 1 || rc=1;;
		subscription-delete|source-delete) stage delete "tidynet.$id" || rc=1;;
		source-save)
			[ -n "$id" ] || id=$(stage add tidynet rule_source) || rc=1
			set_value "$id.name" "$name" && set_value "$id.enabled" "$enabled" && set_value "$id.format" "$format" && set_value "$id.action" "$action" || rc=1
			[ -z "$url" ] || set_value "$id.url" "$url" || rc=1;;
		domains-save) set_lines main.allowed_domains "$allowed" && set_lines main.blocked_domains "$blocked" || rc=1;;
		dns-save) set_value main.dns_mode "$mode" && set_value main.dns_ipv6 "$ipv6" && set_value main.dns_enabled "$enabled" && set_lines main.dns_upstreams "$upstreams" || rc=1;;
		settings-save) set_value main.dashboard_url "$url" || rc=1;;
	esac
	if [ "$rc" != 0 ]; then stage_abort; error '写入失败，设置未提交。'; return; fi
	stage_end || { error '提交配置失败，请检查空间和权限。'; return; }
	case "$op" in
		subscription-delete) rm -f "$TN_HOME/profiles/$id.yaml" "$TN_HOME/profiles/$id.yaml.bak";;
		source-delete) rm -f "$TN_HOME/rules/$id.block.domains" "$TN_HOME/rules/$id.allow.domains";;
	esac
	if [ "$op" = dns-save ]; then start_job_locked dns-reload ''
	elif [ -n "$apply" ]; then start_job_locked "$apply" "$id"; else success '设置已保存。'; fi
}

action_locked() {
	local operation=$1 section=$2
	case "$operation" in
		mihomo-core-update) start_job_locked "$operation" ''; return;;
		mihomo-start|mihomo-stop|mihomo-reload)
			[ -x "$TN_CORE" ] || { error '请先下载 Mihomo 核心。'; return; }
			case "$operation" in
				mihomo-start) uci -q set tidynet.main.enabled=1; uci -q commit tidynet; chmod 600 /etc/config/tidynet; start_job_locked "$operation" ''; return;;
				mihomo-stop) uci -q set tidynet.main.enabled=0; uci -q commit tidynet; chmod 600 /etc/config/tidynet; start_job_locked "$operation" ''; return;;
				*) start_job_locked "$operation" ''; return;;
			esac;;
		subscription-update|subscription-use)
			is_section tidynet "$section" subscription || { error '订阅不存在。'; return; }
			[ -n "$(get "tidynet.$section.url")" ] || { error '订阅 URL 未设置。'; return; }
			start_job_locked "$operation" "$section"; return;;
		adblock-start|adblock-stop|adblock-update|adblock-reload)
			[ -z "$(uci -q changes dhcp 2>/dev/null)" ] || { error 'dnsmasq 有尚未保存的修改，请先保存或撤销后再操作广告过滤。'; return; }
			case "$operation" in
				adblock-start) uci -q set tidynet.main.adblock_enabled=1; uci -q commit tidynet; apply=adblock-update;;
				adblock-stop) uci -q set tidynet.main.adblock_enabled=0; uci -q commit tidynet; apply=adblock-stop;;
				adblock-update|adblock-reload) apply=$operation;;
			esac
			chmod 600 /etc/config/tidynet; start_job_locked "$apply" "$section"; return;;
		*) error '不支持的后台操作。';;
	esac
}

stats() {
	local blocked queries stats_pid connected=0
	blocked=$(cat "$TN_HOME/stats/blocked" 2>/dev/null); queries=$(cat "$TN_HOME/stats/queries" 2>/dev/null)
	stats_pid=$(cat "$TN_RUN/stats.pid" 2>/dev/null)
	if [ "$(get tidynet.main.adblock_enabled)" = 1 ] && is_uint "$stats_pid" && kill -0 "$stats_pid" 2>/dev/null && is_uint "$blocked" && is_uint "$queries"; then connected=1; fi
	json_init; json_add_boolean ok 1; json_add_boolean connected "$connected"
	json_add_string source 'TidyNet / dnsmasq'
	if [ "$connected" = 1 ]; then
		json_add_int blocked "$blocked"; json_add_int queries "$queries"; json_add_string time_units '累计（仅过滤开启期间）'
	else
		json_add_null blocked; json_add_null queries; json_add_string time_units '启用广告过滤后开始统计'
	fi
	json_add_array history; json_close_array; json_dump
}
resolve() {
	is_domain "$1" || { error '请输入有效域名，例如 example.com。'; return; }
	local output rc
	output=$(timeout 6 nslookup "$1" 127.0.0.1 2>&1); rc=$?
	json_init; [ "$rc" = 0 ] && json_add_boolean ok 1 || json_add_boolean ok 0
	json_add_string resolver '127.0.0.1:53 (dnsmasq)'; json_add_string output "$(printf '%s' "$output" | head -c 4096)"; json_dump
}
