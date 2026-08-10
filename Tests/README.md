# Tests

Volition 的测试将在实现过程中逐步建立。

优先覆盖：

- Agent 生命周期；
- Decision 的确定性与边界条件；
- Scheduler 选择与拒绝；
- Resource acquire/release；
- Request cancellation；
- Behavior interruption；
- Runtime cleanup。

Unreal Automation Tests 可以放在相应模块的 `Private/Tests` 中；本目录用于测试策略、测试资产说明以及未来需要独立保存的验证数据。
