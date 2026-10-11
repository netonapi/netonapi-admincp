/** 与 module-system AuthController / MenuVO 对齐的最小类型集。 */

export interface Envelope<T> {
  code: number;
  message?: string;
  data?: T;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  userId: number;
  expiresTime: number;
  username: string;
  nickname: string;
}

export interface MenuNode {
  id: number;
  name: string;
  permission?: string | null;
  /** 1=目录 2=菜单 3=按钮 */
  type: number;
  parentId: number;
  path?: string | null;
  /** 页面 key（== FrontPageManifest.key） */
  component?: string | null;
  icon?: string | null;
  sort: number;
  status: number;
  visible: boolean;
  keepAlive: boolean;
  children?: MenuNode[] | null;
}

export interface PermissionInfo {
  user: {
    userId: string;
    username: string;
    nickname: string;
    avatar: string;
    homePath: string;
  };
  roles: string[];
  permissions: string[];
  menus: MenuNode[];
}

export interface PageResponse<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

/**
 * 当前格式化语言与时区。由 I18nProvider 在语言切换时设置（见 i18n.tsx 的 setFormatLocale），
 * 使模块里直接调用的 [formatDateTime] / [formatMoney] 不必改成 hook 也能跟随当前语言（评审 R12）。
 */
let formatLocale = process.env.NEXT_PUBLIC_NETON_DEFAULT_LOCALE?.trim() || "zh-CN";
let formatTimeZone: string | undefined = process.env.NEXT_PUBLIC_NETON_TIME_ZONE?.trim() || undefined;

export function setFormatLocale(locale: string, timeZone?: string): void {
  formatLocale = locale;
  formatTimeZone = timeZone;
}

/** 部署的默认币种（ISO 4217），后端金额字段没带币种时用它。 */
export const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_NETON_CURRENCY?.trim() || "CNY";

export function formatDateTime(value?: number | string | null): string {
  if (value === null || value === undefined || value === "" || value === 0 || value === "0") return "-";
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const milliseconds = typeof numeric === "number" && numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(formatLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: formatTimeZone,
  }).format(date);
}

/**
 * 金额。[minorUnits] 是最小货币单位的整数（分），按币种的小数位换算：CNY/USD 两位、JPY 零位、
 * KWD 三位。不再写死 `¥` 与两位小数。
 */
export function formatMoney(minorUnits: number | string | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  const amount = Number(minorUnits ?? 0);
  const fmt = new Intl.NumberFormat(formatLocale, { style: "currency", currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format((Number.isFinite(amount) ? amount : 0) / 10 ** digits);
}
