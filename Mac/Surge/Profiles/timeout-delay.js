// Surge Script: 模拟请求超时
// 用途：让匹配的请求挂起，不返回响应，直到 Surge 的 timeout 参数触发超时

// 不调用 $done()，让请求一直挂起
// Surge 会在达到 timeout 时间后自动超时

// 可选：打印日志查看拦截情况
console.log(`[Timeout] 拦截请求: ${$request.url}`);

// 注意：不要调用 $done()，这样请求会一直挂起直到超时
