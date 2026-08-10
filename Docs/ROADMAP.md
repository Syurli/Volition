# Volition Initial Roadmap

> 这是初始化阶段的里程碑地图，不是发布日期承诺。顺序可以根据验证结果调整。

## Phase 0 — Foundation

目标：让仓库、模块与概念边界可稳定开始开发。

- [x] 确认产品命名：能动 Volition
- [x] 确认厂牌：A BAIGE Project
- [x] 建立 Core / Runtime / Editor 模块边界
- [x] 建立产品、架构和 AI 开发约束文档
- [ ] 确认首个目标 Unreal Engine 版本矩阵
- [ ] 确认开源 / 商业许可证策略
- [ ] 建立最小 CI 编译验证

**Exit Criteria**：空插件可在目标 UE 版本加载，仓库有明确的开发规则和依赖边界。

## Phase 1 — Minimal Agent Runtime

目标：完成不依赖复杂 AI 系统的最小 Agent 运行闭环。

候选任务：

- Agent identity / handle
- Agent lifecycle
- Runtime registration
- Context 基础模型
- Intent / Behavior 的最小表达
- 基础事件与状态查询
- Automation Tests

**Exit Criteria**：测试场景中可创建 Agent、观察 Context、触发一个明确行为并正确结束生命周期。

## Phase 2 — Decision & Scheduling

目标：把“选择什么”和“何时执行”分离。

候选任务：

- Decision Policy 接口
- Intent selection
- Priority
- Scheduler
- 可解释的选择/拒绝原因
- 行为切换规则

**Exit Criteria**：多个候选行为竞争时，结果稳定、可测试、可解释。

## Phase 3 — Resource & Request Arbitration

目标：解决多个行为对有限能力的竞争和释放。

候选任务：

- Resource identity
- Acquire / Request / Release 语义
- Ownership
- Pending request
- Cancellation
- Flush / cleanup
- 冲突与饥饿策略

**Exit Criteria**：资源竞争、取消和生命周期结束均不会留下悬空 ownership。

## Phase 4 — Unreal Behavior Integration

目标：验证 Volition 作为上层 Agent Framework 可以驱动实际 UE 行为执行。

候选任务：

- StateTree integration
- Behavior adapter
- Context bridge
- execution callbacks
- failure / interruption mapping
- 示例 Enemy / NPC

**Exit Criteria**：Volition 决策能够稳定驱动一个真实 StateTree 行为，并支持中断、切换和回收。

## Phase 5 — Debugger & Tooling

目标：开发者能够直接看懂 Agent 为什么这样行动。

候选任务：

- Agent inspector
- Decision / Intent view
- Request & Resource view
- Scheduler trace
- Timeline / history
- validation warnings

**Exit Criteria**：常见行为竞争问题无需逐行断点即可定位。

## Phase 6 — Public 2.0 Candidate

目标：形成可以供真实项目试用的完整最小产品。

- 示例工程 / Demo
- API 文档
- Migration stance 文档
- 性能 profiling
- 错误处理
- 包体与发布流程
- Fab / GitHub 发布准备
- License 与第三方依赖清单

**Exit Criteria**：真实项目可集成、可调试、可升级，核心工作流有自动验证。

## Later Exploration

在核心 Runtime 稳定后再评估：

- Utility AI 标准实现
- World / Squad / Director 层调度
- Mass Entity integration
- 网络复制
- Save / restore runtime state
- Web reference runtime
- Unity / Godot bridge
- LLM / planner integration

这些方向当前不是核心 Runtime 的阻塞项。
