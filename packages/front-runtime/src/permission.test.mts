// 与后端 neton-application-module-system 的 WildcardPermissionEvaluatorTest 同一组向量（RBAC spec §4）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { isPermitted } from "./permission.ts";

const cases: Array<[granted: string[], required: string, expected: boolean]> = [
  [["*:*:*"], "system:user:query", true],
  [["system:*:*"], "system:user:query", true],
  [["system:user:*"], "system:user:query", true],
  [["system:user:query"], "system:user:query", true],
  [["system:user:query"], "system:user:update", false],
  [["system:role:*"], "system:user:query", false],
  [["payment:*:*"], "system:user:query", false],
  // 不支持的通配形式：一律不生效
  [["*"], "system:user:query", false],
  [["system:*:query"], "system:user:query", false],
  [["*:user:query"], "system:user:query", false],
  [["*:*:query"], "system:user:query", false],
  // 非法的 required：一律拒绝（*:*:* 例外，与后端一致）
  [["system:user:*"], "system:user", false],
  [["system:user:*"], "system:user:*", false],
  [["system:user:*"], "system::query", false],
  [[], "system:user:query", false],
];

for (const [granted, required, expected] of cases) {
  test(`${JSON.stringify(granted)} ${expected ? "allows" : "denies"} ${required}`, () => {
    assert.equal(isPermitted(granted, required), expected);
  });
}
