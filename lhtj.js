/*
------------------------------------------
@Author: Leiyiyan/doosit
@Date: 2026-02-25 17:18:00
@Description: 龙湖天街小程序签到、抽奖
------------------------------------------
获取 Cookie：打开龙湖天街小程序，进入 我的 - 签到赚珑珠 - 任务赚奖励 - 马上签到。

图标：https://raw.githubusercontent.com/leiyiyan/resource/main/icons/lhtj.png

[Script]
http-request ^https?:\/\/gw2c\-hw\-open\.longfor\.com\/(lmarketing\-task\-api\-mvc\-prod\/openapi\/task\/v1\/.*|llt\-gateway\-prod\/api\/v1\/.*|supera\/member\/api\/bff\/pages\/.*) script-path=https://raw.githubusercontent.com/doosit/lhtj/main/lhtj.js, timeout=60, tag=龙湖天街获取Cookie

[MITM]
hostname = gw2c-hw-open.longfor.com

⚠️【免责声明】
------------------------------------------
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
*/
const $ = new Env("龙湖天街");
const ckName = "lhtj_data";
const parsedCookie = $.toObj($.isNode() ? process.env[ckName] : $.getdata(ckName), []);
const userCookie = Array.isArray(parsedCookie) ? parsedCookie : [];
//notify
const notify = $.isNode() ? require('./sendNotify') : '';
$.notifyMsg = [];
//debug
$.is_debug = ($.isNode() ? (process.env.IS_DEBUG || process.env.IS_DEDUG) : $.getdata('is_debug')) || 'false';
$.doFlag = { "true": "✅", "false": "⛔️" };
//------------------------------------------
const baseUrl = "";
const _headers = {};
const TASK_GAIA_KEY = 'c06753f1-3e68-437d-b592-b94656ea5517';
const LOTTERY_GAIA_KEY = '2f9e3889-91d9-4684-8ff5-24d881438eaf';
const MEMBER_GAIA_KEY = 'd1eb973c-64ec-4dbe-b23b-22c8117c4e8e';
const UA_DEFAULT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.69(0x18004526) NetType/WIFI Language/zh_CN miniProgram/wx50282644351869da';
const SIGN_ACTIVITY_NO_LIST = [
    '11111111111736501868255956070000',
    '11111111111686241863606037740000'
];
const LOTTERY_DISCOVERY_PAGES = [
    { activity_no: 'AP25Z07390KXCWDP', page_no: 'PP11I27P15H4JYOY' }
];
const LOTTERY_STATIC_CAMPAIGNS = [
    { activity_no: 'AP26P012R90F1UKX', component_no: 'CW16530P28V520GL', source: 'legacy-miniapp' },
    { activity_no: 'AP266012H9Q69JHI', component_no: 'CV16H24J49G1KERU', source: 'legacy-app' },
    { activity_no: 'AP25K062Q6YYQ7FX', component_no: 'CO15400F29R2ZFJZ', source: 'fallback' }
];
const COOKIE_CAPTURE_URL_REGEX = /\/(openapi\/task\/v1\/|llt-gateway-prod\/api\/v1\/|supera\/member\/api\/bff\/pages\/)/;
const RETRY_CODES = new Set(['8040012', '429', '500']);
const RETRY_MESSAGE_REGEX = /网络故障|请稍后再试|系统繁忙|请求超时|服务繁忙/;
const AUTH_MESSAGE_REGEX = /登录已过期|用户未登录|token失效|无效token|需要去登录/;
const NETWORK_ERROR_REGEX = /当前请求已超时|timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|network|请求发起失败/i;

//------------------------------------------
const fetch = async (o, retryTimes = 2) => {
    try {
        if (typeof o === 'string') o = { url: o };
        if (o?.url?.startsWith("/") || o?.url?.startsWith(":")) o.url = baseUrl + o.url;
        const res = await Request({ ...o, headers: o.headers || _headers, url: o.url });
        debug(res, o?.url?.replace(/\/+$/, '').substring(o?.url?.lastIndexOf('/') + 1));

        const code = String(res?.code ?? '');
        const message = String(res?.message ?? '');

        if (AUTH_MESSAGE_REGEX.test(message)) {
            $.ckStatus = false;
            throw new Error(`用户需要去登录: ${message}`);
        }

        if (retryTimes > 0 && (RETRY_CODES.has(code) || RETRY_MESSAGE_REGEX.test(message))) {
            $.log(`⚠️ 接口返回波动(${code || 'NO_CODE'} ${message || ''})，第 ${3 - retryTimes} 次重试中...`);
            await $.wait(1200);
            return fetch(o, retryTimes - 1);
        }

        return res;
    } catch (e) {
        const errMsg = String(e?.message || e || '未知错误');
        if (retryTimes > 0 && NETWORK_ERROR_REGEX.test(errMsg)) {
            $.log(`⚠️ 网络异常(${errMsg})，第 ${3 - retryTimes} 次重试中...`);
            await $.wait(1200);
            return fetch(o, retryTimes - 1);
        }
        $.ckStatus = false;
        $.log(`⛔️ 请求发起失败！${errMsg}`);
        return {};
    }
};

function getSignRiskToken(user = {}) {
    const signSpecific = toCleanStr(user['x-lf-dxrisk-token-signin']);
    if (signSpecific) return signSpecific;
    const common = toCleanStr(user['x-lf-dxrisk-token']);
    if (common) return common;
    return toCleanStr(user['x-lf-dxrisk-token-lottery']);
}

function getSignCaptchaToken(user = {}) {
    const signSpecific = toCleanStr(user['x-lf-dxrisk-captcha-token-signin']);
    if (signSpecific) return signSpecific;
    const common = toCleanStr(user['x-lf-dxrisk-captcha-token']);
    if (common) return common;
    return toCleanStr(user['x-lf-dxrisk-captcha-token-lottery']);
}

function getLotteryRiskToken(user = {}) {
    const lotterySpecific = toCleanStr(user['x-lf-dxrisk-token-lottery']);
    if (lotterySpecific) return lotterySpecific;
    const common = toCleanStr(user['x-lf-dxrisk-token']);
    if (common) return common;
    return toCleanStr(user['x-lf-dxrisk-token-signin']);
}

function getLotteryCaptchaToken(user = {}) {
    const lotterySpecific = toCleanStr(user['x-lf-dxrisk-captcha-token-lottery']);
    if (lotterySpecific) return lotterySpecific;
    const common = toCleanStr(user['x-lf-dxrisk-captcha-token']);
    if (common) return common;
    return toCleanStr(user['x-lf-dxrisk-captcha-token-signin']);
}

function normalizeUser(user = {}, index = 1) {
    const token = user.token || user['x-lf-usertoken'] || user.authtoken || '';
    const signRiskToken = getSignRiskToken(user);
    const lotteryRiskToken = getLotteryRiskToken(user);
    const signCaptchaToken = getSignCaptchaToken(user);
    const lotteryCaptchaToken = getLotteryCaptchaToken(user);
    return {
        ...user,
        userName: user.userName || `账号${index}`,
        token,
        'x-lf-usertoken': user['x-lf-usertoken'] || token,
        'x-lf-bu-code': user['x-lf-bu-code'] || user.bucode || '',
        'x-lf-channel': user['x-lf-channel'] || user.channel || '',
        'x-lf-dxrisk-source': user['x-lf-dxrisk-source'] || '5',
        'x-lf-dxrisk-token-signin': signRiskToken,
        'x-lf-dxrisk-token-lottery': lotteryRiskToken,
        'x-lf-dxrisk-captcha-token-signin': signCaptchaToken,
        'x-lf-dxrisk-captcha-token-lottery': lotteryCaptchaToken,
        'x-lf-dxrisk-token': signRiskToken || lotteryRiskToken,
        'x-lf-dxrisk-captcha-token': signCaptchaToken || lotteryCaptchaToken,
        'x-gaia-api-key': user['x-gaia-api-key'] || TASK_GAIA_KEY,
        'x-gaia-api-key-lottery': user['x-gaia-api-key-lottery'] || LOTTERY_GAIA_KEY,
        'origin-signin': user['origin-signin'] || 'https://longzhu.longfor.com',
        'referer-signin': user['referer-signin'] || 'https://longzhu.longfor.com/',
        'origin-lottery': user['origin-lottery'] || 'https://llt.longfor.com',
        'referer-lottery': user['referer-lottery'] || 'https://llt.longfor.com/',
        'content-type': user['content-type'] || 'application/json;charset=UTF-8',
        'user-agent': user['user-agent'] || UA_DEFAULT
    };
}

function buildTaskHeaders(user, extra = {}) {
    const signRiskToken = getSignRiskToken(user);
    const signCaptchaToken = getSignCaptchaToken(user);
    const headers = {
        'cookie': user.cookie || '',
        'user-agent': user['user-agent'] || UA_DEFAULT,
        'token': user.token || '',
        'x-lf-usertoken': user['x-lf-usertoken'] || user.token || '',
        'x-gaia-api-key': user['x-gaia-api-key'] || TASK_GAIA_KEY,
        'x-lf-bu-code': user['x-lf-bu-code'] || '',
        'x-lf-channel': user['x-lf-channel'] || '',
        'origin': user['origin-signin'] || 'https://longzhu.longfor.com',
        'referer': user['referer-signin'] || 'https://longzhu.longfor.com/',
        'content-type': user['content-type'] || 'application/json;charset=UTF-8'
    };
    if (signRiskToken) headers['x-lf-dxrisk-token'] = signRiskToken;
    if (user['x-lf-dxrisk-source']) headers['x-lf-dxrisk-source'] = user['x-lf-dxrisk-source'];
    if (signCaptchaToken) headers['x-lf-dxrisk-captcha-token'] = signCaptchaToken;
    return { ...headers, ...extra };
}

function buildLotteryHeaders(user, extra = {}) {
    const lotteryRiskToken = getLotteryRiskToken(user);
    const lotteryCaptchaToken = getLotteryCaptchaToken(user);
    const headers = {
        'cookie': user.cookie || '',
        'user-agent': user['user-agent'] || UA_DEFAULT,
        'authtoken': user.token || '',
        'token': user.token || '',
        'bucode': user['x-lf-bu-code'] || '',
        'channel': user['x-lf-channel'] || '',
        'x-gaia-api-key': user['x-gaia-api-key-lottery'] || LOTTERY_GAIA_KEY,
        'origin': user['origin-lottery'] || 'https://llt.longfor.com',
        'referer': user['referer-lottery'] || 'https://llt.longfor.com/',
        'content-type': user['content-type'] || 'application/json;charset=UTF-8'
    };
    if (lotteryRiskToken) headers['x-lf-dxrisk-token'] = lotteryRiskToken;
    if (user['x-lf-dxrisk-source']) headers['x-lf-dxrisk-source'] = user['x-lf-dxrisk-source'];
    if (lotteryCaptchaToken) headers['x-lf-dxrisk-captcha-token'] = lotteryCaptchaToken;
    return { ...headers, ...extra };
}

function buildMemberHeaders(user) {
    return {
        'User-Agent': user['user-agent'] || UA_DEFAULT,
        'Referer': 'https://servicewechat.com/wx50282644351869da/424/page-frame.html',
        'token': user.token || '',
        'X-Gaia-Api-Key': user['member-gaia-api-key'] || MEMBER_GAIA_KEY
    };
}

function getMissingFields(user) {
    const required = [
        ['token', user.token],
        ['x-lf-usertoken', user['x-lf-usertoken']],
        ['cookie', user.cookie],
        ['x-lf-bu-code', user['x-lf-bu-code']],
        ['x-lf-channel', user['x-lf-channel']]
    ];
    return required.filter(([, value]) => !value).map(([key]) => key);
}

function toCleanStr(value) {
    if (Array.isArray(value)) value = value[0];
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function pickFirstNonEmpty(...values) {
    for (const value of values) {
        const clean = toCleanStr(value);
        if (clean) return clean;
    }
    return '';
}

function mergeNonEmpty(oldData = {}, newData = {}) {
    const merged = { ...oldData };
    for (const [key, value] of Object.entries(newData)) {
        const clean = toCleanStr(value);
        if (clean) merged[key] = clean;
    }
    return merged;
}

function getNowText() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function hasCookieKey(cookieText, key) {
    const text = toCleanStr(cookieText);
    if (!text || !key) return false;
    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|;\\s*)${escapedKey}=`);
    return pattern.test(text);
}

function parseDateTextToMs(text) {
    const value = toCleanStr(text);
    if (!value) return 0;
    const ts = Date.parse(value.replace(' ', 'T'));
    return Number.isFinite(ts) ? ts : 0;
}

function getSigninHealth(user) {
    const issues = [];
    const signRiskToken = getSignRiskToken(user);
    const signCaptchaToken = getSignCaptchaToken(user);
    const captureTs = parseDateTextToMs(user?.['update-time']);
    const ageMinutes = captureTs > 0 ? Math.floor((Date.now() - captureTs) / 60000) : null;

    if (!hasCookieKey(user?.cookie, 'acw_tc')) issues.push('cookie(acw_tc)');
    if (!signRiskToken) issues.push('x-lf-dxrisk-token');
    if (!signCaptchaToken) issues.push('x-lf-dxrisk-captcha-token');

    return {
        ok: issues.length === 0,
        issues,
        ageMinutes
    };
}

function getLotteryHealth(user) {
    const issues = [];
    const lotteryRiskToken = getLotteryRiskToken(user);
    const captureTs = parseDateTextToMs(user?.['update-time']);
    const ageMinutes = captureTs > 0 ? Math.floor((Date.now() - captureTs) / 60000) : null;
    if (!hasCookieKey(user?.cookie, 'acw_tc')) issues.push('cookie(acw_tc)');
    if (!lotteryRiskToken) issues.push('x-lf-dxrisk-token(lottery)');
    return {
        ok: issues.length === 0,
        issues,
        ageMinutes
    };
}

function buildLotteryCampaignKey(item = {}) {
    return `${item.activity_no || ''}::${item.component_no || ''}`;
}

function dedupeLotteryCampaigns(list = []) {
    const seen = new Set();
    const result = [];
    for (const item of list) {
        const activityNo = toCleanStr(item?.activity_no);
        const componentNo = toCleanStr(item?.component_no);
        if (!activityNo || !componentNo) continue;
        const key = buildLotteryCampaignKey({ activity_no: activityNo, component_no: componentNo });
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
            activity_no: activityNo,
            component_no: componentNo,
            source: item?.source || 'unknown'
        });
    }
    return result;
}

function toNonNegativeInt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    const text = String(value ?? '');
    const m = text.match(/\d+/);
    return m ? Math.max(0, parseInt(m[0], 10)) : 0;
}

function getLotteryChanceFromRes(res) {
    return toNonNegativeInt(
        res?.data?.chance ??
        res?.data?.ticket_times ??
        res?.data?.lottery_times ??
        res?.data?.remain_times ??
        0
    );
}

async function main() {
    try {
        //check accounts
        if (!userCookie.length) throw new Error("找不到可用的帐户");
        $.log(`⚙️ 发现 ${userCookie?.length ?? 0} 个帐户\n`);
        //doTask of userList
        for (const [index, rawUser] of userCookie.entries()) {
            const user = normalizeUser(rawUser, index + 1);
            //init of user
            $.log(`🚀 开始任务: ${user.userName}`);
            $.notifyMsg = [];
            $.ckStatus = true;
            $.title = "";
            $.avatar = "";

            const missingFields = getMissingFields(user);
            if (missingFields.length) {
                $.ckStatus = false;
                DoubleLog(`⛔️ 「${user.userName}」缺少必要字段: ${missingFields.join(', ')}`);
            }

            // 签到（多个活动）
            let signRewardTotal = 0;
            let signSuccessCount = 0;
            let signAlreadyCount = 0;
            if ($.ckStatus) {
                const signResult = await signin(user);
                signRewardTotal = signResult.rewardTotal;
                signSuccessCount = signResult.successCount;
                signAlreadyCount = signResult.alreadyCount;
            }
            if ($.ckStatus) {
                // 抽奖（先签到拿机会，再按机会抽）
                let lotteryChanceTotal = 0;
                let lotteryDrawTotal = 0;
                let lotteryCampaignCount = 0;
                const lotteryHealth = getLotteryHealth(user);
                if (!lotteryHealth.ok) {
                    $.log(`⚠️ 抽奖参数不完整，跳过抽奖: ${lotteryHealth.issues.join(', ')}\n`);
                } else {
                    if (typeof lotteryHealth.ageMinutes === 'number' && lotteryHealth.ageMinutes >= 28) {
                        $.log(`⚠️ 抽奖Cookie抓取时间约${lotteryHealth.ageMinutes}分钟，可能已过期(acw_tc通常30分钟)\n`);
                    }
                    const campaigns = await getLotteryCampaignList(user);
                    lotteryCampaignCount = campaigns.length;
                    for (const [campaignIndex, campaign] of campaigns.entries()) {
                        const lotteryRoundResult = await runLotteryCampaign(user, campaign, campaignIndex + 1);
                        lotteryChanceTotal += lotteryRoundResult.chance;
                        lotteryDrawTotal += lotteryRoundResult.drawCount;
                    }
                    if (!campaigns.length) $.log(`ℹ️ 没有可用抽奖活动，跳过抽奖\n`);
                }
                //查询用户信息
                const userInfo = await getUserInfo(user);
                //查询珑珠
                const balanceInfo = await getBalance(user);
                const nickName = userInfo?.nick_name || user.userName;
                const growthValue = userInfo?.growth_value || 0;
                const level = userInfo?.level || 0;
                const balance = balanceInfo?.balance || 0;
                $.avatar = userInfo?.head_portrait || "";
                $.title = `签到${signRewardTotal}分(${signSuccessCount}/${SIGN_ACTIVITY_NO_LIST.length})` +
                    `${lotteryCampaignCount > 0 ? `, 抽奖${lotteryDrawTotal}次(机会${lotteryChanceTotal})` : ''}`;
                DoubleLog(`当前用户:${nickName}\n成长值: ${growthValue}  等级: V${level}  珑珠: ${balance}`);
                if (signAlreadyCount > 0) DoubleLog(`签到状态: ${signAlreadyCount}个活动已签到`);
            } else {
                DoubleLog(`⛔️ 「${user.userName}」check ck error!`);
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
    const result = {
        rewardTotal: 0,
        successCount: 0,
        alreadyCount: 0,
        failCount: 0
    };
    try {
        const signinHealth = getSigninHealth(user);
        if (!signinHealth.ok) {
            $.ckStatus = false;
            DoubleLog(`⛔️ 「${user.userName}」签到参数缺失: ${signinHealth.issues.join(', ')}`);
            DoubleLog(`请重新抓包“马上签到”请求，确保带上 acw_tc、x-lf-dxrisk-token、x-lf-dxrisk-captcha-token`);
            return result;
        }
        if (typeof signinHealth.ageMinutes === 'number' && signinHealth.ageMinutes >= 28) {
            $.log(`⚠️ 当前Cookie抓取时间约${signinHealth.ageMinutes}分钟，可能已过期(acw_tc通常30分钟)，建议先刷新后再跑任务\n`);
        }
        for (const activityNo of SIGN_ACTIVITY_NO_LIST) {
            const opts = {
                url: "https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod/openapi/task/v1/signature/clock",
                headers: buildTaskHeaders(user),
                type: 'post',
                dataType: "json",
                body: {
                    'activity_no': activityNo
                }
            };
            const res = await fetch(opts);
            const isPopup = Number(res?.data?.is_popup || 0) === 1;
            const reward_num = isPopup ? Number(res?.data?.reward_info?.[0]?.reward_num || 0) : 0;
            const code = String(res?.code || '');
            const msg = String(res?.message || '');
            if (code === '0000') {
                if (isPopup) {
                    result.rewardTotal += reward_num;
                    result.successCount += 1;
                } else {
                    result.alreadyCount += 1;
                }
                $.log(`${$.doFlag[isPopup]} 活动${activityNo}: ${isPopup ? '签到成功, 获得' + reward_num + '分' : '今日已签到'}\n`);
                continue;
            }
            if (/activity|活动|参数|不存在|已结束|invalid/i.test(msg)) {
                result.failCount += 1;
                $.log(`⚠️ 活动${activityNo} 不可用: ${msg || code || '未知错误'}\n`);
                continue;
            }
            if (code === '8040012' || /网络故障|请稍后再试/.test(msg)) {
                $.log(`⚠️ 签到返回风控异常(${code || 'NO_CODE'}): ${msg || '网络故障'}\n`);
                $.log(`⚠️ 常见原因: acw_tc过期、x-lf-dxrisk-token/captcha-token失效，或签到和抽奖风控参数混用\n`);
            }
            result.failCount += 1;
            $.log(`⛔️ 活动${activityNo}签到失败: ${msg || code || '未知错误'}\n`);
        }
        $.log(`ℹ️ 签到汇总: 成功${result.successCount}个, 已签到${result.alreadyCount}个, 失败${result.failCount}个, 共获得${result.rewardTotal}分\n`);
        return result;
    } catch (e) {
        $.log(`⛔️ 每日签到失败！${e}\n`);
        result.failCount = SIGN_ACTIVITY_NO_LIST.length;
        return result;
    }
}

function parseLotteryComponentNos(info) {
    const pageInfo = typeof info === 'string' ? $.toObj(info, {}) : (info || {});
    const list = Array.isArray(pageInfo?.list) ? pageInfo.list : [];
    const result = [];
    for (const component of list) {
        if (component?.comName === 'turntablecom' && component?.data?.component_no) {
            result.push(component.data.component_no);
        }
    }
    return result;
}

async function getLotteryCampaignList(user) {
    const dynamicCampaigns = [];
    for (const pageConfig of LOTTERY_DISCOVERY_PAGES) {
        try {
            const opts = {
                url: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/page/info",
                headers: buildLotteryHeaders(user),
                type: 'get',
                dataType: "json",
                params: {
                    activityNo: pageConfig.activity_no,
                    pageNo: pageConfig.page_no
                }
            };
            const res = await fetch(opts);
            if (res?.code !== '0000') continue;
            const activityNo = toCleanStr(res?.data?.activity_no || pageConfig.activity_no);
            const componentNos = parseLotteryComponentNos(res?.data?.info);
            for (const componentNo of componentNos) {
                dynamicCampaigns.push({
                    activity_no: activityNo,
                    component_no: componentNo,
                    source: 'dynamic'
                });
            }
        } catch (e) {
            $.log(`⚠️ 抽奖活动识别异常(${pageConfig.activity_no}): ${e}\n`);
        }
    }
    const merged = dedupeLotteryCampaigns([...dynamicCampaigns, ...LOTTERY_STATIC_CAMPAIGNS]);
    $.log(`ℹ️ 抽奖活动池: 动态${dynamicCampaigns.length}个, 总计${merged.length}个\n`);
    return merged;
}

async function lotterySignin(user, lotteryInfo) {
    if (!lotteryInfo?.activity_no || !lotteryInfo?.component_no) {
        return { chance: 0, ok: false, invalid: true, code: '', message: '活动参数缺失' };
    }
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/sign",
            headers: buildLotteryHeaders(user),
            type: 'post',
            dataType: "json",
            body: {
                component_no: lotteryInfo.component_no,
                activity_no: lotteryInfo.activity_no
            }
        };
        const res = await fetch(opts);
        const code = String(res?.code || '');
        const msg = String(res?.message || '');
        const chance = getLotteryChanceFromRes(res);
        if (code === '0000') {
            return { chance, ok: true, invalid: false, code, message: msg };
        }
        if (code === '863036' || /已签到/.test(msg)) {
            return { chance, ok: true, invalid: false, code, message: msg || '今日已签到' };
        }
        const invalid = /activity|活动|参数|不存在|已结束|invalid/i.test(msg);
        return { chance: 0, ok: false, invalid, code, message: msg || code || '未知错误' };
    } catch (e) {
        return { chance: 0, ok: false, invalid: false, code: '', message: String(e?.message || e || '未知错误') };
    }
}

async function runLotteryCampaign(user, lotteryInfo, campaignIndex = 1) {
    const label = `活动${campaignIndex}(${lotteryInfo.activity_no}/${lotteryInfo.component_no})`;
    const signRes = await lotterySignin(user, lotteryInfo);
    if (!signRes.ok) {
        const prefix = signRes.invalid ? '⚠️' : '⛔️';
        $.log(`${prefix} ${label} 抽奖签到失败: ${signRes.message}\n`);
        if (signRes.code === '8040012' || /网络故障|请稍后再试/.test(signRes.message || '')) {
            $.log(`⚠️ ${label} 可能命中风控: 请刷新并重新抓包抽奖请求(acw_tc / x-lf-dxrisk-token / captcha-token)\n`);
        }
        return { chance: 0, drawCount: 0 };
    }
    const chance = toNonNegativeInt(signRes.chance);
    $.log(`✅ ${label} 抽奖签到成功, 当前可抽奖${chance}次\n`);
    if (chance <= 0) return { chance: 0, drawCount: 0 };

    let drawCount = 0;
    for (let i = 0; i < chance; i++) {
        await lotteryDraw(user, lotteryInfo, i + 1, label);
        drawCount += 1;
        if (i < chance - 1) await $.wait(1200);
    }
    return { chance, drawCount };
}

async function lotteryDraw(user, lotteryInfo, round = 1, contextLabel = '') {
    if (!lotteryInfo?.activity_no || !lotteryInfo?.component_no) return false;
    try {
        const opts = {
            url: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/click",
            headers: buildLotteryHeaders(user),
            type: 'post',
            dataType: "json",
            body: {
                component_no: lotteryInfo.component_no,
                activity_no: lotteryInfo.activity_no,
                batch_no: ""
            }
        };
        const res = await fetch(opts);
        const code = String(res?.code || '');
        const msg = String(res?.message || '');
        const label = contextLabel ? `${contextLabel} ` : '';
        if (code === '0000') {
            const prize = res?.data?.prize_name || res?.data?.desc || `类型${res?.data?.reward_type || '-'} x${res?.data?.reward_num || '-'}`;
            $.log(`✅ ${label}第${round}次抽奖: ${prize}\n`);
            return true;
        }
        if (code === '863033' || /已抽奖/.test(msg)) {
            $.log(`✅ ${label}第${round}次抽奖: 今日已抽奖\n`);
            return false;
        }
        $.log(`⛔️ ${label}第${round}次抽奖: ${msg || code || '未知错误'}\n`);
        return false;
    } catch (e) {
        const label = contextLabel ? `${contextLabel} ` : '';
        $.log(`⛔️ ${label}第${round}次抽奖失败: ${e}\n`);
        return false;
    }
}
//查询用户信息
async function getUserInfo(user) {
    try {
        const opts = {
            url: "https://longzhu-api.longfor.com/lmember-member-open-api-prod/api/member/v1/mine-info",
            headers: buildMemberHeaders(user),
            type: 'post',
            dataType: "json",
            body: {
                "channel": user['x-lf-channel'],
                "bu_code": user['x-lf-bu-code'],
                "token": user.token
            }
        };
        let res = await fetch(opts);
        if (res?.code !== '0000') {
            $.log(`⛔️ 查询用户信息: ${res?.message || res?.code || '未知错误'}\n`);
            return {};
        }
        let growth_value = res?.data?.growth_value || 0;
        $.log(`🎉 您当前成长值: ${growth_value}\n`);
        return res?.data || {};
    } catch (e) {
        $.log(`⛔️ 查询用户信息失败！${e}\n`);
        return {};
    }
}
//查询珑珠
async function getBalance(user) {
    try {
        const opts = {
            url: "https://longzhu-api.longfor.com/lmember-member-open-api-prod/api/member/v1/balance",
            headers: buildMemberHeaders(user),
            type: 'post',
            dataType: "json",
            body: {
                "channel": user['x-lf-channel'],
                "bu_code": user['x-lf-bu-code'],
                "token": user.token
            }
        };
        let res = await fetch(opts);
        if (res?.code !== '0000') {
            $.log(`⛔️ 查询用户珑珠: ${res?.message || res?.code || '未知错误'}\n`);
            return {};
        }
        const balance = res?.data?.balance || 0;
        const expiring_lz = res?.data?.expiring_lz || 0;
        $.log(`🎉 您当前珑珠: ${balance}, 即将过期: ${expiring_lz}\n`);
        return res?.data || {};
    } catch (e) {
        $.log(`⛔️ 查询用户珑珠失败！${e}\n`);
        return {};
    }
}
//获取Cookie
async function getCookie() {
    try {
        if (!$request) return;
        const method = String($request.method || '').toUpperCase();
        const requestUrl = String($request.url || '');
        if (method === 'OPTIONS') return;
        if (!COOKIE_CAPTURE_URL_REGEX.test(requestUrl)) return;
        const isLotteryUrl = /\/llt-gateway-prod\/api\/v1\//.test(requestUrl);
        const isSignUrl = /\/openapi\/task\/v1\//.test(requestUrl);
        const isSuperaUrl = /\/supera\/member\/api\/bff\/pages\//.test(requestUrl);

        const header = ObjectKeys2LowerCase($request?.headers || {});
        const token = pickFirstNonEmpty(
            header.token,
            header['x-lf-usertoken'],
            header.authtoken,
            header.lmtoken
        );
        if (!token) {
            $.log(`⚠️ 当前请求未携带token，跳过更新`);
            return;
        }

        const buCode = pickFirstNonEmpty(header['x-lf-bu-code'], header.bucode);
        const channel = pickFirstNonEmpty(header['x-lf-channel'], header.channel);
        const incomingGaiaKey = toCleanStr(header['x-gaia-api-key']);
        const incomingOrigin = toCleanStr(header.origin);
        const incomingReferer = toCleanStr(header.referer);
        const newData = {
            "userName": '微信用户',
            'x-lf-dxrisk-token': isSignUrl ? toCleanStr(header['x-lf-dxrisk-token']) : '',
            'x-lf-dxrisk-captcha-token': isSignUrl ? toCleanStr(header['x-lf-dxrisk-captcha-token']) : '',
            'x-lf-dxrisk-token-signin': isSignUrl ? toCleanStr(header['x-lf-dxrisk-token']) : '',
            'x-lf-dxrisk-captcha-token-signin': isSignUrl ? toCleanStr(header['x-lf-dxrisk-captcha-token']) : '',
            'x-lf-dxrisk-token-lottery': isLotteryUrl ? toCleanStr(header['x-lf-dxrisk-token']) : '',
            'x-lf-dxrisk-captcha-token-lottery': isLotteryUrl ? toCleanStr(header['x-lf-dxrisk-captcha-token']) : '',
            "x-lf-channel": channel,
            "token": token,
            'x-lf-usertoken': pickFirstNonEmpty(header['x-lf-usertoken'], token),
            "cookie": toCleanStr(header.cookie),
            "x-lf-bu-code": buCode,
            'x-lf-dxrisk-source': pickFirstNonEmpty(header['x-lf-dxrisk-source'], '5'),
            'x-gaia-api-key': isSignUrl ? pickFirstNonEmpty(incomingGaiaKey, TASK_GAIA_KEY) : '',
            'x-gaia-api-key-lottery': isLotteryUrl ? pickFirstNonEmpty(incomingGaiaKey, LOTTERY_GAIA_KEY) : '',
            'origin-signin': isSignUrl ? pickFirstNonEmpty(incomingOrigin, 'https://longzhu.longfor.com') : '',
            'referer-signin': isSignUrl ? pickFirstNonEmpty(incomingReferer, 'https://longzhu.longfor.com/') : '',
            'origin-lottery': isLotteryUrl ? pickFirstNonEmpty(incomingOrigin, 'https://llt.longfor.com') : '',
            'referer-lottery': isLotteryUrl ? pickFirstNonEmpty(incomingReferer, 'https://llt.longfor.com/') : '',
            'user-agent': pickFirstNonEmpty(header['user-agent'], UA_DEFAULT),
            'capture-from': isSuperaUrl ? 'supera' : (isLotteryUrl ? 'lottery' : 'task'),
            'update-time': getNowText()
        };

        const index = userCookie.findIndex(e => (e?.token || e?.['x-lf-usertoken']) == newData.token);
        if (index !== -1) {
            userCookie[index] = normalizeUser(mergeNonEmpty(userCookie[index], newData), index + 1);
            $.setjson(userCookie, ckName);
            $.msg($.name, `🎉更新Cookie成功!`, `账号: ${userCookie[index].userName}`);
            return;
        }

        const missingForNew = ['cookie', 'x-lf-bu-code', 'x-lf-channel'].filter(k => !newData[k]);
        if (missingForNew.length) {
            $.log(`⚠️ 新账号抓取字段不完整，缺少: ${missingForNew.join(', ')}，已跳过保存`);
            return;
        }

        userCookie.push(normalizeUser(newData, userCookie.length + 1));
        $.setjson(userCookie, ckName);
        $.msg($.name, `🎉获取Cookie成功!`, `新增账号: ${newData.userName}`);
    } catch (e) {
        throw e;
    }
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
        $.done({ ok: 1 });
    });
/** ---------------------------------固定不动区域----------------------------------------- */
//prettier-ignore
async function sendMsg(a) { a && ($.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || "", a, { "media-url": $.avatar })) }
function DoubleLog(o) { o && ($.log(`${o}`), $.notifyMsg.push(`${o}`)) };
function debug(g, e = "debug") { "true" === $.is_debug && ($.log(`\n-----------${e}------------\n`), $.log("string" == typeof g ? g : $.toStr(g) || `debug error => t=${g}`), $.log(`\n-----------${e}------------\n`)) }
//From xream's ObjectKeys2LowerCase
function ObjectKeys2LowerCase(obj) { return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])) };
//From sliverkiss's Request
async function Request(t) {
    "string" == typeof t && (t = { url: t });
    try {
        if (!t?.url) throw new Error("[发送请求] 缺少 url 参数");
        let { url: o, type: e, headers: r = {}, body: s, params: a, dataType: n = "form", resultType: u = "data" } = t;
        const p = e ? e?.toLowerCase() : "body" in t ? "post" : "get";
        const query = $.queryStr(a);
        const c = o.concat("post" === p && query ? "?" + query : "");
        const i = t.timeout ? $.isSurge() ? t.timeout / 1e3 : t.timeout : 15e3;
        "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8");
        const y = s && "form" == n ? $.queryStr(s) : $.toStr(s);
        const l = {
            ...t,
            ...(t?.opts ? t.opts : {}),
            url: c,
            headers: r,
            ..."post" === p && { body: y },
            ..."get" === p && a && { params: a },
            timeout: i
        };
        const m = $.http[p.toLowerCase()](l)
            .then((t => "data" == u ? $.toObj(t.body) || t.body : $.toObj(t) || t))
            .catch((t => $.log(`❌请求发起失败！原因为：${t}`)));
        return Promise.race([new Promise(((t, o) => setTimeout((() => o("当前请求已超时")), i))), m]);
    } catch (t) {
        console.log(`❌请求发起失败！原因为：${t}`);
    }
}
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) } runScript(t, e) { return new Promise((s => { let r = this.getdata("@chavy_boxjs_userCfgs.httpapi"); r = r ? r.replace(/\n/g, "").trim() : r; let a = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); a = a ? 1 * a : 20, a = e && e.timeout ? e.timeout : a; const [i, o] = r.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: a }, headers: { "X-Key": i, Accept: "*/*" }, timeout: a }; this.post(n, ((t, e, r) => s(r))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; { const r = s ? t : e; try { return JSON.parse(this.fs.readFileSync(r)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(t, a) } } lodash_get(t, e, s = void 0) { const r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (const t of r) if (a = Object(a)[t], void 0 === a) return s; return a } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch (e) { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: r, statusCode: a, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: r, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: r, response: a } = t; e(r, a, a && s.decode(a.rawBody, this.encoding)) })) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let r = require("iconv-lite"); this.initGotEnv(t); const { url: a, ...i } = t; this.got[s](a, i).then((t => { const { statusCode: s, statusCode: a, headers: i, rawBody: o } = t, n = r.decode(o, this.encoding); e(null, { status: s, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: s, response: a } = t; e(s, a, a && r.decode(a.rawBody, this.encoding)) })) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let r = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in r) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? r[e] : ("00" + r[e]).substr(("" + r[e]).length))); return t } queryStr(t = {}) { let e = ""; for (const s in t) { let r = t[s]; null != r && "" !== r && ("object" == typeof r && (r = JSON.stringify(r)), e += `${s}=${r}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", r = "", a) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: return { url: t.url || t.openUrl || t["open-url"] }; case "Loon": return { openUrl: t.openUrl || t.url || t["open-url"], mediaUrl: t.mediaUrl || t["media-url"] }; case "Quantumult X": return { "open-url": t["open-url"] || t.url || t.openUrl, "media-url": t["media-url"] || t.mediaUrl, "update-pasteboard": t["update-pasteboard"] || t.updatePasteboard }; case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, r, i(a)); break; case "Quantumult X": $notify(e, s, r, i(a)); case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), r && t.push(r), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
