# Volition Architecture Decisions

该文件记录已经确定、会影响后续开发方向的高层决策。更复杂的设计成熟后可以迁移为独立 ADR 文件。

---

## D-001 — 2.0 Is a Clean Reset

**Status:** Accepted

Volition 不作为 UDMBF 1.0 的原位升级继续开发。

### Consequences

- 不继承旧命名；
- 不默认兼容旧 API / asset；
- 旧实现只能作为经验参考；
- 可以为了更合理的架构主动打破历史设计。

---

## D-002 — Product Name Is Volition / 能动

**Status:** Accepted

正式产品身份：

- 中文：能动
- 英文：Volition
- Descriptor：Agent Decision & Behavior Framework
- Attribution：A BAIGE Project

代码不得重新引入 UDMBF2 等过渡品牌。

---

## D-003 — Unreal First, Conceptually Engine-Agnostic

**Status:** Accepted

首个正式实现面向 Unreal Engine，但框架的核心产品概念不能由 StateTree 或单一引擎 API 反向定义。

### Consequences

- 首版可以充分利用 Unreal 能力；
- 不要求现在实现跨引擎 Runtime；
- Core 保持低依赖；
- 引擎/行为系统耦合放在 Runtime integration 边界。

---

## D-004 — Initial Module Boundary

**Status:** Accepted

初始模块：

```text
VolitionEditor → VolitionRuntime → VolitionCore
```

### Consequences

- Editor-only API 不进入 Runtime；
- Core 不依赖 Runtime；
- Core 不依赖 StateTree；
- 若后续 StateTree 集成增长过大，可通过新 ADR 决定是否拆独立模块。

---

## D-005 — License Is Deliberately Undecided

**Status:** Accepted

初始化阶段不自动选择 MIT / Apache / GPL 或商业许可证。

### Reason

许可证会直接影响未来 GitHub 开源、Fab 商店发布、商业使用和第三方贡献策略，应该作为独立产品决策确认。

### Consequences

在 License 明确前：

- 不添加误导性许可证文件；
- 不默认允许第三方复制、分发或再授权；
- 引入外部代码前必须验证授权。
