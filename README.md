# Simple — 登录与关注（SwiftUI / macOS）

1180 × 730 的 macOS 原生界面。启动先播放黑底「单纯交个朋友」屏闪，淡出后进入暖白纸面 + 宋体标题的登录页；登录成功后整窗切到关注页（左侧图标栏 + 关注 / 广场 / 发现三栏），退出登录回到登录页。青绿 `#00BCB7` 只做强调色。

登录方式只有一种：手机号 + 短信验证码，**已接真实接口**。

## 运行

需要 macOS 13 或更高版本，以及 Xcode 15 / Swift 5.9 工具链。

- Xcode：打开本目录的 `Package.swift`，选择 `SimpleLogin` scheme，点击 Run。
- 终端：`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift run SimpleLogin`。
  直接 `swift run` 若报 SwiftUI 宏错误，说明当前默认是 Command Line Tools，上面的命令会改用 Xcode 工具链。

## 已实现

- 屏闪：黑底、细宋体角标、底部 Simple 声波标识；约 2.8 秒后淡出，点击或 Esc 可提前跳过；开启「减弱动态效果」时缩短等待。
- 登录：固定 +86 前缀，11 位手机号；「获取验证码」后进入 60 秒倒计时；验证码 4 位；本地格式校验 + 失焦校验 + 多错误汇总。
- 真实链路：换 `auth_token` → `/phone_messages/deliveries` 发码 → `/phone_messages/verifications` 校验 → `/current_user` 验证会话 → 落盘。
- 会话恢复：启动时若本地令牌仍有效，直接进入关注页，不必每次发短信。
- 关注页：左侧图标栏（消息、频道、账号菜单），顶部 Simple 标 + 三栏 tab + 居中搜索 + 发布动态；内容区按 tab 加载真实数据。
- 动态卡片：头像、昵称、相对时间、正文、图片网格、评论数与爱心；点赞乐观更新，失败回滚。
- 图片排版按数量自适应：1 张整行 4:3，2 张两列，3 张以上九宫格；加载中显示转圈，失败显示占位图。
- 点击任意配图弹出全屏预览：深色遮罩、居中按比例缩放，点遮罩或按 Esc 关闭。
- 视频动态：用 `media[].thumbnail_url` 做封面并叠播放按钮，点击弹出播放器（`AVKit` 的 `AVPlayerView`），关闭即暂停。
  注意不能用 SwiftUI 的 `VideoPlayer`——在 SPM 裸可执行文件里会因 Objective-C 元数据问题直接崩溃。
- 无限加载：关注与广场都支持触底翻页，游标是上一页最后一条的 id；加载中显示转圈，到底显示「没有更多了」。
- 评论面板：`/comments?post_id=`，作者评论带「作者」标记，可点赞；评论本身也支持触底翻页。
- 楼中楼：有回复的评论下方显示「查看 N 条回复」，点开按需拉取 `comments/replies`，回复缩进展示、带「作者」标记，可收起。
- 发表评论：评论面板底部有输入框与「发送」，成功后新评论直接插到列表顶部，失败显示在输入框上方。
- 回复评论：每条评论右侧有「回复」，点后输入框切换到回复态（可 × 取消），发送走楼中楼接口，回复落到该评论下方并自动展开。
- 空状态：关注流为空、发现无接口、网络失败时都走原有的空状态样式，不额外设计。

## 数据来源

| 页面 | 接口 |
|---|---|
| 关注 | `GET /api/v3/posts/followings[?last_id=<上页最后一条 id>]` |
| 广场 | `GET /api/v3/posts[?last_id=<上页最后一条 id>]` |
| 评论 | `GET /api/v3/comments?post_id=[&last_id=<上页最后一条>]` |
| 回复 | `GET /api/v3/comments/replies?comment_id=` |
| 发表评论 | `POST /api/v3/comments { post_id, content }` → 201 |
| 回复评论 | `POST /api/v3/comments/replies { comment_id, content }` → 201 |
| 删除评论 | `DELETE /api/v3/comments/<id>` |
| 点赞 | `POST /api/v3/votes { post_id }` / `DELETE /api/v3/votes?post_id=` |
| 评论点赞 | `POST /api/v3/comment_votes { comment_id }` / `DELETE /api/v3/comment_votes?comment_id=` |
| 当前用户 | `GET /api/v3/current_user` |
| 夜市列表 | `GET /api/v3/night_markets?last_id=&per_page=10` |
| 夜市开市状态 | `GET /api/v3/night_markets/banners` |
| 进房 / 退房 | `POST /api/v3/voice_members { channel_id }` / `DELETE /api/v3/voice_members?channel_id=` |

图片走 `static-simple.imsummer.cn`，用 `AsyncImage` 加载，失败显示占位图标。

## 说明

- 令牌写入 `~/Library/Application Support/SimpleLogin/session.json`（0600）；验证码不落盘。
- 登录成功需要服务端能发短信；服务端有 IP 级（约 60 秒）和号码级（约 5 分钟）双重限流，触发时错误显示在原有字段错误位，号码级会把倒计时延长到 300 秒。
- **手机号即账号**：未注册过的号码在校验阶段会自动创建新账号，登录原账号必须用原号码。
- 回复走 `/comments/replies`，参数是 `comment_id`（被回复那条评论的 id）+ `content`；只做一层，不再嵌套。
- 分页参数是 `last_id`（上一页最后一条的 id），每页 10 条；服务端不认 `page` / `offset` / `before` 等常见写法。
- 拼 URL 时不要用 `appendingPathComponent`，它会把 `?last_id=…` 转义进路径导致参数丢失——这里踩过。
- `/api/v3/moments` 是「动态」流，对关注关系不返回内容，不要用它做关注页。
- 工程以 Swift Package 形式提供，不含签名、App 图标与发布配置。

## 夜市

- 大厅列表走 `GET /api/v3/night_markets?last_id=&per_page=10`，游标翻页，实测 43 条。
  两个坑：不带 `appVersionCode` 请求头时服务端只给 4 条（按 Web 端限流）；
  `per_page` 上限是 10，超过会 400。
- 进房用 `POST /api/v3/voice_members { channel_id }`（201），退房 `DELETE voice_members?channel_id=`。
- **房间内的语音、文字消息、成员明细尚未接入**：语音需要声网 SDK；聊天与成员名单走环信
  （`chat_room.im_id`），macOS 上要经 WKWebView 桥接环信 Web SDK，目前是本地演示数据。
