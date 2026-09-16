/* 自动生成：pnpm registry（scripts/generate-registry.mts）。禁止手改。 */
import type { FrontModuleManifest } from "@neton/application-front-contract";
import type * as React from "react";

export const installedModules: FrontModuleManifest[] = [
  {
    "id": "system",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "system/user/index",
        "path": "/system/user",
        "entry": "user-list",
        "rendering": "client"
      },
      {
        "key": "system/setting/index",
        "path": "/system/setting",
        "entry": "setting-list",
        "rendering": "client"
      },
      {
        "key": "system/role/index",
        "path": "/system/role",
        "entry": "role-list",
        "rendering": "client"
      },
      {
        "key": "system/menu/index",
        "path": "/system/menu",
        "entry": "menu-list",
        "rendering": "client"
      },
      {
        "key": "system/dept/index",
        "path": "/system/dept",
        "entry": "dept-list",
        "rendering": "client"
      },
      {
        "key": "system/post/index",
        "path": "/system/post",
        "entry": "post-list",
        "rendering": "client"
      },
      {
        "key": "system/dict/index",
        "path": "/system/dict",
        "entry": "dict-list",
        "rendering": "client"
      },
      {
        "key": "system/notice/index",
        "path": "/system/notice",
        "entry": "notice-list",
        "rendering": "client"
      },
      {
        "key": "system/loginlog/index",
        "path": "/system/login-log",
        "entry": "login-log",
        "rendering": "client"
      },
      {
        "key": "system/operatelog/index",
        "path": "/system/operate-log",
        "entry": "operate-log",
        "rendering": "client"
      },
      {
        "key": "system/mail/account/index",
        "path": "/system/mail/account",
        "entry": "mail-account",
        "rendering": "client"
      },
      {
        "key": "system/mail/template/index",
        "path": "/system/mail/template",
        "entry": "mail-template",
        "rendering": "client"
      },
      {
        "key": "system/mail/log/index",
        "path": "/system/mail/log",
        "entry": "mail-log",
        "rendering": "client"
      },
      {
        "key": "system/sms/channel/index",
        "path": "/system/sms/channel",
        "entry": "sms-channel",
        "rendering": "client"
      },
      {
        "key": "system/sms/template/index",
        "path": "/system/sms/template",
        "entry": "sms-template",
        "rendering": "client"
      },
      {
        "key": "system/sms/log/index",
        "path": "/system/sms/log",
        "entry": "sms-log",
        "rendering": "client"
      },
      {
        "key": "system/notify/template/index",
        "path": "/system/notify/template",
        "entry": "notify-template",
        "rendering": "client"
      },
      {
        "key": "system/notify/message/index",
        "path": "/system/notify/message",
        "entry": "notify-message",
        "rendering": "client"
      },
      {
        "key": "system/notify/my/index",
        "path": "/system/notify/my",
        "entry": "notify-my",
        "rendering": "client"
      },
      {
        "key": "system/social/user/index",
        "path": "/system/social/user",
        "entry": "social-user",
        "rendering": "client"
      }
    ]
  },
  {
    "id": "gateway",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "gateway/channel/index",
        "path": "/gateway/channel",
        "entry": "channel-list",
        "rendering": "client"
      },
      {
        "key": "gateway/token/index",
        "path": "/gateway/token",
        "entry": "token-list",
        "rendering": "client"
      },
      {
        "key": "gateway/price/index",
        "path": "/gateway/price",
        "entry": "price-list",
        "rendering": "client"
      },
      {
        "key": "gateway/log/index",
        "path": "/gateway/log",
        "entry": "log-list",
        "rendering": "client"
      },
      {
        "key": "gateway/settlement/index",
        "path": "/gateway/settlement",
        "entry": "settlement-list",
        "rendering": "client"
      },
      {
        "key": "gateway/group/index",
        "path": "/gateway/group",
        "entry": "group-list",
        "rendering": "client"
      },
      {
        "key": "gateway/redemption/index",
        "path": "/gateway/redemption",
        "entry": "redemption-list",
        "rendering": "client"
      },
      {
        "key": "gateway/group-override/index",
        "path": "/gateway/group-override",
        "entry": "group-override-list",
        "rendering": "client"
      }
    ]
  },
  {
    "id": "infra",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "infra/file/index",
        "path": "/infra/file",
        "entry": "file-list",
        "rendering": "client"
      },
      {
        "key": "infra/fileConfig/index",
        "path": "/infra/file-config",
        "entry": "file-config-list",
        "rendering": "client"
      },
      {
        "key": "infra/job/index",
        "path": "/infra/job",
        "entry": "job-list",
        "rendering": "client"
      },
      {
        "key": "infra/job/logger/index",
        "path": "/infra/job-log",
        "entry": "job-log",
        "rendering": "client",
        "standalone": true
      },
      {
        "key": "infra/apiAccessLog/index",
        "path": "/infra/api-access-log",
        "entry": "api-access-log",
        "rendering": "client"
      },
      {
        "key": "infra/apiErrorLog/index",
        "path": "/infra/api-error-log",
        "entry": "api-error-log",
        "rendering": "client"
      },
      {
        "key": "infra/redis/index",
        "path": "/infra/redis",
        "entry": "redis-monitor",
        "rendering": "client"
      }
    ]
  },
  {
    "id": "member",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "member/user/index",
        "path": "/member/user",
        "entry": "user-list",
        "rendering": "client"
      },
      {
        "key": "member/user/detail",
        "path": "/member/user/:id",
        "entry": "user-detail",
        "rendering": "client",
        "standalone": true,
        "identity": [
          "id"
        ],
        "title": "会员详情 · :id"
      },
      {
        "key": "member/tag/index",
        "path": "/member/tag",
        "entry": "tag-list",
        "rendering": "client"
      },
      {
        "key": "member/level/index",
        "path": "/member/level",
        "entry": "level-list",
        "rendering": "client"
      },
      {
        "key": "member/group/index",
        "path": "/member/group",
        "entry": "group-list",
        "rendering": "client"
      },
      {
        "key": "member/point/record/index",
        "path": "/member/point/record",
        "entry": "point-record",
        "rendering": "client"
      },
      {
        "key": "member/signin/config/index",
        "path": "/member/signin/config",
        "entry": "signin-config",
        "rendering": "client"
      },
      {
        "key": "member/signin/record/index",
        "path": "/member/signin/record",
        "entry": "signin-record",
        "rendering": "client"
      },
      {
        "key": "member/config/index",
        "path": "/member/config",
        "entry": "member-config",
        "rendering": "client"
      },
      {
        "key": "member/invite/code/index",
        "path": "/member/invite/code",
        "entry": "invite-code",
        "rendering": "client"
      }
    ]
  },
  {
    "id": "payment",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "pay/app/index",
        "path": "/pay/app",
        "entry": "app-list",
        "rendering": "client"
      },
      {
        "key": "pay/channel/index",
        "path": "/pay/app/:id/channels",
        "entry": "channel-list",
        "rendering": "client",
        "standalone": true,
        "identity": [
          "id"
        ],
        "title": "支付渠道 · :id"
      },
      {
        "key": "pay/order/index",
        "path": "/pay/order",
        "entry": "order-list",
        "rendering": "client"
      },
      {
        "key": "pay/refund/index",
        "path": "/pay/refund",
        "entry": "refund-list",
        "rendering": "client"
      },
      {
        "key": "pay/notify/index",
        "path": "/pay/notify",
        "entry": "notify-list",
        "rendering": "client"
      },
      {
        "key": "pay/transfer/index",
        "path": "/pay/transfer",
        "entry": "transfer-list",
        "rendering": "client"
      },
      {
        "key": "pay/wallet/balance/index",
        "path": "/pay/wallet/balance",
        "entry": "wallet-list",
        "rendering": "client"
      },
      {
        "key": "pay/wallet/rechargePackage/index",
        "path": "/pay/wallet/recharge-package",
        "entry": "recharge-package-list",
        "rendering": "client"
      },
      {
        "key": "pay/withdraw/index",
        "path": "/pay/withdraw",
        "entry": "withdraw-list",
        "rendering": "client"
      },
      {
        "key": "pay/wallet/freeze/index",
        "path": "/pay/wallet/freeze",
        "entry": "freeze-list",
        "rendering": "client"
      }
    ]
  },
  {
    "id": "platform",
    "contractVersion": "1.0.0",
    "pages": [
      {
        "key": "platform/api/index",
        "path": "/platform/api",
        "entry": "api-list",
        "rendering": "client"
      },
      {
        "key": "platform/client/index",
        "path": "/platform/client",
        "entry": "client-list",
        "rendering": "client"
      },
      {
        "key": "platform/clientapi/index",
        "path": "/platform/client-api",
        "entry": "client-api-list",
        "rendering": "client"
      },
      {
        "key": "platform/chargerecord/index",
        "path": "/platform/charge-record",
        "entry": "charge-record-list",
        "rendering": "client"
      },
      {
        "key": "platform/log/index",
        "path": "/platform/log",
        "entry": "log-list",
        "rendering": "client"
      },
      {
        "key": "platform/stat/index",
        "path": "/platform/stat",
        "entry": "stat-list",
        "rendering": "client"
      }
    ]
  }
];

export const pageRegistry: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  "system/user/index": () => import("@neton/application-front-system/pages/user-list"),
  "system/setting/index": () => import("@neton/application-front-system/pages/setting-list"),
  "system/role/index": () => import("@neton/application-front-system/pages/role-list"),
  "system/menu/index": () => import("@neton/application-front-system/pages/menu-list"),
  "system/dept/index": () => import("@neton/application-front-system/pages/dept-list"),
  "system/post/index": () => import("@neton/application-front-system/pages/post-list"),
  "system/dict/index": () => import("@neton/application-front-system/pages/dict-list"),
  "system/notice/index": () => import("@neton/application-front-system/pages/notice-list"),
  "system/loginlog/index": () => import("@neton/application-front-system/pages/login-log"),
  "system/operatelog/index": () => import("@neton/application-front-system/pages/operate-log"),
  "system/mail/account/index": () => import("@neton/application-front-system/pages/mail-account"),
  "system/mail/template/index": () => import("@neton/application-front-system/pages/mail-template"),
  "system/mail/log/index": () => import("@neton/application-front-system/pages/mail-log"),
  "system/sms/channel/index": () => import("@neton/application-front-system/pages/sms-channel"),
  "system/sms/template/index": () => import("@neton/application-front-system/pages/sms-template"),
  "system/sms/log/index": () => import("@neton/application-front-system/pages/sms-log"),
  "system/notify/template/index": () => import("@neton/application-front-system/pages/notify-template"),
  "system/notify/message/index": () => import("@neton/application-front-system/pages/notify-message"),
  "system/notify/my/index": () => import("@neton/application-front-system/pages/notify-my"),
  "system/social/user/index": () => import("@neton/application-front-system/pages/social-user"),
  "gateway/channel/index": () => import("@neton/application-front-gateway/pages/channel-list"),
  "gateway/token/index": () => import("@neton/application-front-gateway/pages/token-list"),
  "gateway/price/index": () => import("@neton/application-front-gateway/pages/price-list"),
  "gateway/log/index": () => import("@neton/application-front-gateway/pages/log-list"),
  "gateway/settlement/index": () => import("@neton/application-front-gateway/pages/settlement-list"),
  "gateway/group/index": () => import("@neton/application-front-gateway/pages/group-list"),
  "gateway/redemption/index": () => import("@neton/application-front-gateway/pages/redemption-list"),
  "gateway/group-override/index": () => import("@neton/application-front-gateway/pages/group-override-list"),
  "infra/file/index": () => import("@neton/application-front-infra/pages/file-list"),
  "infra/fileConfig/index": () => import("@neton/application-front-infra/pages/file-config-list"),
  "infra/job/index": () => import("@neton/application-front-infra/pages/job-list"),
  "infra/job/logger/index": () => import("@neton/application-front-infra/pages/job-log"),
  "infra/apiAccessLog/index": () => import("@neton/application-front-infra/pages/api-access-log"),
  "infra/apiErrorLog/index": () => import("@neton/application-front-infra/pages/api-error-log"),
  "infra/redis/index": () => import("@neton/application-front-infra/pages/redis-monitor"),
  "member/user/index": () => import("@neton/application-front-member/pages/user-list"),
  "member/user/detail": () => import("@neton/application-front-member/pages/user-detail"),
  "member/tag/index": () => import("@neton/application-front-member/pages/tag-list"),
  "member/level/index": () => import("@neton/application-front-member/pages/level-list"),
  "member/group/index": () => import("@neton/application-front-member/pages/group-list"),
  "member/point/record/index": () => import("@neton/application-front-member/pages/point-record"),
  "member/signin/config/index": () => import("@neton/application-front-member/pages/signin-config"),
  "member/signin/record/index": () => import("@neton/application-front-member/pages/signin-record"),
  "member/config/index": () => import("@neton/application-front-member/pages/member-config"),
  "member/invite/code/index": () => import("@neton/application-front-member/pages/invite-code"),
  "pay/app/index": () => import("@neton/application-front-payment/pages/app-list"),
  "pay/channel/index": () => import("@neton/application-front-payment/pages/channel-list"),
  "pay/order/index": () => import("@neton/application-front-payment/pages/order-list"),
  "pay/refund/index": () => import("@neton/application-front-payment/pages/refund-list"),
  "pay/notify/index": () => import("@neton/application-front-payment/pages/notify-list"),
  "pay/transfer/index": () => import("@neton/application-front-payment/pages/transfer-list"),
  "pay/wallet/balance/index": () => import("@neton/application-front-payment/pages/wallet-list"),
  "pay/wallet/rechargePackage/index": () => import("@neton/application-front-payment/pages/recharge-package-list"),
  "pay/withdraw/index": () => import("@neton/application-front-payment/pages/withdraw-list"),
  "pay/wallet/freeze/index": () => import("@neton/application-front-payment/pages/freeze-list"),
  "platform/api/index": () => import("@neton/application-front-platform/pages/api-list"),
  "platform/client/index": () => import("@neton/application-front-platform/pages/client-list"),
  "platform/clientapi/index": () => import("@neton/application-front-platform/pages/client-api-list"),
  "platform/chargerecord/index": () => import("@neton/application-front-platform/pages/charge-record-list"),
  "platform/log/index": () => import("@neton/application-front-platform/pages/log-list"),
  "platform/stat/index": () => import("@neton/application-front-platform/pages/stat-list"),
};
