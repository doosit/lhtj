/*
------------------------------------------
@Author: doosit
@Date: 2026/03/29 19:42:08
@Description: 龙湖天街小程序/APP签到、抽奖
------------------------------------------
获取 Cookie：打开龙湖天街小程序，进入 我的 - 签到赚珑珠 - 任务赚奖励 - 马上签到。
Loon 插件：请直接导入仓库中的 lhtj.plugin

图标：https://raw.githubusercontent.com/doosit/lhtj/main/logo/logo.png

⚠️【免责声明】
------------------------------------------
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
8、脚本根据https://raw.githubusercontent.com/leiyiyan项目优化而来
*/
const component_app = "CF17F20C54L0SYEZ";
const activity_app = "AP26E022L8FTDAWH";
const component = "CW16530P28V520GL";
const activity = "AP26P012R90F1UKX";
const activity_sign = "11111111111686241863606037740000";
const activity_sign_app = "11111111111736501868255956070000";
const $ = new Env("龙湖天街");
const ckName = "lhtj_data";
let userCookie = loadUserCookies();
//notify
const notify = $.isNode() ? require('./sendNotify') : '';
$.notifyMsg = [];
//debug
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';
$.doFlag = { "true": "✅", "false": "⛔️" };
$.ckStatus = true;
$.ckExpired = false;
$.lastError = null;
//------------------------------------------
const baseUrl = "";
const _headers = {};
const EXPIRED_PATTERNS = /登录已过期|用户未登录|登录失效|token(?:已)?失效|请重新登录|请登录/i;
const REQUIRED_CAPTURE_FIELDS = [
    "cookie",
    "token",
    "x-lf-dxrisk-token",
    "x-lf-channel",
    "x-lf-usertoken",
    "x-lf-bu-code",
    "x-lf-dxrisk-source"
];

//------------------------------------------
const fetch = async (o) => {
    try {
        if (typeof o === 'string') o = { url: o };
        if (o?.url?.startsWith("/") || o?.url?.startsWith(":")) o.url = baseUrl + o.url;
        const res = await Request({ ...o, headers: o.headers || _headers, url: o.url });
        debug(res, o?.url?.replace(/\/+$/, '').substring(o?.url?.lastIndexOf('/') + 1));
        const responseMessage = getResponseMessage(res);
        if (responseMessage && EXPIRED_PATTERNS.test(responseMessage)) {
            const error = new Error(responseMessage);
            error.isCookieExpired = true;
            throw error;
        }
        return res;
    } catch (e) {
        $.ckStatus = false;
        $.ckExpired = Boolean(e?.isCookieExpired);
        $.lastError = e;
        $.log(`⛔️ 请求发起失败！${e?.message || e}`);
        return null;
    }
};
async function main() {
    try {
        const cleanedUsers = dedupeUsers(userCookie);
        if ($.toStr(cleanedUsers) !== $.toStr(userCookie)) {
            userCookie = cleanedUsers;
            saveUserCookies();
        }
        const runnableUsers = userCookie.filter(isUsableUser);
        //check accounts
        if (!runnableUsers?.length) {
            if (userCookie.length) throw new Error("已捕获到未完整的Cookie信息，请重新打开签到页触发相关请求以补全Cookie");
            throw new Error("找不到可用的帐户");
        }
        $.log(`⚙️ 发现 ${runnableUsers?.length ?? 0} 个可用帐户\n`);
        //doTask of userList
        const users = [...runnableUsers];
        for (const [index, user] of users.entries()) {
            //init of user
            $.log(`🚀 开始任务：${user.userName || `账号${index + 1}`}`);
            $.notifyMsg = [];
            $.ckStatus = true;
            $.ckExpired = false;
            $.lastError = null;
            $.title = "";
            $.avatar = "";

            // 签到
            const reward_num = Number(await signin(user) || 0);
            // APP签到
            const reward_num2 = Number(await signin2(user) || 0);
            if ($.ckStatus) {
                // 抽奖签到
                await lotterySignin(user);
                // 抽奖
                await lotteryClock(user);
                //APP
                await lotterySignin3(user);
                //APP
                await lotteryClock3(user);
                // 老抽奖签到
                //await lotterySignin2(user)
                // 老抽奖
                //await lotteryClock2(user)
                //查询用户信息
                const userInfo = await getUserInfo(user) || {};
                //查询珑珠
                const balanceInfo = await getBalance(user) || {};
                const { nick_name = user.userName, growth_value = 0, level = 0, head_portrait = "" } = userInfo;
                const { balance = 0 } = balanceInfo;
                $.avatar = head_portrait;
                $.title = `本次运行共获得${reward_num + reward_num2}积分`;
                DoubleLog(`当前用户:${nick_name}\n成长值: ${growth_value}  等级: V${level}  珑珠: ${balance}`);
                updateUserRecord(user, buildUserProfilePatch(user, userInfo));
            } else {
                const accountName = user.userName || `账号${index + 1}`;
                if ($.ckExpired) {
                    removeUserRecord(user, $.lastError?.message || "登录已过期");
                    DoubleLog(`⛔️ 「${accountName}」Cookie已失效，已自动清理`);
                } else {
                    DoubleLog(`⛔️ 「${accountName}」请求失败，本次跳过`);
                }
            }
            //notify
            await sendMsg($.notifyMsg.join("\n"));
        }
    } catch (e) {
        throw e;
    }
}

//签到
async function signin(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod/openapi/task/v1/signature/clock",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'token': user.token,
                'x-lf-dxrisk-token': user['x-lf-dxrisk-token'],
                'x-gaia-api-key': 'c06753f1-3e68-437d-b592-b94656ea5517',
                'x-lf-bu-code': user['x-lf-bu-code'],
                'x-lf-channel': user['x-lf-channel'],
                'origin': 'https://longzhu.longfor.com',
                'referer': 'https://longzhu.longfor.com/',
                'x-lf-dxrisk-source': user['x-lf-dxrisk-source'],
                'x-lf-usertoken': user['x-lf-usertoken']
            },
            type: 'post',
            dataType: "json",
            body: {
                'activity_no': activity_sign
            }
        }
        let res = await fetch(opts);
        const reward_num = res?.data?.is_popup == 1 ? res?.data?.reward_info[0]?.reward_num : 0
        $.log(`${$.doFlag[res?.data?.is_popup == 1]} ${res?.data?.is_popup == 1 ? '每日签到: 成功, 获得' + res?.data?.reward_info[0]?.reward_num + '分' : '每日签到: 今日已签到'}\n`);
        return reward_num
    } catch (e) {
        $.log(`⛔️ 每日签到失败！${e}\n`)
    }
}

//APP签到
async function signin2(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod/openapi/task/v1/signature/clock",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'token': user.token,
                'x-lf-dxrisk-token': user['x-lf-dxrisk-token'],
                'x-gaia-api-key': 'c06753f1-3e68-437d-b592-b94656ea5517',
                'x-lf-bu-code': user['x-lf-bu-code'],
                'x-lf-channel': user['x-lf-channel'],
                'origin': 'https://longzhu.longfor.com',
                'referer': 'https://longzhu.longfor.com/',
                'x-lf-dxrisk-source': user['x-lf-dxrisk-source'],
                'x-lf-usertoken': user['x-lf-usertoken']
            },
            type: 'post',
            dataType: "json",
            body: {
                'activity_no': activity_sign_app
            }
        }
        let res = await fetch(opts);
        const reward_num2 = res?.data?.is_popup == 1 ? res?.data?.reward_info[0]?.reward_num : 0
        $.log(`${$.doFlag[res?.data?.is_popup == 1]} ${res?.data?.is_popup == 1 ? 'APP每日签到: 成功, 获得' + res?.data?.reward_info[0]?.reward_num + '分' : 'APP每日签到: 今日已签到'}\n`);
        return reward_num2
    } catch (e) {
        $.log(`⛔️ APP每日签到失败！${e}\n`)
    }
}


// 抽奖签到
async function lotterySignin(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/sign",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'x-lf-dxrisk-source': user['x-lf-dxrisk-source'],
                'x-lf-dxrisk-token': user['x-lf-dxrisk-token'],
                'x-gaia-api-key': '2f9e3889-91d9-4684-8ff5-24d881438eaf',
                'bucode': user['x-lf-bu-code'],
                'channel': user['x-lf-channel'],
                'authtoken': user['x-lf-usertoken'],
                'origin': 'https://llt.longfor.com',
                'referer': 'https://llt.longfor.com/'
            },
            type: 'post',
            dataType: "json",
            body: {
                "component_no": component,
                "activity_no": activity
            }
        }
        let res = await fetch(opts);
        $.log(`${$.doFlag[res?.code == '0000']} ${res?.code == '0000' ? '抽奖签到: 成功, 获得' + res?.data?.chance + '次抽奖机会' : '抽奖签到: ' + res?.message}\n`);
    } catch (e) {
        $.log(`⛔️ 抽奖签到失败！${e}\n`)
    }
}
// 抽奖
async function lotteryClock(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/click",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'x-lf-dxrisk-source': user['x-lf-dxrisk-source'],
                'x-lf-dxrisk-token': user['x-lf-dxrisk-token'],
                'x-gaia-api-key': '2f9e3889-91d9-4684-8ff5-24d881438eaf',
                'bucode': user['x-lf-bu-code'],
                'channel': user['x-lf-channel'],
                'authtoken': user['x-lf-usertoken'],
                'origin': 'https://llt.longfor.com',
                'referer': 'https://llt.longfor.com/'
            },
            type: 'post',
            dataType: "json",
            body: {
                "component_no": component,
                "activity_no": activity,
                "batch_no": 0
            }
        }
        let res = await fetch(opts);
        $.log(`${$.doFlag[res?.code == '0000']} ${res?.code == '0000' ? '抽奖成功, 获得' + res?.data?.reward_num : '抽奖: ' + res?.message}\n`);
    } catch (e) {
        $.log(`⛔️ 抽奖失败！${e}\n`)
    }
}


// app抽奖签到
async function lotterySignin3(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/sign",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'x-lf-dxrisk-source': user['x-lf-dxrisk-source'],
                'x-lf-dxrisk-token': user['x-lf-dxrisk-token'],
                'x-gaia-api-key': '2f9e3889-91d9-4684-8ff5-24d881438eaf',
                'bucode': user['x-lf-bu-code'],
                'channel': user['x-lf-channel'],
                'authtoken': user['x-lf-usertoken'],
                'origin': 'https://llt.longfor.com',
                'referer': 'https://llt.longfor.com/'
            },
            type: 'post',
            dataType: "json",
            body: {
                "component_no": component_app,
                "activity_no": activity_app
            }
        }
        let res = await fetch(opts);
        $.log(`${$.doFlag[res?.code == '0000']} ${res?.code == '0000' ? 'APP抽奖签到: 成功, 获得' + res?.data?.chance + '次抽奖机会' : 'APP抽奖签到: ' + res?.message}\n`);
    } catch (e) {
        $.log(`⛔️ APP抽奖签到失败！${e}\n`)
    }
}
// APP抽奖
async function lotteryClock3(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/click",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'x-lf-dxrisk-source': user['x-lf-dxrisk-source'],
                'x-lf-dxrisk-token': user['x-lf-dxrisk-token'],
                'x-gaia-api-key': '2f9e3889-91d9-4684-8ff5-24d881438eaf',
                'bucode': user['x-lf-bu-code'],
                'channel': user['x-lf-channel'],
                'authtoken': user['x-lf-usertoken'],
                'origin': 'https://llt.longfor.com',
                'referer': 'https://llt.longfor.com/'
            },
            type: 'post',
            dataType: "json",
            body: {
                "component_no": component_app,
                "activity_no": activity_app,
                "batch_no": 0
            }
        }
        let res = await fetch(opts);
        $.log(`${$.doFlag[res?.code == '0000']} ${res?.code == '0000' ? 'APP抽奖成功, 获得' + res?.data?.reward_num : 'APP抽奖: ' + res?.message}\n`);
    } catch (e) {
        $.log(`⛔️ APP抽奖失败！${e}\n`)
    }
}


// 老抽奖签到
async function lotterySignin2(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod/openapi/task/v1/lottery/sign",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'x-lf-usertoken': user.token,
                'x-gaia-api-key': 'c06753f1-3e68-437d-b592-b94656ea5517',
                'x-lf-bu-code': user['x-lf-bu-code'],
                'x-lf-channel': user['x-lf-channel'],
                'origin': 'https://longzhu.longfor.com',
                'referer': 'https://longzhu.longfor.com/'
            },
            type: 'post',
            dataType: "json",
            body: {
                "task_id": "",
                "activity_no": "11111111111735633282374092760000"
            }
        }
        let res = await fetch(opts);
        $.log(`${$.doFlag[res?.code == '0000']} ${res?.code == '0000' ? '老抽奖签到: 成功, 获得' + res?.data?.ticket_times + '次抽奖机会' : '老抽奖签到: ' + res?.message}\n`);
    } catch (e) {
        $.log(`⛔️ 老抽奖签到失败！${e}\n`)
    }
}
// 老抽奖
async function lotteryClock2(user) {
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod/openapi/task/v1/lottery/luck",
            headers: {
                'cookie': user.cookie,
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'x-lf-usertoken': user.token,
                'x-lf-dxrisk-token': user['x-lf-dxrisk-token'],
                'x-gaia-api-key': 'c06753f1-3e68-437d-b592-b94656ea5517',
                'x-lf-bu-code': user['x-lf-bu-code'],
                'x-lf-channel': user['x-lf-channel'],
                'origin': 'https://longzhu.longfor.com',
                'referer': 'https://longzhu.longfor.com/',
                'x-lf-dxrisk-source': user['x-lf-dxrisk-source']
            },
            type: 'post',
            dataType: "json",
            body: {
                "task_id": "",
                "time": getDateTime(),
                "activity_no": "11111111111735633282374092760000",
                "use_luck": 0
            }
        }
        let res = await fetch(opts);
        $.log(`${$.doFlag[res?.code == '0000']} ${res?.code == '0000' ? '老抽奖成功, 获得' + res?.data?.desc : '老抽奖: ' + res?.message}\n`);
    } catch (e) {
        $.log(`⛔️ 老抽奖失败！${e}\n`)
    }
}



//查询用户信息
async function getUserInfo(user) {
    try {
        const opts = {
            url: "https://longzhu-api.longfor.com/lmember-member-open-api-prod/api/member/v1/mine-info",
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'Referer': 'https://servicewechat.com/wx50282644351869da/424/page-frame.html',
                'token': user.token,
                'X-Gaia-Api-Key': 'd1eb973c-64ec-4dbe-b23b-22c8117c4e8e'
            },
            type: 'post',
            dataType: "json",
            body: {
                "channel": user['x-lf-channel'],
                "bu_code": user['x-lf-bu-code'],
                "token": user.token
            }
        }
        let res = await fetch(opts);
        let growth_value = res?.data?.growth_value || 0;
        $.log(`🎉 ${res?.code == '0000' ? '您当前成长值: ' + growth_value : res?.message}\n`);
        return res?.data
    } catch (e) {
        $.log(`⛔️ 查询用户信息失败！${e}\n`)
    }
}
//查询珑珠
async function getBalance(user) {
    try {
        const opts = {
            url: "https://longzhu-api.longfor.com/lmember-member-open-api-prod/api/member/v1/balance",
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003029) NetType/4G Language/zh_CN miniProgram/wx50282644351869da',
                'Referer': 'https://servicewechat.com/wx50282644351869da/424/page-frame.html',
                'token': user.token,
                'X-Gaia-Api-Key': 'd1eb973c-64ec-4dbe-b23b-22c8117c4e8e'
            },
            type: 'post',
            dataType: "json",
            body: {
                "channel": user['x-lf-channel'],
                "bu_code": user['x-lf-bu-code'],
                "token": user.token
            }
        }
        let res = await fetch(opts);
        let balance = res?.data.balance || 0;
        let expiring_lz = res?.data.expiring_lz || 0;
        $.log(`🎉 ${res?.code == '0000' ? '您当前珑珠: ' + balance + ', 即将过期: ' + expiring_lz : res?.message}\n`);
        return res?.data
    } catch (e) {
        $.log(`⛔️ 查询用户珑珠失败！${e}\n`)
    }
}
//获取Cookie
async function getCookie() {
    try {
        if ($request && $request.method === 'OPTIONS') return;

        const header = ObjectKeys2LowerCase($request.headers || {});
        if (!header.cookie) return;

        const capturedAt = nowIso();
        const newData = {
            "userName": guessUserName(header, header.cookie),
            'x-lf-dxrisk-token': header['x-lf-dxrisk-token'],
            "x-lf-channel": header['x-lf-channel'],
            "token": header.token,
            'x-lf-usertoken': header['x-lf-usertoken'],
            "cookie": header.cookie,
            "x-lf-bu-code": header['x-lf-bu-code'],
            'x-lf-dxrisk-source': header['x-lf-dxrisk-source'],
            "accountKey": getAccountKeyFromRecord(header, header.cookie),
            "cookieId": getStableCookieId(header.cookie),
            "cookieFingerprint": buildCookieFingerprint(header.cookie),
            "updatedAt": capturedAt,
            "lastCaptureAt": capturedAt
        };
        const result = upsertUserCookie(newData);
        const subtitle = result.ready
            ? `🎉 ${result.action}Cookie成功!`
            : `⚠️ ${result.action}部分Cookie成功`;
        const content = result.ready
            ? `当前共保存 ${result.total} 个可用账号`
            : `已暂存账号信息，仍缺少字段：${result.missingFields.join(", ")}`;
        $.msg($.name, subtitle, content);
    } catch (e) {
        throw e;
    }
}

function loadUserCookies() {
    const rawData = $.isNode() ? process.env[ckName] : $.getdata(ckName);
    const parsed = $.toObj(rawData, []);
    const list = Array.isArray(parsed) ? parsed : [];
    const normalized = dedupeUsers(list);
    if ($.toStr(list) !== $.toStr(normalized)) {
        $.setjson(normalized, ckName);
    }
    return normalized;
}

function saveUserCookies() {
    userCookie = dedupeUsers(userCookie);
    $.setjson(userCookie, ckName);
    return userCookie;
}

function upsertUserCookie(data) {
    const normalized = normalizeUserRecord(data);
    if (!normalized) throw new Error("获取Cookie失败，账号数据为空");

    const index = findExistingUserIndex(userCookie, normalized);
    const action = index === -1 ? "新增" : "更新";

    if (index === -1) {
        userCookie.push(normalized);
    } else {
        userCookie[index] = mergeUserRecords(userCookie[index], normalized);
    }

    saveUserCookies();
    const mergedRecord = index === -1 ? userCookie[userCookie.length - 1] : userCookie[index];
    const missingFields = getMissingCaptureFields(mergedRecord);
    return {
        action,
        total: userCookie.filter(isUsableUser).length,
        ready: missingFields.length === 0,
        missingFields
    };
}

function updateUserRecord(user, patch = {}) {
    const index = findExistingUserIndex(userCookie, user);
    if (index === -1) return;

    userCookie[index] = mergeUserRecords(userCookie[index], {
        ...patch,
        updatedAt: nowIso(),
        lastSuccessAt: nowIso()
    });
    saveUserCookies();
}

function removeUserRecord(user, reason = "") {
    const index = findExistingUserIndex(userCookie, user);
    if (index === -1) return false;

    const removed = userCookie.splice(index, 1)[0];
    saveUserCookies();
    $.log(`🧹 已清理失效Cookie：${removed?.userName || "微信用户"}${reason ? `，原因：${reason}` : ""}\n`);
    return true;
}

function dedupeUsers(list = []) {
    const merged = [];
    for (const item of Array.isArray(list) ? list : []) {
        const normalized = normalizeUserRecord(item);
        if (!normalized) continue;

        const index = findExistingUserIndex(merged, normalized);
        if (index === -1) {
            merged.push(normalized);
        } else {
            merged[index] = mergeUserRecords(merged[index], normalized);
        }
    }
    return merged;
}

function normalizeUserRecord(record = {}) {
    if (!record || typeof record !== "object") return null;

    const cookie = cleanCookieString(record.cookie);
    const normalized = {
        ...record,
        userName: guessUserName(record, cookie),
        nick_name: pickFirstValue(record.nick_name, record.nickName),
        cookie,
        token: sanitizeValue(record.token),
        'x-lf-dxrisk-token': sanitizeValue(record['x-lf-dxrisk-token']),
        'x-lf-channel': sanitizeValue(record['x-lf-channel']),
        'x-lf-usertoken': sanitizeValue(record['x-lf-usertoken']),
        'x-lf-bu-code': sanitizeValue(record['x-lf-bu-code']),
        'x-lf-dxrisk-source': sanitizeValue(record['x-lf-dxrisk-source']),
        memberId: pickFirstValue(record.memberId, record.member_id),
        memberNo: pickFirstValue(record.memberNo, record.member_no),
        userId: pickFirstValue(record.userId, record.user_id, record.uid),
        mobile: pickFirstValue(record.mobile, record.phone),
        phone: pickFirstValue(record.phone),
        openId: pickFirstValue(record.openId, record.open_id, record.openid),
        unionId: pickFirstValue(record.unionId, record.union_id, record.unionid),
        accountKey: pickFirstValue(record.accountKey, getAccountKeyFromRecord(record, cookie)),
        cookieId: pickFirstValue(record.cookieId, getStableCookieId(cookie)),
        cookieFingerprint: pickFirstValue(record.cookieFingerprint, buildCookieFingerprint(cookie)),
        updatedAt: normalizeTimestamp(record.updatedAt || record.lastCaptureAt || record.lastSuccessAt),
        lastCaptureAt: normalizeTimestamp(record.lastCaptureAt),
        lastSuccessAt: normalizeTimestamp(record.lastSuccessAt),
        expiredAt: normalizeTimestamp(record.expiredAt),
        expireReason: sanitizeValue(record.expireReason)
    };

    if (!normalized.cookie || normalized.expiredAt) return null;
    return normalized;
}

function mergeUserRecords(current = {}, incoming = {}) {
    return normalizeUserRecord({
        ...current,
        ...incoming,
        userName: pickFirstValue(incoming.userName, incoming.nick_name, current.userName, current.nick_name, "微信用户"),
        nick_name: pickFirstValue(incoming.nick_name, current.nick_name),
        cookie: pickFirstValue(incoming.cookie, current.cookie),
        token: pickFirstValue(incoming.token, current.token),
        'x-lf-dxrisk-token': pickFirstValue(incoming['x-lf-dxrisk-token'], current['x-lf-dxrisk-token']),
        'x-lf-channel': pickFirstValue(incoming['x-lf-channel'], current['x-lf-channel']),
        'x-lf-usertoken': pickFirstValue(incoming['x-lf-usertoken'], current['x-lf-usertoken']),
        'x-lf-bu-code': pickFirstValue(incoming['x-lf-bu-code'], current['x-lf-bu-code']),
        'x-lf-dxrisk-source': pickFirstValue(incoming['x-lf-dxrisk-source'], current['x-lf-dxrisk-source']),
        memberId: pickFirstValue(incoming.memberId, incoming.member_id, current.memberId, current.member_id),
        memberNo: pickFirstValue(incoming.memberNo, incoming.member_no, current.memberNo, current.member_no),
        userId: pickFirstValue(incoming.userId, incoming.user_id, incoming.uid, current.userId, current.user_id, current.uid),
        mobile: pickFirstValue(incoming.mobile, current.mobile),
        phone: pickFirstValue(incoming.phone, current.phone),
        openId: pickFirstValue(incoming.openId, incoming.open_id, incoming.openid, current.openId, current.open_id, current.openid),
        unionId: pickFirstValue(incoming.unionId, incoming.union_id, incoming.unionid, current.unionId, current.union_id, current.unionid),
        accountKey: pickFirstValue(incoming.accountKey, current.accountKey),
        cookieId: pickFirstValue(incoming.cookieId, current.cookieId),
        cookieFingerprint: pickFirstValue(incoming.cookieFingerprint, current.cookieFingerprint),
        updatedAt: pickLatestTime(incoming.updatedAt, incoming.lastCaptureAt, incoming.lastSuccessAt, current.updatedAt, current.lastCaptureAt, current.lastSuccessAt),
        lastCaptureAt: pickLatestTime(incoming.lastCaptureAt, current.lastCaptureAt),
        lastSuccessAt: pickLatestTime(incoming.lastSuccessAt, current.lastSuccessAt),
        expiredAt: "",
        expireReason: ""
    });
}

function findExistingUserIndex(list = [], target = {}) {
    let bestIndex = -1;
    let bestScore = 0;

    for (const [index, item] of list.entries()) {
        const score = getMatchScore(item, target);
        if (score > bestScore) {
            bestIndex = index;
            bestScore = score;
        }
    }
    return bestScore > 0 ? bestIndex : -1;
}

function getMatchScore(current = {}, incoming = {}) {
    const rules = [
        ["accountKey", 100],
        ["cookieId", 90],
        ["x-lf-usertoken", 80],
        ["token", 70],
        ["cookieFingerprint", 60],
        ["cookie", 50]
    ];

    for (const [key, score] of rules) {
        if (current?.[key] && incoming?.[key] && current[key] === incoming[key]) {
            return score;
        }
    }
    return 0;
}

function isUsableUser(user = {}) {
    return REQUIRED_CAPTURE_FIELDS.every((key) => Boolean(user?.[key]));
}

function buildUserProfilePatch(user, userInfo = {}) {
    return {
        userName: pickFirstValue(userInfo.nick_name, user.userName),
        nick_name: pickFirstValue(userInfo.nick_name, user.nick_name),
        memberId: pickFirstValue(userInfo.member_id, userInfo.memberId, user.memberId),
        memberNo: pickFirstValue(userInfo.member_no, userInfo.memberNo, user.memberNo),
        userId: pickFirstValue(userInfo.user_id, userInfo.userId, userInfo.uid, user.userId),
        mobile: pickFirstValue(userInfo.mobile, userInfo.phone, user.mobile),
        phone: pickFirstValue(userInfo.phone, user.phone),
        openId: pickFirstValue(userInfo.open_id, userInfo.openId, userInfo.openid, user.openId),
        unionId: pickFirstValue(userInfo.union_id, userInfo.unionId, userInfo.unionid, user.unionId),
        accountKey: getAccountKeyFromRecord({ ...user, ...userInfo }, user.cookie),
        lastSuccessAt: nowIso()
    };
}

function getMissingCaptureFields(record = {}) {
    return REQUIRED_CAPTURE_FIELDS.filter((field) => !sanitizeValue(record[field]));
}

function getResponseMessage(response = {}) {
    return pickFirstValue(response.message, response.msg, response.errorMessage, response.error_msg);
}

function getAccountKeyFromRecord(record = {}, cookie = record.cookie) {
    const directKey = pickFirstValue(
        record.accountKey,
        record.memberNo,
        record.member_no,
        record.memberId,
        record.member_id,
        record.userId,
        record.user_id,
        record.uid,
        record.openId,
        record.open_id,
        record.openid,
        record.unionId,
        record.union_id,
        record.unionid,
        record.mobile,
        record.phone
    );
    if (directKey) return directKey;

    const cookieObject = parseCookieString(cookie);
    const cookieIdentity = pickFirstValue(
        getCookieValue(cookieObject, ["member_no", "memberno", "member_id", "memberid"]),
        getCookieValue(cookieObject, ["user_id", "userid", "uid"]),
        getCookieValue(cookieObject, ["openid", "open_id", "unionid", "union_id"]),
        getCookieValue(cookieObject, ["mobile", "phone", "tel"])
    );
    return pickFirstValue(cookieIdentity, getStableCookieId(cookie), record['x-lf-usertoken']);
}

function guessUserName(record = {}, cookie = record.cookie) {
    const cookieObject = parseCookieString(cookie);
    return pickFirstValue(
        record.userName,
        record.nick_name,
        record.nickName,
        maskPhone(record.mobile),
        maskPhone(record.phone),
        maskPhone(getCookieValue(cookieObject, ["mobile", "phone", "tel"])),
        getCookieValue(cookieObject, ["member_no", "memberno", "member_id", "memberid", "user_id", "userid", "uid", "openid", "unionid"]),
        "微信用户"
    );
}

function parseCookieString(cookie = "") {
    const parsed = {};
    for (const segment of sanitizeValue(cookie).split(";")) {
        const item = segment.trim();
        if (!item) continue;

        const separatorIndex = item.indexOf("=");
        const key = separatorIndex === -1 ? item : item.slice(0, separatorIndex).trim();
        const value = separatorIndex === -1 ? "" : item.slice(separatorIndex + 1).trim();
        if (!key) continue;
        parsed[key] = value;
    }
    return parsed;
}

function cleanCookieString(cookie = "") {
    const order = [];
    const latestMap = {};
    for (const segment of sanitizeValue(cookie).split(";")) {
        const item = segment.trim();
        if (!item) continue;

        const separatorIndex = item.indexOf("=");
        const key = separatorIndex === -1 ? item : item.slice(0, separatorIndex).trim();
        const value = separatorIndex === -1 ? "" : item.slice(separatorIndex + 1).trim();
        if (!key) continue;

        if (!Object.prototype.hasOwnProperty.call(latestMap, key)) {
            order.push(key);
        }
        latestMap[key] = value;
    }

    return order.map((key) => `${key}=${latestMap[key]}`).join("; ");
}

function buildCookieFingerprint(cookie = "") {
    const cookieObject = parseCookieString(cookie);
    return Object.keys(cookieObject)
        .sort()
        .map((key) => `${key}=${cookieObject[key]}`)
        .join("; ");
}

function getStableCookieId(cookie = "") {
    const cookieObject = parseCookieString(cookie);
    return Object.keys(cookieObject)
        .filter((key) => isStableCookieKey(key))
        .sort()
        .map((key) => `${key}=${cookieObject[key]}`)
        .join("|");
}

function isStableCookieKey(key = "") {
    const lowerKey = key.toLowerCase();
    const maybeAccountField = /(member|user(?:_?id)?|uid|openid|open_id|unionid|union_id|mobile|phone|account|customer|person|owner)/i.test(lowerKey);
    const volatileField = /(token|session|jsession|ticket|auth|risk|trace|nonce|sid|sso|tgc)/i.test(lowerKey);
    return maybeAccountField && !volatileField;
}

function getCookieValue(cookieObject = {}, candidateKeys = []) {
    const lowerKeyMap = Object.fromEntries(
        Object.entries(cookieObject).map(([key, value]) => [key.toLowerCase(), value])
    );
    for (const key of candidateKeys) {
        const value = lowerKeyMap[key.toLowerCase()];
        if (value) return value;
    }
    return "";
}

function sanitizeValue(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function pickFirstValue(...values) {
    for (const value of values) {
        const normalized = sanitizeValue(value);
        if (normalized) return normalized;
    }
    return "";
}

function normalizeTimestamp(value) {
    const normalized = sanitizeValue(value);
    if (!normalized) return "";

    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function pickLatestTime(...values) {
    const timestamps = values
        .map((value) => normalizeTimestamp(value))
        .filter(Boolean)
        .map((value) => new Date(value).getTime());

    if (!timestamps.length) return "";
    return new Date(Math.max(...timestamps)).toISOString();
}

function nowIso() {
    return new Date().toISOString();
}

function maskPhone(value) {
    const normalized = sanitizeValue(value);
    return /^\d{11}$/.test(normalized) ? normalized.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : normalized;
}


//主程序执行入口
!(async () => {
    try {
        if (typeof $request != "undefined") {
            await getCookie();
        } else {
            await main();
        }
    } catch (e) {
        throw e;
    }
})()
    .catch((e) => { $.logErr(e), $.msg($.name, `⛔️ script run error!`, e.message || e) })
    .finally(async () => {
        $.done({});
    });
function getDateTime() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
/** ---------------------------------固定不动区域----------------------------------------- */
//prettier-ignore
async function sendMsg(a) { a && ($.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || "", a, { "media-url": $.avatar })) }
function DoubleLog(o) { o && ($.log(`${o}`), $.notifyMsg.push(`${o}`)) };
function debug(g, e = "debug") { "true" === $.is_debug && ($.log(`\n-----------${e}------------\n`), $.log("string" == typeof g ? g : $.toStr(g) || `debug error => t=${g}`), $.log(`\n-----------${e}------------\n`)) }
//From xream's ObjectKeys2LowerCase
function ObjectKeys2LowerCase(obj = {}) { return Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k.toLowerCase(), v])) };
//From sliverkiss's Request
async function Request(t) {
    if ("string" == typeof t) t = { url: t };
    try {
        if (!t?.url) throw new Error("[发送请求] 缺少 url 参数");

        let {
            url,
            type,
            method,
            headers = {},
            body,
            params,
            dataType = "form",
            resultType = "data"
        } = t;

        const requestMethod = (type || method || ("body" in t ? "post" : "get")).toLowerCase();
        const timeout = t.timeout ? $.isSurge() ? t.timeout / 1e3 : t.timeout : 1e4;
        const queryString = params ? $.queryStr(params) : "";
        const requestUrl = queryString ? `${url}${url.includes("?") ? "&" : "?"}${queryString}` : url;

        if ("json" === dataType) headers["Content-Type"] = "application/json;charset=UTF-8";

        const requestOptions = {
            ...t,
            ...(t?.opts || {}),
            url: requestUrl,
            headers,
            timeout
        };

        if ("get" !== requestMethod && void 0 !== body) {
            requestOptions.body = "json" === dataType ? $.toStr(body) : $.queryStr(body);
        }

        const response = await $.http[requestMethod](requestOptions);
        return "data" === resultType ? $.toObj(response.body) || response.body : $.toObj(response) || response;
    } catch (t) {
        console.log(`❌请求发起失败！原因为：${t}`);
    }
}
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) } runScript(t, e) { return new Promise((s => { let r = this.getdata("@chavy_boxjs_userCfgs.httpapi"); r = r ? r.replace(/\n/g, "").trim() : r; let a = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); a = a ? 1 * a : 20, a = e && e.timeout ? e.timeout : a; const [i, o] = r.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: a }, headers: { "X-Key": i, Accept: "*/*" }, timeout: a }; this.post(n, ((t, e, r) => s(r))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; { const r = s ? t : e; try { return JSON.parse(this.fs.readFileSync(r)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(t, a) } } lodash_get(t, e, s = void 0) { const r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (const t of r) if (a = Object(a)[t], void 0 === a) return s; return a } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch (e) { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: r, statusCode: a, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: r, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: r, response: a } = t; e(r, a, a && s.decode(a.rawBody, this.encoding)) })) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let r = require("iconv-lite"); this.initGotEnv(t); const { url: a, ...i } = t; this.got[s](a, i).then((t => { const { statusCode: s, statusCode: a, headers: i, rawBody: o } = t, n = r.decode(o, this.encoding); e(null, { status: s, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: s, response: a } = t; e(s, a, a && r.decode(a.rawBody, this.encoding)) })) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let r = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in r) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? r[e] : ("00" + r[e]).substr(("" + r[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let r = t[s]; null != r && "" !== r && ("object" == typeof r && (r = JSON.stringify(r)), e += `${s}=${r}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", r = "", a) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: return { url: t.url || t.openUrl || t["open-url"] }; case "Loon": return { openUrl: t.openUrl || t.url || t["open-url"], mediaUrl: t.mediaUrl || t["media-url"] }; case "Quantumult X": return { "open-url": t["open-url"] || t.url || t.openUrl, "media-url": t["media-url"] || t.mediaUrl, "update-pasteboard": t["update-pasteboard"] || t.updatePasteboard }; case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, r, i(a)); break; case "Quantumult X": $notify(e, s, r, i(a)); case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), r && t.push(r), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
