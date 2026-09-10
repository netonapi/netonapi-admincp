import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPermissionInfo, SESSION_COOKIE } from "@neton/application-front-runtime/server";
import { buildNav } from "@neton/application-front-runtime/menu";
import { WorkspaceRoot } from "@/components/workspace-root";

/**
 * 受保护布局。
 *
 * 布局跨宿主路由不卸载，所以工作区根挂在这里，页面实例的寿命才不受路由影响。
 * `children` 被刻意忽略：页面内容一律由工作区宿主渲染，宿主路由不再拥有 outlet
 * （见 app-shell 里 WorkspaceHost 处的注释）。
 */
export default async function ProtectedLayout() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const res = await getPermissionInfo(token);
  if (res.code !== 0 || !res.data) redirect("/login");

  return <WorkspaceRoot info={res.data} nav={buildNav(res.data.menus)} />;
}
