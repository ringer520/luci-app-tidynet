#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
. /usr/share/libubox/jshn.sh
TN_RUN=${TN_RUN:-/tmp/tidynet}
TN_INIT=${TN_INIT:-/etc/init.d}
TN_WORKER=${TN_WORKER:-/usr/libexec/tidynet-job}
umask 077
get() { uci -q get "$1" 2>/dev/null; }
jget() { printf '%s' "$1" | jsonfilter -e "$2" 2>/dev/null; }
sections() { uci -q -X show "$1" 2>/dev/null | sed -n "s/^$1\.\([A-Za-z0-9_]*\)=$2$/\1/p"; }
is_id() { case "$1" in ''|*[!A-Za-z0-9_]*) return 1;; esac; [ "${#1}" -le 64 ]; }
is_section() { is_id "$2" && [ "$(get "$1.$2")" = "$3" ]; }
is_bool() { [ "$1" = 0 ] || [ "$1" = 1 ]; }
is_uint() { case "$1" in ''|*[!0-9]*) return 1;; esac; [ "${#1}" -le 12 ]; }
is_url() {
 [ "${#1}" -le 4096 ] &&
 printf '%s' "$1" | LC_ALL=C grep -Eq '^https?://[^/@[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'
}
is_domain() {
 [ -n "$1" ] && [ "${#1}" -le 253 ] || return 1
 printf '%s\n' "$1" | LC_ALL=C awk -F. 'BEGIN {ok=1} {if (NF<2) ok=0; for(i=1;i<=NF;i++) if(length($i)>63 || $i !~ /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/) ok=0} END {exit !ok}'
}
is_text() { [ -n "$1" ] && [ "${#1}" -le 128 ] && ! printf '%s' "$1" | LC_ALL=C grep -q '[[:cntrl:]]'; }
is_upstream() {
 [ "${#1}" -le 512 ] &&
 printf '%s' "$1" | LC_ALL=C grep -Eq '^(https://|tls://|tcp://|quic://)?[A-Za-z0-9.:_\[\]-]+(:[0-9]+)?(/[A-Za-z0-9._~%/?=&+-]*)?$'
}
error() { json_init; json_add_boolean ok 0; json_add_string error "$1"; json_dump; }
success() { json_init; json_add_boolean ok 1; json_add_string message "${1:-已保存}"; json_dump; }
bool_field() { local b=0; [ "$2" = 1 ] && b=1; json_add_boolean "$1" "$b"; }
number_field() { if is_uint "$2"; then json_add_int "$1" "$2"; else json_add_null "$1"; fi; }
installed() { [ -x "$TN_INIT/$1" ]; }
pending() { [ -n "$(uci -q changes "$1" 2>/dev/null)" ]; }
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
 job_record "$1" running '后台任务进行中，请勿重复提交。'
 nohup "$TN_WORKER" "$1" "${2:-}" </dev/null >/dev/null 2>&1 &
 TN_DETACHED=1
 json_init; json_add_boolean ok 1; json_add_boolean accepted 1
 json_add_string message '已提交后台任务，首页将自动更新状态。'; json_dump
}
status() {
 local nikki=0 running=0 ab=0 ab_json svc ab_running='' ab_enabled=0 entries='' state='' dns=''
 local sources=0 section active job busy=0 hijack=0 dnsmasq=0
 installed nikki && nikki=1
 pidof mihomo >/dev/null 2>&1 && running=1
 pidof dnsmasq >/dev/null 2>&1 && dnsmasq=1
 installed adblock-fast && ab=1
 if [ "$ab" = 1 ]; then
  ab_json=$(ubus -t 3 call luci.adblock-fast getInitStatus '{"name":"adblock-fast"}' 2>/dev/null)
  ab_running=$(jget "$ab_json" '@.*.running')
  entries=$(jget "$ab_json" '@.*.entries')
  state=$(jget "$ab_json" '@.*.status')
  dns=$(jget "$ab_json" '@.*.dns')
  if [ -z "$entries" ] || [ -z "$state" ]; then
   svc=$(ubus -t 3 call service list '{"name":"adblock-fast"}' 2>/dev/null)
   [ -n "$entries" ] || entries=$(jget "$svc" '@.*.data.entries')
   [ -n "$state" ] || state=$(jget "$svc" '@.*.data.status')
   [ -n "$dns" ] || dns=$(jget "$svc" '@.*.data.dns')
   [ -n "$ab_running" ] || { [ -s /dev/shm/adblock-fast ] && ab_running=true; }
  fi
  [ "$(get adblock-fast.config.enabled)" = 1 ] && "$TN_INIT/adblock-fast" enabled >/dev/null 2>&1 && ab_enabled=1
  for section in $(sections adblock-fast file_url); do
   [ "$(get "adblock-fast.$section.enabled")" = 0 ] && continue
   [ "$(get "adblock-fast.$section.action")" = allow ] || sources=$((sources+1))
  done
 fi
 if [ "$(get nikki.proxy.ipv4_dns_hijack)" = 1 ] || [ "$(get nikki.proxy.ipv6_dns_hijack)" = 1 ] || [ "$(get nikki.mixin.tun_dns_hijack)" = 1 ]; then hijack=1; fi
 job=$(cat "$TN_RUN/job.json" 2>/dev/null)
 if [ -d "$TN_RUN/lock" ]; then
  local owner stamp now
  owner=$(cat "$TN_RUN/lock/pid" 2>/dev/null); stamp=$(cat "$TN_RUN/lock/time" 2>/dev/null); now=$(date +%s)
  if is_uint "$owner" && kill -0 "$owner" 2>/dev/null; then busy=1
  elif is_uint "$stamp" && [ $((now-stamp)) -le 15 ]; then busy=1; fi
 fi
 active=$(get nikki.config.profile)
 json_init; json_add_boolean ok 1; json_add_string version '0.2.0'; json_add_boolean busy "$busy"
 json_add_object mihomo
 json_add_boolean installed "$nikki"; json_add_boolean running "$running"; bool_field enabled "$(get nikki.config.enabled)"
 json_add_string api "$(get nikki.mixin.api_listen)"; json_add_string ui_path "$(get nikki.mixin.ui_path)"
 json_add_string dashboard_url "$(get tidynet.main.dashboard_url)"
 json_add_boolean dns_hijack "$hijack"; json_close_object
 json_add_array subscriptions
 for section in $(sections nikki subscription); do
  json_add_object ''; json_add_string id "$section"; json_add_string name "$(get "nikki.$section.name")"
  json_add_string updated "$(get "nikki.$section.update")"; json_add_string success "$(get "nikki.$section.success")"
  json_add_string prefer "$(get "nikki.$section.prefer")"; json_add_string used "$(get "nikki.$section.used")"
  json_add_string total "$(get "nikki.$section.total")"; json_add_string expire "$(get "nikki.$section.expire")"
  if [ "$active" = "subscription:$section" ]; then json_add_boolean active 1; else json_add_boolean active 0; fi
  json_close_object
 done
 json_close_array
 json_add_object adblock
 json_add_boolean installed "$ab"; json_add_boolean enabled "$ab_enabled"
 case "$ab_running" in true|1) json_add_boolean running 1;; false|0) json_add_boolean running 0;; *) json_add_null running;; esac
 number_field blocked_domains "$entries"; json_add_int enabled_sources "$sources"
 json_add_string status "$state"; json_add_string backend "${dns:-$(get adblock-fast.config.dns)}"
 json_add_string last_update "$(cat "$TN_RUN/adblock-updated" 2>/dev/null)"; json_close_object
 json_add_object dns
 json_add_boolean dnsmasq_running "$dnsmasq"; json_add_string mode "$(get nikki.mixin.dns_mode)"
 json_add_string listen "$(get nikki.mixin.dns_listen)"; bool_field enabled "$(get nikki.mixin.dns_enabled)"
 bool_field ipv6 "$(get nikki.mixin.dns_ipv6)"; json_close_object
 json_add_object job
 json_add_string operation "$(jget "$job" '@.operation')"
 state=$(jget "$job" '@.state')
 if [ "$state" = running ] && [ "$busy" = 0 ]; then
  json_add_string state error; json_add_string message '任务意外中断，可重新操作。'
 else json_add_string state "$state"; json_add_string message "$(jget "$job" '@.message')"; fi
 json_add_string time "$(jget "$job" '@.time')"; json_close_object
 json_dump
}
settings() {
 local section
 json_init; json_add_boolean ok 1
 json_add_string dashboard_url "$(get tidynet.main.dashboard_url)"
 bool_field agh_enabled "$(get tidynet.main.agh_enabled)"
 json_add_string agh_port "$(get tidynet.main.agh_port)"; json_add_string agh_username "$(get tidynet.main.agh_username)"
 if [ -n "$(get tidynet.main.agh_password)" ]; then json_add_boolean agh_password_set 1; else json_add_boolean agh_password_set 0; fi
 json_add_string dns_mode "$(get nikki.mixin.dns_mode)"; bool_field dns_ipv6 "$(get nikki.mixin.dns_ipv6)"
 bool_field dns_override "$(get nikki.mixin.dns_nameserver)"
 json_add_array nameservers
 for section in $(sections nikki nameserver); do
  json_add_object ''; json_add_string id "$section"; json_add_string type "$(get "nikki.$section.type")"
  bool_field enabled "$(get "nikki.$section.enabled")"
  json_add_string servers "$(get "nikki.$section.nameserver" | tr ' ' '\n')"; json_close_object
 done
 json_close_array
 json_add_array sources
 for section in $(sections adblock-fast file_url); do
  json_add_object ''; json_add_string id "$section"; json_add_string name "$(get "adblock-fast.$section.name")"
  if [ "$(get "adblock-fast.$section.enabled")" = 0 ]; then json_add_boolean enabled 0; else json_add_boolean enabled 1; fi
  json_add_string action "$(get "adblock-fast.$section.action")"; json_close_object
 done
 json_close_array
 json_add_string allowed_domains "$(get adblock-fast.config.allowed_domain | tr ' ' '\n')"
 json_add_string blocked_domains "$(get adblock-fast.config.blocked_domain | tr ' ' '\n')"
 json_dump
}
stage_begin() {
 pending "$1" && return 1
 TN_PACKAGE=$1
 TN_STAGE=$(mktemp -d "$TN_RUN/uci.XXXXXX") || return 1
}
stage() { uci -q -t "$TN_STAGE" "$@"; }
stage_end() {
 local rc=0
 stage commit "$TN_PACKAGE" || rc=1
 rm -f "$TN_STAGE/$TN_PACKAGE"; rmdir "$TN_STAGE" 2>/dev/null
 [ "$TN_PACKAGE" = tidynet ] && chmod 600 /etc/config/tidynet
 return "$rc"
}
stage_abort() { [ -n "$TN_STAGE" ] && { rm -f "$TN_STAGE/$TN_PACKAGE"; rmdir "$TN_STAGE" 2>/dev/null; }; }
set_value() { stage set "$TN_PACKAGE.$1=$2"; }
set_lines() {
 local key=$1 line
 stage delete "$TN_PACKAGE.$key" 2>/dev/null || :
 while IFS= read -r line; do [ -z "$line" ] || stage add_list "$TN_PACKAGE.$key=$line" || return 1; done <<EOF
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
 local payload=$1 op id name url enabled prefer action allowed blocked mode ipv6 override servers pkg apply='' rc=0
 op=$(jget "$payload" '@.operation'); id=$(jget "$payload" '@.id')
 name=$(jget "$payload" '@.name'); url=$(jget "$payload" '@.url'); enabled=$(jget "$payload" '@.enabled')
 case "$op" in
 subscription-save|subscription-delete)
  installed nikki || { error '请先安装 Nikki 后端。'; return; }; pkg=nikki
  [ -z "$id" ] || is_section nikki "$id" subscription || { error '订阅不存在。'; return; }
  if [ "$op" = subscription-delete ]; then
   [ -n "$id" ] && [ "$(get nikki.config.profile)" != "subscription:$id" ] || { error '不能删除当前使用的订阅。'; return; }
  else
   prefer=$(jget "$payload" '@.prefer')
   is_text "$name" && { [ "$prefer" = remote ] || [ "$prefer" = local ]; } || { error '请检查订阅名称和合并优先级。'; return; }
   [ -z "$url" ] && [ -n "$id" ] || is_url "$url" || { error '请输入有效的 HTTP(S) 订阅链接。'; return; }
  fi;;
 source-save|source-delete)
  installed adblock-fast || { error '请先安装 adblock-fast。'; return; }; pkg=adblock-fast
  [ -z "$id" ] || is_section adblock-fast "$id" file_url || { error '规则源不存在。'; return; }
  if [ "$op" = source-save ]; then
   action=$(jget "$payload" '@.action')
   is_text "$name" && is_bool "$enabled" && { [ "$action" = block ] || [ "$action" = allow ]; } || { error '规则源设置无效。'; return; }
   [ -z "$url" ] && [ -n "$id" ] || is_url "$url" || { error '请输入有效的 HTTP(S) 规则链接。'; return; }
  else [ -n "$id" ] || { error '请选择规则源。'; return; }; fi
  [ "$(get adblock-fast.config.enabled)" = 1 ] && apply=adblock-reload;;
 domains-save)
  installed adblock-fast || { error '请先安装 adblock-fast。'; return; }; pkg=adblock-fast
  allowed=$(jget "$payload" '@.allowed'); blocked=$(jget "$payload" '@.blocked')
  validate_lines is_domain "$allowed" && validate_lines is_domain "$blocked" || { error '每行一个完整域名，不支持通配符、IP 或 URL；每组最多 300 条。'; return; }
  [ "$(get adblock-fast.config.enabled)" = 1 ] && apply=adblock-reload;;
 dns-save)
  installed nikki || { error '请先安装 Nikki。'; return; }; pkg=nikki
  mode=$(jget "$payload" '@.mode'); ipv6=$(jget "$payload" '@.ipv6'); override=$(jget "$payload" '@.override')
  { [ "$mode" = fake-ip ] || [ "$mode" = redir-host ]; } && is_bool "$ipv6" && is_bool "$override" || { error 'DNS 设置无效。'; return; }
  [ "$(get nikki.config.enabled)" = 1 ] && apply=mihomo-reload;;
 nameserver-save)
  installed nikki && is_section nikki "$id" nameserver || { error 'DNS 上游组不存在，请先在 Nikki 创建。'; return; }; pkg=nikki
  servers=$(jget "$payload" '@.servers')
  is_bool "$enabled" && validate_lines is_upstream "$servers" || { error 'DNS 上游格式无效，支持 IP、DoH、DoT、TCP 和 QUIC 地址。'; return; }
  [ "$enabled" = 0 ] || [ -n "$servers" ] || { error '启用的上游组不能为空。'; return; }
  [ "$(get nikki.config.enabled)" = 1 ] && apply=mihomo-reload;;
 settings-save)
  pkg=tidynet
  [ -z "$url" ] || is_url "$url" || { error '面板地址必须是 HTTP(S) URL。'; return; }
  local port username password clear
  port=$(jget "$payload" '@.port'); username=$(jget "$payload" '@.username')
  password=$(jget "$payload" '@.password'); clear=$(jget "$payload" '@.clear_password')
  is_bool "$enabled" && is_uint "$port" && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { error '统计端口必须为 1–65535。'; return; }
  [ "${#username}" -le 128 ] && [ "${#password}" -le 512 ] || { error '凭据过长。'; return; }
  case "$username" in *:*) error '用户名不能包含冒号。'; return;; esac
  if printf '%s%s' "$username" "$password" | LC_ALL=C grep -q '[[:cntrl:]]'; then error '凭据不能包含控制字符。'; return; fi;;
 *) error '不支持的设置操作。'; return;;
 esac
 stage_begin "$pkg" || { error '后端有未提交的 UCI 修改或无法创建临时目录。请先在原页面保存或撤销。'; return; }
 case "$op" in
 subscription-save)
  [ -n "$id" ] || id=$(stage add nikki subscription) || rc=1
  set_value "$id.name" "$name" && set_value "$id.prefer" "$prefer" || rc=1
  if [ -n "$url" ]; then set_value "$id.url" "$url" && set_value "$id.success" 0 || rc=1; fi
  set_value "$id.user_agent" clash || rc=1;;
 subscription-delete|source-delete) stage delete "$pkg.$id" || rc=1;;
 source-save)
  [ -n "$id" ] || id=$(stage add adblock-fast file_url) || rc=1
  set_value "$id.name" "$name" && set_value "$id.enabled" "$enabled" && set_value "$id.action" "$action" || rc=1
  [ -z "$url" ] || set_value "$id.url" "$url" || rc=1;;
 domains-save) set_lines config.allowed_domain "$allowed" && set_lines config.blocked_domain "$blocked" || rc=1;;
 dns-save) set_value mixin.dns_mode "$mode" && set_value mixin.dns_ipv6 "$ipv6" && set_value mixin.dns_nameserver "$override" || rc=1;;
 nameserver-save) set_value "$id.enabled" "$enabled" && set_lines "$id.nameserver" "$servers" || rc=1;;
 settings-save)
  set_value main.dashboard_url "$url" && set_value main.agh_enabled "$enabled" && set_value main.agh_port "$port" && set_value main.agh_username "$username" || rc=1
  if [ "$clear" = 1 ]; then set_value main.agh_password '' || rc=1
  elif [ -n "$password" ]; then set_value main.agh_password "$password" || rc=1; fi;;
 esac
 if [ "$rc" != 0 ]; then stage_abort; error '写入临时配置失败，未提交。'; return; fi
 stage_end || { error 'UCI 提交失败，请检查存储空间及权限。'; return; }
 if [ -n "$apply" ]; then start_job_locked "$apply" ''
 else success '设置已保存。订阅需更新后使用；停用的服务不会自动启动。'; fi
}
action_locked() {
 local operation=$1 section=$2 pkg
 case "$operation" in
 subscription-update|subscription-use)
  installed nikki && is_section nikki "$section" subscription || { error '订阅不存在或 Nikki 未安装。'; return; }; pkg=nikki;;
 mihomo-start|mihomo-stop|mihomo-reload)
  installed nikki || { error '请先安装 Nikki。'; return; }; pkg=nikki;;
 adblock-start|adblock-stop|adblock-update|adblock-reload)
  installed adblock-fast || { error '请先安装 adblock-fast。'; return; }; pkg=adblock-fast
  case "$operation" in adblock-update|adblock-reload) [ "$(get adblock-fast.config.enabled)" = 1 ] || { error '请先启用广告过滤。'; return; };; esac;;
 *) error '不支持的后台操作。'; return;;
 esac
 pending "$pkg" && { error '后端有未提交的设置，请先保存或撤销。'; return; }
 start_job_locked "$operation" "$section"
}
stats() {
 local port username password result data rc total blocked average units item
 [ "$(get tidynet.main.agh_enabled)" = 1 ] || { json_init; json_add_boolean ok 1; json_add_boolean connected 0; json_dump; return; }
 port=$(get tidynet.main.agh_port)
 is_uint "$port" && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { error '统计端口无效。'; return; }
 mkdir -p "$TN_RUN"; result=$(mktemp "$TN_RUN/stats.XXXXXX") || { error '无法创建统计临时文件。'; return; }
 username=$(get tidynet.main.agh_username); password=$(get tidynet.main.agh_password)
 # Curl reads credentials on stdin: never expose them in argv, URLs or logs.
 { printf 'user = "'; printf '%s:%s' "$username" "$password" | sed 's/\\/\\\\/g;s/"/\\"/g'; printf '"\n'; } |
 curl --config - --silent --fail --max-time 4 --max-filesize 262144 --noproxy '*' --proto '=http' "http://127.0.0.1:$port/control/stats" -o "$result" 2>/dev/null
 rc=$?
 local bytes
 bytes=$(wc -c < "$result" 2>/dev/null)
 [ "$rc" = 0 ] && is_uint "$bytes" && [ "$bytes" -le 262144 ] || { rm -f "$result"; error '无法读取 AdGuard Home 统计，请检查本机端口、认证、服务状态及响应大小。'; return; }
 data=$(cat "$result"); rm -f "$result"
 total=$(jget "$data" '@.num_dns_queries'); blocked=$(jget "$data" '@.num_blocked_filtering')
 is_uint "$total" && is_uint "$blocked" || { error '统计接口返回了不兼容的数据。'; return; }
 units=$(jget "$data" '@.time_units'); average=$(jget "$data" '@.avg_processing_time')
 json_init; json_add_boolean ok 1; json_add_boolean connected 1; json_add_string source 'AdGuard Home'
 json_add_int queries "$total"; json_add_int blocked "$blocked"; json_add_string time_units "$units"; json_add_string average_seconds "$average"
 json_add_array history
 for item in $(jget "$data" '@.blocked_filtering[*]'); do is_uint "$item" && json_add_int '' "$item"; done
 json_close_array; json_dump
}
resolve() {
 is_domain "$1" || { error '请输入完整域名，例如 example.com。'; return; }
 local output rc
 output=$(timeout 6 nslookup "$1" 127.0.0.1 2>&1); rc=$?
 json_init
 if [ "$rc" = 0 ]; then json_add_boolean ok 1; else json_add_boolean ok 0; fi
 json_add_string resolver '127.0.0.1:53'; json_add_string output "$(printf '%s' "$output" | head -c 4096)"; json_dump
}

