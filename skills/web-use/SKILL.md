---
name: web-use
description: 用 browser-use(Chrome 扩展)操作网页——开页、读文本、点击、填表、截图、执行 JS。涵盖调用方式、何时用 read 还是 screenshot、多步表单流程、断连与找不到元素的恢复。处理任何需要真实浏览器的网页任务时使用。
---

# web-use:浏览器控制

通过本机 AGENT 把任务交给 Chrome 扩展在**真实浏览器**里执行。适合:打开网站、读网页内容、点按钮、填表单、走多步网页流程、截图看版面。

## 怎么调用

用 `shell` 发 HTTP(当前 AI 工具只有 `shell`,控制能力走 HTTP):

```sh
curl -s http://127.0.0.1:9500/api/controls/browser/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"browser_open","args":{"url":"example.com"}}'
```

返回 `{"ok":true,"tool":...,"result":...}`;失败是 `{"ok":false,"error":...}`。

## 动手前先确认连接

```sh
curl -s 'http://127.0.0.1:9500/api/controls?type=browser'
```

`browser.connected` 必须为 `true`。若为 `false`,说明 Chrome 扩展没连上——**别硬调**,直接告诉用户去 `chrome://extensions` 加载 `extension/` 目录并保持 Chrome 开着,再继续。

## 工具

| tool | args | 用途 |
|---|---|---|
| `browser_open` | `{url}` | 新标签打开网址,等加载完成 |
| `browser_read` | `{}` | 取当前页可见文本(截断到约 12k 字) |
| `browser_click` | `{selector}` | 按 CSS 选择器点击;选择器找不到时按**可见文本**匹配 |
| `browser_fill` | `{selector, value}` | 往输入框/文本域填值 |
| `browser_screenshot` | `{}` | 截当前页 |
| `browser_navigate` | `{url}` | 当前标签导航 |
| `browser_tabs` | `{}` | 列标签页 |
| `browser_evaluate` | `{script}` | 页面里执行 JS 表达式并取返回值(兜底) |

## 策略

- **优先 `browser_read` 而不是截图**——要的是文字信息时,读文本更省、更准。`browser_screenshot` 只在需要看**版面/视觉**或定位不可读元素时用。
- **先 read 再动手**:`browser_open` 后先 `browser_read` 确认到了对的页、看清结构,再点/填。
- **选择器优先,文本兜底**:`browser_click` 传 CSS selector 最稳;不确定时可传按钮的可见文本(它会按文本匹配)。
- **多步表单**:`open → read`(确认字段)`→ fill … → click 提交 → read`(确认结果)。每一步后 read 一下验证,别盲连。
- **`browser_evaluate` 是最后手段**:语义工具搞不定的取值/判断,才用 JS。

## 错误恢复

- `浏览器扩展未连接` → 见上面"动手前确认",让用户连扩展。
- `未找到可点击元素 / 未找到输入框` → 先 `browser_read` 或 `browser_screenshot` 看真实结构,换选择器或文本再试,别重复同一个失败调用。
- 调用超时 → 页面可能还在加载;隔一下重试一次,仍失败就如实报告。

## 注意

- 这是在**用户自己的浏览器**里操作,带着用户的登录态。**有破坏性/不可逆的动作(下单、删除、发送、付款)前必须先跟用户确认。**
- 网页任务优先用 web-use(基于选择器,比桌面控制按坐标点更稳)。纯本地文件/命令用 `shell`,整机/桌面应用才用 computer-use。
