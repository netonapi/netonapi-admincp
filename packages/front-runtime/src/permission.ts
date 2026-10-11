/**
 * 权限匹配（RBAC spec §4.2，评审 R16）—— 与后端 `security.WildcardPermissionEvaluator` 逐条一致。
 *
 * 只认三种通配：`*:*:*`、`<module>:*:*`、`<module>:<resource>:*`。不支持中段通配
 * （`system:*:list`、`*:user:list`）和单个 `*`；要求的权限串本身必须是三段式且不含通配。
 *
 * 前端判断只决定按钮、菜单显不显示，真正的授权在后端；两边规则不同的后果是「按钮显示了却调不通」，
 * 或反过来。测试向量见 permission.test.mts，与后端 WildcardPermissionEvaluatorTest 同一组。
 */
export function isPermitted(granted: readonly string[], required: string): boolean {
  if (granted.includes("*:*:*")) return true;
  const parts = required.split(":");
  if (parts.length !== 3 || parts.some((p) => p === "" || p === "*")) return false;
  const [module, resource] = parts;
  return granted.includes(`${module}:*:*`) || granted.includes(`${module}:${resource}:*`) || granted.includes(required);
}
