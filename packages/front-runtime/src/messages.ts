/**
 * 运行时自带的词条（命名空间 `runtime`、`kit` 与 `errors`），随包静态打入：
 * 会话检查、网络错误这些文案在任何模块加载之前就要用到。
 *
 * `errors` 的 key 两种：
 * - `kind.<ApiErrorKind>`：按错误类别的通用说明；
 * - `code.<MACHINE_CODE>`：后端返回的机器码（如 INVALID_CREDENTIALS）对应的人话。
 * 后端返回的英文异常句子不做匹配 —— 那不是契约，改一个字就失效。
 */
import type { StaticCatalogs } from "./i18n";

export const runtimeCatalogs: StaticCatalogs = {
  runtime: {
    "zh-CN": {
      "session.checking": "正在验证会话…",
      "session.unavailable": "暂时连不上服务器，请检查网络后重试。",
      "session.retry": "重试",
      "session.backToLogin": "返回登录",
      "error.requestId": "请求编号：{id}",
    },
    "en-US": {
      "session.checking": "Checking your session…",
      "session.unavailable": "Can't reach the server right now. Check your connection and try again.",
      "session.retry": "Retry",
      "session.backToLogin": "Back to sign in",
      "error.requestId": "Request ID: {id}",
    },
  },
  kit: {
    "zh-CN": {
      emptyTitle: "没有匹配的数据",
      emptyDescription: "请调整查询条件后重试",
      total: "共 {count} 条",
      perPage: "{size} 条/页",
      previous: "上一页",
      next: "下一页",
      goTo: "前往",
      pageNumber: "页码",
      pageSuffix: "页",
      moreActions: "更多操作",
      close: "关闭{title}",
      confirm: "确认",
      cancel: "取消",
      processing: "处理中…",
    },
    "en-US": {
      emptyTitle: "No matching records",
      emptyDescription: "Try adjusting your filters",
      total: "{count} in total",
      perPage: "{size} / page",
      previous: "Previous",
      next: "Next",
      goTo: "Go to",
      pageNumber: "Page number",
      pageSuffix: "",
      moreActions: "More actions",
      close: "Close {title}",
      confirm: "Confirm",
      cancel: "Cancel",
      processing: "Working…",
    },
  },
  resource: {
    "zh-CN": {
      enabled: "启用", disabled: "停用", actions: "操作", view: "详情", edit: "编辑", delete: "删除",
      create: "新增", refresh: "刷新", all: "全部", reset: "重置", search: "查询", cancel: "取消", save: "保存",
      required: "请填写{field}",
      createTitle: "新增{title}", editTitle: "编辑{title}", detailTitle: "{title}详情",
      loadingDetail: "正在加载详情…", recordId: "记录 ID {id}",
      deleteTitle: "删除{title}", deleteDescription: "删除后不可恢复，请确认该数据未被其他业务引用。", deleteConfirm: "确认删除",
    },
    "en-US": {
      enabled: "Enabled", disabled: "Disabled", actions: "Actions", view: "View", edit: "Edit", delete: "Delete",
      create: "New", refresh: "Refresh", all: "All", reset: "Reset", search: "Search", cancel: "Cancel", save: "Save",
      required: "{field} is required",
      createTitle: "New {title}", editTitle: "Edit {title}", detailTitle: "{title} details",
      loadingDetail: "Loading details…", recordId: "Record ID {id}",
      deleteTitle: "Delete {title}", deleteDescription: "This can't be undone. Make sure no other records depend on it.", deleteConfirm: "Delete",
    },
  },
  errors: {
    "zh-CN": {
      "kind.unauthorized": "登录已失效，请重新登录。",
      "kind.forbidden": "没有执行该操作的权限。",
      "kind.rate_limited": "操作太频繁，请稍后再试。",
      "kind.rate_limited_after": "操作太频繁，请 {seconds} 秒后再试。",
      "kind.validation": "提交的内容有误，请检查后重试。",
      "kind.business": "操作未能完成。",
      "kind.server": "服务器出错了，请稍后再试。",
      "kind.network": "网络连接失败，请检查网络后重试。",
      "kind.timeout": "请求超时，请稍后再试。",
      "kind.invalid_response": "服务器返回了无法识别的内容，请稍后再试。",
      "code.INVALID_CREDENTIALS": "用户名或密码错误。",
      "code.ACCOUNT_DISABLED": "账号已被停用。",
      "code.ACCOUNT_DELETED": "账号已注销。",
      "code.VERIFICATION_TOO_FREQUENT": "验证码发送太频繁，请稍后再试。",
      "code.VERIFICATION_DAILY_LIMIT": "今天的验证码发送次数已用完。",
      "code.VERIFICATION_CHANNEL_UNAVAILABLE": "验证码服务暂不可用。",
      "code.VERIFICATION_SEND_FAILED": "验证码发送失败，请稍后再试。",
      "code.INVALID_EMAIL_CODE": "邮箱验证码错误或已过期。",
      "code.EMAIL_TAKEN": "该邮箱已被其他账号绑定。",
      "code.INVALID_EMAIL": "邮箱格式不正确。",
    },
    "en-US": {
      "kind.unauthorized": "Your session has expired. Please sign in again.",
      "kind.forbidden": "You don't have permission to do this.",
      "kind.rate_limited": "Too many requests. Please try again later.",
      "kind.rate_limited_after": "Too many requests. Try again in {seconds, plural, one {# second} other {# seconds}}.",
      "kind.validation": "Some of the information is invalid. Please check and try again.",
      "kind.business": "The operation couldn't be completed.",
      "kind.server": "Something went wrong on the server. Please try again later.",
      "kind.network": "Network connection failed. Check your connection and try again.",
      "kind.timeout": "The request timed out. Please try again later.",
      "kind.invalid_response": "The server returned an unexpected response. Please try again later.",
      "code.INVALID_CREDENTIALS": "Incorrect username or password.",
      "code.ACCOUNT_DISABLED": "This account has been disabled.",
      "code.ACCOUNT_DELETED": "This account has been deleted.",
      "code.VERIFICATION_TOO_FREQUENT": "Codes are being requested too often. Please wait a moment.",
      "code.VERIFICATION_DAILY_LIMIT": "You've reached today's limit for verification codes.",
      "code.VERIFICATION_CHANNEL_UNAVAILABLE": "Verification codes are temporarily unavailable.",
      "code.VERIFICATION_SEND_FAILED": "The verification code couldn't be sent. Please try again later.",
      "code.INVALID_EMAIL_CODE": "The email code is wrong or has expired.",
      "code.EMAIL_TAKEN": "This email is already linked to another account.",
      "code.INVALID_EMAIL": "The email address is invalid.",
    },
  },
};
