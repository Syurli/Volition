# Contributing to Volition

感谢参与 **能动 Volition** 的开发。

当前项目处于 2.0 重置后的 pre-alpha 阶段，架构清晰度优先于兼容性和功能数量。

## Before You Start

请先阅读：

- `README.md`
- `AGENTS.md`
- `Docs/PRODUCT.md`
- `Docs/ARCHITECTURE.md`
- `Docs/DECISIONS.md`

## Branches

建议使用短生命周期分支：

- `feat/<topic>`
- `fix/<topic>`
- `refactor/<topic>`
- `docs/<topic>`
- `chore/<topic>`

## Commits

推荐使用清晰的 Conventional Commit 风格：

```text
feat: add agent handle prototype
fix: prevent duplicate resource release
docs: define scheduler boundary
refactor: isolate runtime ownership logic
```

## Pull Requests

一个 PR 尽量只解决一个主题，并说明：

1. 目的；
2. 主要改动；
3. 架构影响；
4. 验证方式；
5. 未完成项。

公共 API、核心数据模型、模块依赖发生变化时，必须同步相关文档。

## Coding Principles

- 保持 `Editor → Runtime → Core` 的单向依赖。
- 不把 Volition 绑定为 StateTree 专用框架。
- 优先组合而非隐式全局状态。
- 资源所有权与生命周期必须明确。
- Debuggability 是功能的一部分，不是发布前补丁。
- 不为未经验证的未来需求提前构建复杂抽象。

## Compatibility

Volition 2.0 不以 UDMBF 1.0 兼容为目标。任何迁移层或兼容层都必须由明确任务驱动。

## License

项目许可证尚未确定。提交第三方代码或资产前必须确认其授权可以被本项目合法使用。
