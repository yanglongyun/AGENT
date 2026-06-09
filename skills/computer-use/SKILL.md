---
name: computer-use
description: 用 computer-use 控制本机桌面——截屏、移动/点击鼠标、输入文字、按快捷键。涵盖调用方式、screenshot→定位→操作→复查的循环、坐标纪律、dryRun 预演、权限前提。需要操作桌面应用或系统级界面(非网页)时使用。
---

# computer-use:桌面控制

直接驱动本机鼠标键盘和屏幕。由 AGENT 后端进程内执行(不需要插件)。适合:操作桌面应用、系统设置、任何没有网页入口的界面。

## 怎么调用

用 `shell` 发 HTTP:

```sh
curl -s http://127.0.0.1:9500/api/controls/computer/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"computer_screenshot","args":{}}'
```

## 动手前先确认

```sh
curl -s 'http://127.0.0.1:9500/api/controls?type=computer'
```

`computer.connected` 应为 `true`。**macOS** 还需在「系统设置 → 隐私与安全性」给运行 AGENT 的程序开**辅助功能**(动鼠标键盘)和**屏幕录制**(截屏)权限;缺权限时操作会失败或截到黑屏——这种情况让用户去授权。

## 工具

| tool | args | 用途 |
|---|---|---|
| `computer_screenshot` | `{}` | 截屏到本地图片文件,返回路径 |
| `computer_mouse_move` | `{x, y}` | 移动指针 |
| `computer_click` | `{x, y, button?, clicks?}` | 点击(button: left/right/middle) |
| `computer_double_click` | `{x, y}` | 双击 |
| `computer_right_click` | `{x, y}` | 右键 |
| `computer_scroll` | `{direction, amount?}` | 滚动(up/down/left/right) |
| `computer_type` | `{text}` | 输入文字 |
| `computer_key` | `{key, modifiers?}` | 按单键(可带修饰键) |
| `computer_hotkey` | `{keys}` | 组合键,如 `["command","l"]` |

每个动作类工具都支持 `{"dryRun": true}`:**只校验不真动**,用来先验证参数/坐标。

## 核心循环:看 → 定位 → 操作 → 复查

1. `computer_screenshot` 截屏。
2. **看图**定出目标的像素坐标(截图要能作为视觉上下文喂给模型,需在「设置」里开 **Tool Vision**;没开就只有路径、看不到内容)。
3. 用 `computer_click` / `computer_type` 等操作。
4. **再截一张**确认结果符合预期,再走下一步。

不要连续盲点多步;每个关键动作后复查。

## 坐标纪律

- 坐标只基于**最近一次截图**的实际像素——界面一变就重新截图重新定位,别用旧坐标。
- 不确定能不能点中时,先 `dryRun` 或先 `mouse_move` 看落点,再真点。

## 何时用 / 不用

- **桌面应用、系统设置、原生界面** → computer-use。
- **网页** → 优先 **web-use**(基于选择器,比按坐标点稳得多)。
- **纯文件、命令、构建** → 直接 `shell`,别用桌面控制绕。

## 注意

- 无沙箱,会**真的**移动你的鼠标、敲你的键盘。**破坏性或不可逆操作前先跟用户确认。**
- 操作期间尽量别让用户同时抢鼠标,否则坐标会错位。
