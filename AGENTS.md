# AGENTS.md

本文件定义 AI 编码代理（Codex、ChatGPT 或其他自动化开发代理）在 **Volition** 仓库中的默认工作约束。

## 1. Project Identity

- 产品名：**能动 Volition**
- 定位：**Agent Decision & Behavior Framework**
- 厂牌：**A BAIGE Project**
- 当前阶段：**2.0 architecture reset / pre-alpha**

Volition 是新项目。除非任务明确要求，否则**不要迁移、复制、兼容或复刻 UDMBF 1.0 的 API、类名、文件布局和历史实现**。

## 2. Primary Goal

优先建立清晰、可组合、可调试的游戏 Agent 运行模型，而不是追求短期功能数量。

核心闭环：

```text
Context → Decision → Intent → Behavior → Execution → Context
```

核心理念：**Agency over scripting.**

## 3. Architecture Boundaries

依赖方向必须保持：

```text
VolitionEditor → VolitionRuntime → VolitionCore
```

禁止反向依赖。

### VolitionCore

- 只放稳定的公共契约、基础类型、句柄、ID、事件和低层数据结构。
- 可以依赖 Unreal 的 Core 基础设施，但尽量保持低依赖。
- **不得依赖 StateTree、AIModule、UnrealEd 或具体行为系统。**

### VolitionRuntime

- Agent 生命周期
- Context
- Decision / Intent
- Behavior 执行协调
- Resource / Request / Ownership
- Scheduler / Priority / Arbitration
- 与 Unreal 运行时系统的适配

### VolitionEditor

- 调试器
- 可视化
- 编辑器资产和验证工具
- 开发者体验

任何只为编辑器存在的依赖都不得泄漏到 Runtime 或 Core。

## 4. StateTree Policy

StateTree 可以作为 Unreal 侧的重要执行后端或集成对象，但 **Volition ≠ StateTree Framework**。

新增设计时：

1. 先定义 Volition 自己的产品概念和接口；
2. 再决定是否需要 StateTree Adapter / Integration；
3. 不允许让 Core 的数据模型直接以 StateTree 类型作为唯一表达。

## 5. Naming Rules

统一使用：

- `VolitionCore`
- `VolitionRuntime`
- `VolitionEditor`
- `Volition` 作为产品/命名空间/公共类型前缀

禁止新增：

- `UDMBF2`
- `UDMBFNext`
- 其他把 2.0 描述成旧项目升级版的命名

UE 反射类型使用明确前缀，例如 `UVolition...`、`FVolition...`。

## 6. Change Discipline

- 一次任务解决一个明确问题。
- 避免无关重构。
- 公共 API 变更必须同步文档。
- 新增核心概念前，先检查 `Docs/ARCHITECTURE.md` 和 `Docs/DECISIONS.md`。
- 架构选择存在长期影响时，在 `Docs/DECISIONS.md` 增加记录。
- 不要为了“未来可能需要”提前引入大型抽象层。

## 7. Build & Validation

每次代码改动至少检查：

1. 模块依赖方向正确；
2. Runtime 不引用 Editor-only API；
3. 公共头文件不泄漏无必要依赖；
4. 新增 API 有最小文档说明；
5. 能自动测试的行为优先增加 Automation Test；
6. 无法在当前环境构建时，必须明确说明未验证项，不得声称已编译通过。

## 8. Compatibility Policy

Pre-alpha 阶段优先正确架构而非 API 稳定性。

- 不承诺 UDMBF 1.0 兼容。
- 不承诺早期 Volition API 永久稳定。
- 破坏性变更必须有理由并更新 CHANGELOG / DECISIONS。

## 9. License Policy

当前 License 尚未确定。

AI 代理不得自行加入 MIT、Apache-2.0、GPL 等许可证，也不要复制许可证不明确的第三方代码。

## 10. Definition of Done

一个任务完成时，应至少给出：

- 改了什么；
- 为什么这样改；
- 如何验证；
- 未验证或遗留的问题；
- 下一步最合理的后续任务（如有）。
