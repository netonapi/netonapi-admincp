import { installedModules } from "@/generated/modules.generated";

/**
 * 内容由工作区宿主渲染，这里只负责让宿主认识这些路径（静态导出要据此产出 HTML，
 * 深链才能直达）。解析路径、鉴权、渲染都在工作区里完成。
 */
export default function CatchAllRoute() {
  return null;
}

export function generateStaticParams() {
  return installedModules.flatMap((module) => module.pages).map((page) => ({
    slug: page.path.split("/").filter(Boolean),
  }));
}
