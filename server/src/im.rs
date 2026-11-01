//! 官方环信账号的只读连接层。
//!
//! 账号 im_id / im_password 从本机官方客户端 plist 读取；密码只留在服务端内存，
//! 浏览器只拿到短期 Easemob access token。当前仅用于读取私信会话和历史，不发送。

use serde_json::{json, Value};
use std::{
    env,
    process::Command,
    time::Duration,
};

/// 官方 App Key 由运行环境提供，不能写进仓库。
/// 格式：org_name#app_name。
pub fn app_key() -> Result<String, String> {
    env::var("SIMPLE_IM_APP_KEY")
        .or_else(|_| env::var("SIMPLE_APP_KEY"))
        .map(|value| value.trim().to_string())
        .map_err(|_| "未配置 SIMPLE_IM_APP_KEY，无法登录官方私信服务。".to_string())
        .and_then(|value| {
            if value.is_empty() {
                Err("SIMPLE_IM_APP_KEY 为空。".to_string())
            } else {
                Ok(value)
            }
        })
}

fn org_and_app(app_key: &str) -> Result<(String, String), String> {
    let (org, app) = app_key
        .split_once('#')
        .ok_or_else(|| "SIMPLE_IM_APP_KEY 格式应为 org#app。".to_string())?;
    if org.is_empty() || app.is_empty() {
        return Err("SIMPLE_IM_APP_KEY 格式应为 org#app。".to_string());
    }
    Ok((org.to_string(), app.to_string()))
}

pub struct Credentials {
    pub user_id: String,
    pub im_id: String,
    password: String,
}

fn string_value(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn official_plist() -> String {
    env::var("SIMPLE_OFFICIAL_PLIST").unwrap_or_else(|_| {
        let home = env::var("HOME").unwrap_or_default();
        format!(
            "{home}/Library/Containers/cn.imsummer.simple/Data/Library/Preferences/cn.imsummer.simple.plist"
        )
    })
}

pub fn load_credentials() -> Result<Credentials, String> {
    let path = official_plist();
    if !std::path::Path::new(&path).exists() {
        return Err("本机没有找到官方客户端私信凭据。".to_string());
    }

    // 用系统 plutil 按 keypath 取字段；整个 plist 转 JSON 会被 NSWindow 等
    // 非 JSON 兼容对象卡住，所以只提取 flutter.UserInfo 这个字符串。
    let output = Command::new("plutil")
        .args([
            "-extract",
            "flutter\\.UserInfo",
            "raw",
            "-o",
            "-",
            &path,
        ])
        .output()
        .map_err(|error| format!("读取官方客户端凭据失败: {error}"))?;

    if !output.status.success() {
        return Err("官方客户端凭据格式无法读取。".to_string());
    }

    let raw = String::from_utf8(output.stdout)
        .map_err(|_| "官方客户端用户信息不是 UTF-8。".to_string())?;
    let user: Value =
        serde_json::from_str(raw.trim()).map_err(|_| "官方用户信息解析失败。".to_string())?;

    let user_id = string_value(user.get("id")).ok_or_else(|| "官方用户 id 缺失。".to_string())?;
    let im_id = string_value(user.get("im_id")).ok_or_else(|| "私信账号 id 缺失。".to_string())?;
    let password = string_value(user.get("im_password"))
        .ok_or_else(|| "私信账号凭据缺失。".to_string())?;

    Ok(Credentials {
        user_id,
        im_id,
        password,
    })
}

pub async fn fetch_token(credentials: &Credentials) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("私信客户端初始化失败: {error}"))?;

    let app_key = app_key()?;
    let (org, app) = org_and_app(&app_key)?;
    let response = client
        .post(format!("https://a1.easemob.com/{org}/{app}/token"))
        .json(&json!({
            "grant_type": "password",
            "username": credentials.im_id,
            "password": credentials.password,
        }))
        .send()
        .await
        .map_err(|error| format!("连接私信服务失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "私信服务登录失败（{}）。",
            response.status().as_u16()
        ));
    }

    let body: Value = response
        .json()
        .await
        .map_err(|_| "私信服务返回格式异常。".to_string())?;
    body.get("access_token")
        .and_then(Value::as_str)
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "私信服务没有返回 access token。".to_string())
}
