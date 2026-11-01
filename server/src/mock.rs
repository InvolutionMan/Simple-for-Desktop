//! `--mock` 用的固定数据：没有网络、没有账号也能把界面点一遍。
//! 时间统一用 epoch 秒，前端的相对时间解析两种格式都认。

use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

pub fn me() -> Value {
    json!({
        "id": "u_demo_me",
        "nickname": "示例用户",
        "avatar_url": null,
        "avatar_color": "beede7",
    })
}

pub fn feed(tab: &str) -> Value {
    let t = now();
    let mut posts = vec![
        json!({
            "id": "p1",
            "content": "今晚的夜市开到两点，风从窗缝里钻进来，像有人轻轻敲门。有没有人也还没睡？",
            "created_at": t - 240,
            "comments_count": 3,
            "is_voted": false,
            "votes_count": 38,
            "media": [
                { "url": "/mock/photo-1.svg" },
                { "url": "/mock/photo-2.svg" },
                { "url": "/mock/photo-3.svg" }
            ],
            "user": { "id": "u_demo_a", "nickname": "示例用户", "avatar_url": null, "avatar_color": "beede7" }
        }),
        json!({
            "id": "p_music",
            "content": "今晚单曲循环的一首，分享给你。",
            "created_at": t - 1800,
            "comments_count": 0,
            "is_voted": false,
            "votes_count": 9,
            "media": [
                {
                    "type": "music",
                    "url": "Piggy《很适合在月光下》https://y.qq.com/n/ryqq/songDetail/003qPuBb1rH4ml @QQ音乐",
                    "music": {
                        "music_id": "003qPuBb1rH4ml",
                        "music_img": "/mock/photo-3.svg",
                        "music_url": "https://y.qq.com/n/ryqq/songDetail/003qPuBb1rH4ml",
                        "music_title": "很适合在月光下",
                        "music_author": "Piggy",
                        "music_share_url": "https://y.qq.com/n/ryqq/songDetail/003qPuBb1rH4ml"
                    }
                },
                { "url": "/mock/photo-5.svg" }
            ],
            "user": { "id": "u_demo_b", "nickname": "示例用户A", "avatar_url": null, "avatar_color": "fbf1d7" }
        }),
        json!({
            "id": "p2",
            "content": "今天路过一家旧书店，老板把《示例用户E西飞》放在了门口，说「这本适合今天」。我买下了，封面有一点卷边。 #旧书店",
            "created_at": t - 3 * 3600,
            "comments_count": 0,
            "is_voted": true,
            "votes_count": 12,
            "media": [],
            "user": { "id": "u_demo_b", "nickname": "示例用户A", "avatar_url": null, "avatar_color": "fbf1d7" }
        }),
        json!({
            "id": "p3",
            "content": "凌晨一点的便利店，关东煮的汤在冒泡。我坐在窗边，看对面楼的灯一盏一盏灭掉。",
            "created_at": t - 9 * 3600,
            "comments_count": 1,
            "is_voted": false,
            "votes_count": 6,
            "media": [{ "url": "/mock/photo-4.svg" }],
            "user": { "id": "u_demo_c", "nickname": "示例用户B", "avatar_url": null, "avatar_color": "ffacbc" }
        }),
        json!({
            "id": "p4",
            "content": "把巷子里的风声录了下来，三十秒。",
            "created_at": t - 26 * 3600,
            "comments_count": 0,
            "is_voted": false,
            "votes_count": 3,
            "media": [{ "url": "/mock/clip.mp4", "type": "video", "thumbnail_url": "/mock/photo-5.svg" }],
            "user": { "id": "u_demo_d", "nickname": "示例用户C", "avatar_url": null, "avatar_color": "cfe8e6" }
        }),
        json!({
            "id": "p5",
            "content": "周末去了海边，风把头发吹得乱七八糟。海浪声比想象中更近。",
            "created_at": t - 2 * 86400,
            "comments_count": 0,
            "is_voted": false,
            "votes_count": 21,
            "media": [
                { "url": "/mock/photo-6.svg" },
                { "url": "/mock/photo-1.svg" },
                { "url": "/mock/photo-2.svg" },
                { "url": "/mock/photo-3.svg" }
            ],
            "user": { "id": "u_demo_b", "nickname": "示例用户A", "avatar_url": null, "avatar_color": "fbf1d7" }
        }),
    ];

    if tab == "plaza" {
        posts.reverse();
    }
    Value::Array(posts)
}


/// 个人主页预览：当前 mock 用户的真实结构动态（只用于离线预览）。
pub fn profile_posts() -> Value {
    let t = now();
    json!([
        {
            "id": "mine-1",
            "content": "把今天听到的风声留在动态里。",
            "created_at": t - 420,
            "comments_count": 0,
            "is_voted": false,
            "votes_count": 4,
            "media": [{ "url": "/mock/photo-4.svg" }],
            "user": { "id": "u_demo_me", "nickname": "示例用户", "avatar_url": null, "avatar_color": "beede7" }
        },
        {
            "id": "mine-2",
            "content": "凌晨两点的便利店，关东煮的汤还在冒泡。",
            "created_at": t - 86400,
            "comments_count": 1,
            "is_voted": true,
            "votes_count": 12,
            "media": [],
            "user": { "id": "u_demo_me", "nickname": "示例用户", "avatar_url": null, "avatar_color": "beede7" }
        }
    ])
}


/// 频道中心预览：只返回当前账号已加入的两个示例频道。
pub fn channels() -> Value {
    json!([
        {
            "id": "mock-night-ship",
            "name": "示例用户E船",
            "icon": "",
            "description": "给还没睡的人",
            "members": 128,
            "role": "normal_user_role",
            "sections": [
                { "id": "m-radio", "name": "深夜电台" },
                { "id": "m-reading", "name": "读书角" },
                { "id": "m-city", "name": "城市漫游" }
            ],
            "chat_rooms": [
                { "id": "mock-room-night", "name": "示例用户E船讨论组", "im_id": "mock-group-night", "group_id": "mock-group-id-night", "role": "normal_user_role", "section": "讨论组", "channel_id": "mock-night-ship" }
            ],
            "voice_rooms": [
                { "id": "mock-voice-night", "name": "示例用户E船语音房", "im_id": "mock-voice-im", "chat_room_id": "mock-voice-id", "members": 6, "section": "语音房", "channel_id": "mock-night-ship" }
            ]
        },
        {
            "id": "mock-old-books",
            "name": "旧书店",
            "icon": "",
            "description": "纸页、旧书与慢时光",
            "members": 86,
            "role": "normal_user_role",
            "sections": [
                { "id": "m-books", "name": "书单" },
                { "id": "m-finds", "name": "淘书" }
            ],
            "chat_rooms": [
                { "id": "mock-room-books", "name": "旧书店讨论组", "im_id": "mock-group-books", "group_id": "mock-group-id-books", "role": "normal_user_role", "section": "讨论组", "channel_id": "mock-old-books" }
            ],
            "voice_rooms": []
        }
    ])
}

pub fn channel_posts(root_id: &str) -> Value {
    let section = if root_id == "mock-night-ship" { "m-radio" } else { "m-books" };
    json!([
        {
            "id": format!("{root_id}-post-1"),
            "content": "这是频道里的第一条示例动态，用来预览真实的帖子卡片版式。",
            "created_at": now() - 600,
            "comments_count": 3,
            "is_voted": false,
            "votes_count": 12,
            "media": [],
            "channel": { "id": section, "name": if root_id == "mock-night-ship" { "深夜电台" } else { "书单" } },
            "user": { "id": "u_demo_a", "nickname": "示例用户", "avatar_url": null, "avatar_color": "beede7" }
        }
    ])
}

pub fn comments() -> Value {
    let t = now();
    json!([
        {
            "id": "c1",
            "content": "风从窗缝里钻进来这句，太熟悉了。今晚我也还没睡。",
            "created_at": t - 150,
            "is_author": false,
            "is_voted": false,
            "replies_count": 2,
            "user": { "id": "u_demo_c", "nickname": "示例用户B", "avatar_url": null, "avatar_color": "ffacbc" }
        },
        {
            "id": "c2",
            "content": "谢谢你来。今晚的灯给你留一盏。",
            "created_at": t - 130,
            "is_author": true,
            "is_voted": true,
            "replies_count": 0,
            "user": { "id": "u_demo_a", "nickname": "示例用户", "avatar_url": null, "avatar_color": "beede7" }
        },
        {
            "id": "c3",
            "content": "我刚下班，路过夜市，看到这个房间还亮着。",
            "created_at": t - 60,
            "is_author": false,
            "is_voted": false,
            "replies_count": 0,
            "user": { "id": "u_demo_d", "nickname": "示例用户C", "avatar_url": null, "avatar_color": "cfe8e6" }
        }
    ])
}

pub fn replies() -> Value {
    let t = now();
    json!([
        {
            "id": "r1",
            "content": "同没睡。窗缝那个比喻很轻，像真的有人来过。",
            "created_at": t - 120,
            "is_author": false,
            "is_voted": false,
            "replies_count": 0,
            "user": { "id": "u_demo_b", "nickname": "示例用户A", "avatar_url": null, "avatar_color": "fbf1d7" }
        },
        {
            "id": "r2",
            "content": "那就一起醒着，等风停。",
            "created_at": t - 100,
            "is_author": true,
            "is_voted": false,
            "replies_count": 0,
            "user": { "id": "u_demo_a", "nickname": "示例用户", "avatar_url": null, "avatar_color": "beede7" }
        }
    ])
}

pub fn night_markets() -> Value {
    json!({
        "is_open": true,
        "end_at": "02:00",
        "channels": [
            { "id": "r1", "name": "空房回响", "count": 1, "im_id": "im-1", "root_name": "夜市" },
            { "id": "r2", "name": "乌托邦", "count": 6, "im_id": "im-2", "root_name": "夜市" },
            { "id": "r3", "name": "🌲 霸道总裁爱上自律", "count": 3, "im_id": "im-3", "root_name": "夜市" },
            { "id": "r4", "name": "花开富贵的聊天室", "count": 0, "im_id": "im-4", "root_name": "夜市" },
            { "id": "r5", "name": "小树屋 // 出差版", "count": 2, "im_id": "im-5", "root_name": "夜市" },
            { "id": "r6", "name": "让我完整睡觉吧", "count": 1, "im_id": "im-6", "root_name": "夜市" },
            { "id": "r7", "name": "遇事不决 别问春风", "count": 4, "im_id": "im-7", "root_name": "夜市" },
            { "id": "r8", "name": "豆某人 ddl（´▽`）", "count": 1, "im_id": "im-8", "root_name": "夜市" }
        ]
    })
}

pub fn night_counts() -> Value {
    json!({
        "counts": {
            "r1": 1, "r2": 7, "r3": 3, "r4": 0,
            "r5": 2, "r6": 1, "r7": 4, "r8": 1
        }
    })
}

pub fn room_state(room_id: &str) -> Value {
    json!({
        "count": 12,
        "mic_mode": "freedom_mic",
        "seats_ok": true,
        "seats_error": Value::Null,
        "joined": true,
        "room_id": room_id,
        "seats": [
            { "id": "u_demo_a", "nickname": "示例用户", "avatar_url": null, "avatar_color": "beede7", "role": "creator_role", "im_id": "im-me" },
            { "id": "u_demo_c", "nickname": "示例用户B", "avatar_url": null, "avatar_color": "ffacbc", "role": "admin_role", "im_id": "im-yuan" },
            { "id": "u_demo_b", "nickname": "示例用户A", "avatar_url": null, "avatar_color": "fbf1d7", "role": "", "im_id": "im-zhi" },
            { "id": "u_demo_d", "nickname": "示例用户C", "avatar_url": null, "avatar_color": "cfe8e6", "role": "", "im_id": "im-nan" },
            { "id": "u_demo_e", "nickname": "示例用户D", "avatar_url": null, "avatar_color": "f6e3c5", "role": "", "im_id": "im-qi" },
            { "id": "u_demo_f", "nickname": "示例用户E", "avatar_url": null, "avatar_color": "d9d2f0", "role": "", "im_id": "im-ye" }
        ]
    })
}

pub fn created_comment(content: &str) -> Value {
    json!({
        "id": format!("mock-c-{}", now()),
        "content": content,
        "created_at": now(),
        "is_author": true,
        "is_voted": false,
        "replies_count": 0,
        "user": me()
    })
}

pub fn created_reply(content: &str) -> Value {
    json!({
        "id": format!("mock-r-{}", now()),
        "content": content,
        "created_at": now(),
        "is_author": true,
        "is_voted": false,
        "replies_count": 0,
        "user": me()
    })
}
