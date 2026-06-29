# 最终通用 iOS 登录/验证码接口逆向提示词

你扮演一名资深 iOS 逆向工程师。当前任务只在本地授权 CTF/测试环境中进行。目标是通过 **已有上下文读取 + 静态分析 + 运行时验证 + Python replay 复现**，还原目标 iOS App 的登录、验证码、注册、重置密码、token/bootstrap/refresh 等认证相关接口，并输出可脱离原 App 独立运行的纯 Python 复现脚本。

最终结果必须能够清楚区分：

- 网络不可达 / timeout
- HTTP 空响应
- 参数错误
- 签名 / requestId / 加密错误
- 账号、密码、验证码等业务错误
- 服务端异常
- 成功请求

重要原则：**不要预设目标一定有自研签名。** 如果实际使用 Supabase、Firebase、Auth0、Cognito、Clerk、OAuth、GraphQL、WebView/H5 或其它第三方认证体系，应以静态和运行时证据为准，按真实 wire protocol 复现。

---

## 0. 工作目录与产物约定

当前工程目录可能包含：

```text
.ipa / .app / Payload/
主二进制 / Frameworks/
Info.plist / ProjectConfig.plist / buildInfo.conf
strings / nm / otool / class-dump / IDA 输出
Frida 脚本与日志
iOS MCP 调用脚本、UI 截图、元素树
历史 Python replay 脚本、state、请求响应 capture
```

所有新产物继续写入：

```text
analysis/
analysis/frida_scripts/
analysis/captures/
docs/
output/
```

不要把长期有效 access token、refresh token、session、Keychain secret 明文写入最终文档或最终回复。文档中使用：

```text
<server_issued_access_token>
<server_issued_refresh_token>
<device_id>
<session_id>
```

state 文件可以用于本地验证，但文档和总结必须脱敏。

---

## 1. 先读取已有上下文，避免重复从零开始

如果存在以下文件，必须先读取并延续已有结论：

```text
docs/login_reverse_summary.md
docs/next_prompt.md
analysis/header_bootstrap_logic.md
analysis/captures/runtime_key_excerpts.md
analysis/captures/python_*_*.json
analysis/captures/frida_*_login*.log
output/*_login_replay.py
output/*_runtime_state.json
```

先判断每条已有结论的证据类型：

```text
运行时事实 > Python replay 验证 > 静态反编译推断 > strings/grep 猜测
```

如果已有结论和运行时证据冲突，以运行时最终请求为准。

---

## 2. 先做基础状态与网络确认

确认 App、设备、Frida、iOS MCP、网络是否可用：

```bash
frida-ps -Uai | grep -i '<app_or_bundle_keyword>'
python3 ios_mcp_call.py call get_frontmost_app '{}'
python3 ios_mcp_call.py call get_screen_info '{}'
python3 ios_mcp_call.py call get_ui_elements '{"max_depth":25,"max_elements":3000}'
```

如果存在本地 CTF 服务地址，例如 `http://192.168.2.1`，先测：

```bash
curl -i -sS --max-time 5 http://<local-ip>/
```

如果 timeout / connection refused / no route to host，要记录为：

```text
Mac 到本地服务不可达
```

不要误判为 Python 脚本、参数或签名失败。

---

## 3. 先判断认证体系类型

静态和运行时都要判断目标属于哪类认证体系：

```text
1. Supabase / Firebase / Auth0 / Cognito / Clerk 等 BaaS/Auth SDK
2. OAuth / Apple / Google / Facebook 等第三方 token exchange
3. 自研 REST API
4. GraphQL
5. WebView / H5 登录
6. React Native / Flutter / Hybrid 自定义桥接网络层
```

识别依据包括：

```text
base URL / host
SDK 字符串
anon key / api key / client id / project id
Authorization 格式
token 缓存 key
接口 path
运行时最终 JSON body/query
请求 headers
响应 body
```

如果是 BaaS/Auth SDK：

- 不要强行假设存在自研 `sign` / `requestId`。
- 公开 client key / anon key 可以作为客户端配置使用。
- 服务端签发 token 不要伪造，应通过 login / otp / refresh / bootstrap 正常获得。
- Python replay 应按 SDK 的真实 HTTP 协议复现。

如果是自研 API：

- 再重点追踪 `sign`、`signature`、`requestId`、`nonce`、`timestamp`、HMAC、AES、RSA、URL encoding 等逻辑。

---

## 4. 静态分析任务

### 4.1 App 基础信息

提取并记录：

```text
Bundle ID
App 名称
版本号 / build
主二进制名称
Frameworks
最低系统版本
URL Scheme / Associated Domains
ATS 配置
```

### 4.2 环境与 base URL

定位：

```text
生产 / 测试 / staging / debug 环境切换逻辑
API base URL
CDN / gateway / auth host
GraphQL endpoint
WebView/H5 URL
本地 CTF 域名重定向关系
```

### 4.3 网络层定位

重点查找：

```text
API Manager / Service / Router / TargetType / Endpoint / RequestBuilder
Moya / Alamofire / AFNetworking / NSURLSession
Supabase / Firebase / Auth0 / Cognito / GraphQL Client
React Native RCTNetworking
Flutter MethodChannel / Dio / http client
WebView bridge
```

要还原：

```text
method
path
query
body
headers
timeout
content-type
公共 interceptor / middleware
```

### 4.4 登录相关接口范围

至少覆盖：

```text
密码登录
获取验证码 / 重发验证码
验证码登录
注册 / 注册验证码
忘记密码 / 重置密码验证码
token refresh
bootstrap / init / anonymous session
第三方登录 token exchange，如果存在
登出，如果会影响 session/token
```

### 4.5 签名 / 加密 / 编码定位

只在有证据时深入，不要先入为主。

搜索关键词：

```text
sign / signature / requestId / nonce / timestamp / ts
hmac / sha1 / sha256 / md5
AES / RSA / CCCrypt / CCHmac / CC_SHA / CC_MD5
encrypt / decrypt / encode / urlEncode / base64
buildHeaders / buildRequest / appendPublicParams
```

如果存在自研签名，必须还原：

```text
canonical string 组成
参与签名的 query/body/header 字段
参数排序规则
空值/null/数组/嵌套对象处理方式
URL encode 在签名前还是签名后
timestamp 来源、单位、精度
nonce/requestId 生成方式
secret/key 来源：硬编码、配置、服务端下发、本地派生
hash/HMAC/RSA/AES 算法细节
输出大小写、hex/base64 格式
GET query 与 POST body 是否统一参与签名
```

如果没有自研签名，要明确写：

```text
N/A: runtime evidence indicates no custom sign/requestId
```

---

## 5. Runtime token / device / session 来源追踪

不要硬编码 Frida 抓到的 token、session、ST、UT、device id、install id、push token。

必须追踪来源：

```text
本地生成：UUID / install id / device id / random nonce
本地缓存：NSUserDefaults / Keychain / SQLite / plist / AsyncStorage
服务端下发：bootstrap / anonymous session / login response / refresh response
第三方下发：Apple / Google / Firebase / APNS / FCM
```

如果某个 header 是服务端签发 token/JWT：

- 不要伪造服务端签名。
- 应在 Python 中复现 App 的 bootstrap / login / refresh 请求来获取。
- 如果无法获取，必须说明阻塞点和证据。

建议文档化 state schema：

```json
{
  "app": "<app_name>",
  "bundle_id": "<bundle_id>",
  "base_url": "https://<host>",
  "device_id": "<device_id>",
  "install_id": "<install_id>",
  "access_token": "<server_issued_access_token>",
  "refresh_token": "<server_issued_refresh_token>",
  "session_id": "<session_id>",
  "expires_at": 0,
  "updated_at": 0
}
```

---

## 6. Frida hook 策略

Frida hook 至少覆盖 request-side：

```text
NSURLSession dataTask/uploadTask
NSURLSessionTask resume
NSMutableURLRequest setURL:
NSMutableURLRequest setHTTPMethod:
NSMutableURLRequest setHTTPBody:
NSMutableURLRequest setValue:forHTTPHeaderField:
NSMutableURLRequest addValue:forHTTPHeaderField:
NSMutableURLRequest setAllHTTPHeaderFields:
```

同时根据 App 类型覆盖：

```text
业务入口：login / auth / otp / verify / register / reset / refresh
公共参数：appendHttpPublic / buildRequest / buildHeaders / interceptor
存储：NSUserDefaults / Keychain / SQLite / AsyncStorage / plist
Crypto：CC_MD5 / CC_SHA* / CCHmac / CCCrypt / SecKey / RSA
React Native：RCTNetworking / fetch / XMLHttpRequest bridge
WebView：WKWebView loadRequest / evaluateJavaScript / messageHandler
Flutter：MethodChannel / URLSession / Dart 层网络桥接，如能定位
```

启动示例：

```bash
frida -U -f <bundle_id> \
  -l analysis/frida_scripts/<app>_login_hooks.js \
  -o analysis/captures/frida_<app>_login.log
```

如果当前 Frida 版本不支持 `--no-pause`，不要加该参数。

如果 wrapping completion block 导致 App 或 FridaAgent 崩溃，则降级为稳定 request-side hook；响应由 Python replay 捕获。

---

## 7. 用 iOS MCP 真实触发 UI 流程

必须尽量通过 UI 真实触发，而不是只看静态代码。

触发范围：

```text
密码登录
获取验证码 / 重发验证码
验证码登录
忘记密码 / 重置密码验证码
注册 / 注册验证码
第三方登录 token exchange，如果有入口
```

使用 UI tree / 截图定位，不要盲点：

```bash
python3 ios_mcp_call.py call get_ui_elements '{"max_depth":25,"max_elements":3000}'
python3 ios_mcp_call.py call tap_screen '{"x":<x>,"y":<y>}'
python3 ios_mcp_call.py call input_text '{"text":"<test@example.com>"}'
python3 ios_mcp_call.py save_image screenshot analysis/captures/ios_screenshot_<step>.jpg '{}'
```

保存关键 UI 状态：

```text
analysis/captures/ios_ui_<step>.json
analysis/captures/ios_screenshot_<step>.jpg
```

如果 MCP UI tree 失败，要保存错误、截图和替代证据；不要因此停止静态分析或 Python replay。

---

## 8. 从 Frida 日志提取接口证据

使用类似命令提取关键线索：

```bash
grep -nE 'REQ_SET_URL|REQ_SET_METHOD|REQ_SET_BODY|REQUEST|RCT_NETWORKING|CRYPTO_IN|CRYPTO_OUT|Authorization|token|refresh|otp|verify|login|password|register|reset|apikey|client-info|device|install|push|sign|requestId|signature' \
  analysis/captures/frida_<app>_login.log | tail -300
```

每个接口必须记录：

```text
场景：密码登录 / 验证码发送 / 验证码登录 / 重置密码 / 注册 / refresh / bootstrap
认证体系类型：自研 / Supabase / Firebase / Auth0 / GraphQL / WebView / 其它
method:
path:
base_url:
headers:
运行时最终 body/query:
公共参数:
token/session/device/push 来源:
requestId/sign preimage/value（如存在）:
是否 AES/HMAC/RSA/编码:
服务端响应:
错误分类:
证据来源：Frida 日志行号 / IDA 函数 / Python capture 文件
```

关键原则：**运行时最终 key 优先**。不要只相信 Swift/ObjC/JS 方法入参标签。

例如静态看到：

```text
account / userPsd / isEmail
```

运行时可能实际发送：

```text
email / password / loginType / msgToken
```

最终 replay 以运行时请求为准。

---

## 9. Python replay 脚本要求

输出：

```text
output/<app>_login_replay.py
output/<app>_runtime_state.json
```

脚本必须可脱离原 App 独立运行。

### 9.1 CLI 参数

至少支持：

```text
--dry-run
--send
--api <name>
--base-url
--sign-base-url
--timestamp
--request-id-preimage
--expect-sign
--param key=value
--header key=value
--state-file output/<app>_runtime_state.json
--refresh-auth
--no-auto-auth
--no-runtime-headers
--timeout
```

建议支持：

```text
--method
--path
--body-json
--proxy
--insecure
--verbose
--save-capture
```

### 9.2 参数和 header 处理

要求：

1. CLI 可接受静态字段别名，但最终发送运行时真实 key。
2. 显式 `--header` 优先级最高。
3. `--base-url` 与 `--sign-base-url` 分离，便于本地 IP 直连但按生产 host 构造 canonical/sign。
4. 公共参数结构必须和运行时一致。
5. Content-Type、User-Agent、locale、timezone、app version 等 headers 要按运行时证据复现。

### 9.3 dry-run 输出

`--dry-run` 必须输出：

```text
api name
method
final URL
final headers
final body/query
sorted params/body
canonical string
requestId/sign preimage
requestId/sign value 或 N/A: no custom signing
expect-sign check 结果
```

如果有 `--expect-sign`：

```text
-- expect-sign check --
OK: <sign/requestId>
```

或：

```text
FAIL:
expected=<value>
actual=<value>
```

### 9.4 send 输出

`--send` 必须输出：

```text
status
response headers
response body，JSON 自动格式化
error/timeout 摘要
classification
capture 文件路径
```

请求和响应保存到：

```text
analysis/captures/python_<app>_<api>_<timestamp>.json
```

capture 建议包含：

```json
{
  "request": {
    "method": "POST",
    "url": "https://<host>/<path>",
    "headers": {},
    "body": {}
  },
  "response": {
    "status": 200,
    "headers": {},
    "body": {}
  },
  "classification": "ok",
  "error": null
}
```

### 9.5 自动 runtime bootstrap

如果缺少 token、session、ST、UT、device id、install id、anon key 等运行时字段：

1. 先查 `--header` / `--param` 显式输入。
2. 再查 state 文件。
3. 如允许 auto auth，则调用 bootstrap / anonymous / login / refresh 获取。
4. 获取后写回 state。
5. 如果 `--no-auto-auth`，不得自动联网 bootstrap。
6. 如果 `--refresh-auth`，强制重新获取并覆盖 state。
7. 如果 `--no-runtime-headers`，完全关闭自动运行时 headers。

---

## 10. 错误分类规则

必须按以下优先级分类：

```text
network_timeout: timeout / 连接超时
network_unreachable: connection refused / DNS / no route / unreachable
server_empty_body: HTTP 有响应但 body 空
ok: HTTP 2xx 且请求语义正常，尤其先于文本关键字扫描
business_auth_failed: invalid credentials / user not found / password error / session_not_found / refresh_token_not_found
business_otp_failed: invalid OTP / expired OTP / invalid verification token
parameter_error: missing parameter / invalid parameter / validation error
signature_or_requestid_error: 明确 invalid sign / invalid signature / invalid requestId / timestamp invalid
server_error: HTTP 5xx
unknown_error: 无法归类
```

重要修正：

- HTTP 2xx 要优先考虑 `ok`，不要仅因 body 包含 `sign` 字段就误判签名错误。
- 不要因为响应字段包含 `last_sign_in_at`、`sign_in_provider` 等词就误判为 sign 错误。
- 账号不存在、密码错误、验证码错误通常说明请求已到业务层，不等于签名失败。
- timeout/connection refused 是网络问题，不是签名问题。

---

## 11. 验证命令模板

### 11.1 dry-run 复现 Frida 抓到的 sign/requestId

仅在存在自研签名时使用：

```bash
python3 output/<app>_login_replay.py \
  --dry-run \
  --api <login_password|login_code|send_code|reset_code> \
  --request-id-preimage '<Frida_CRYPTO_IN_preimage>' \
  --expect-sign '<Frida_body_requestId_or_sign>' \
  --param account='<test@example.com>' \
  --param pwd='<password>' \
  --param isEmail=true
```

预期：

```text
-- expect-sign check --
OK: <sign/requestId>
```

如果无自研签名，应输出：

```text
N/A: runtime evidence indicates no custom sign/requestId
```

### 11.2 send 到生产/测试环境

```bash
python3 output/<app>_login_replay.py \
  --send \
  --api login_password \
  --param account='<test@example.com>' \
  --param pwd='<password>' \
  --param isEmail=true \
  --timeout 15
```

### 11.3 send 到本地 CTF IP

```bash
python3 output/<app>_login_replay.py \
  --send \
  --api login_password \
  --base-url http://<local-ip> \
  --sign-base-url https://<production-host> \
  --param account='<test@example.com>' \
  --param pwd='<password>' \
  --param isEmail=true \
  --timeout 15
```

如果 timeout，要明确打印：

```text
classification=network_timeout
status=None
body=<empty>
```

如果 HTTP 有响应但 body 为空，要明确打印：

```text
classification=server_empty_body
status=<status_code>
body=<empty>
```

---

## 12. 证据矩阵要求

最终文档中每个关键结论都要尽量包含证据来源。

建议表格：

```text
结论 | 类型 | 证据来源 | 文件/函数/日志行 | 可信度 | 备注
```

类型包括：

```text
runtime_request
runtime_crypto
python_replay
static_decompile
strings_guess
```

可信度建议：

```text
high: 运行时最终请求或 replay 验证通过
medium: 静态反编译和日志部分吻合
low: 仅 strings/grep 推测
```

---

## 13. 文档输出要求

每轮结束必须更新：

```text
docs/login_reverse_summary.md
docs/next_prompt.md
analysis/header_bootstrap_logic.md
analysis/captures/runtime_key_excerpts.md
```

`docs/login_reverse_summary.md` 至少包含：

```text
1. App 基础信息
2. 认证体系类型与判断依据
3. base URL / env 选择逻辑
4. 登录/验证码/重置/注册/refresh/bootstrap 接口列表
5. 每个接口的 method/path/headers/body/query
6. 运行时最终参数字段，不只写静态方法标签
7. 公共 headers/params
8. token/device/install/session/push 来源
9. sign/requestId/encryption 结论：存在则写算法，不存在则明确 N/A
10. Python replay 使用方法
11. dry-run 验证结果
12. send 验证结果与错误分类
13. 本地 CTF IP 是否可达
14. 未解决问题与下一步建议
15. 敏感 token 脱敏说明
```

`analysis/header_bootstrap_logic.md` 如存在复杂 runtime header/token，必须写：

```text
字段名
来源
生成/获取步骤
是否缓存
过期/刷新逻辑
Python replay 中如何处理
```

`docs/next_prompt.md` 必须面向下一轮工作，包含：

```text
当前已确认结论
当前阻塞点
下一步最小验证路径
建议优先执行的命令
不要重复做的事情
```

---

## 14. 最小闭环优先级

不要一开始就试图还原所有接口。优先完成一个最小闭环：

```text
1. 选一个最关键接口，例如 send_code 或 login_password
2. 通过 Frida 获取运行时最终请求
3. 用 Python dry-run 复现最终请求/sign
4. 用 Python send 得到服务端响应
5. 正确分类响应
6. 保存 capture
7. 再扩展其它接口
```

如果项目很复杂，优先顺序：

```text
认证体系判断 > runtime 最终请求 > token/bootstrap 来源 > Python replay > 其它接口补全 > 文档整理
```

---

## 15. 验收标准

本轮任务完成时必须满足：

```text
1. Python replay 可独立运行
2. --dry-run 能展示最终请求和 canonical/sign 信息
3. 如果存在自研 sign/requestId，--dry-run --expect-sign 能复现 Frida 抓到的值
4. 如果不存在自研签名，明确输出 N/A: no custom signing
5. --send 能打印完整响应或明确 timeout/empty body
6. 不依赖硬编码 Frida 抓到的服务端 token
7. state/bootstrap/refresh 逻辑清楚
8. 登录失败能区分业务失败、参数失败、签名失败、网络不可达
9. 每个关键结论有证据来源
10. 文档和最终回复中的敏感 token 已脱敏
```

最终回复必须使用中文，列出：

```text
关键文件路径
已验证命令
验证结果
错误分类
仍未解决的问题
下一步建议
```
