# Volition Workbench

浏览器端主应用。承担 Volition 的主要编辑、调试、可视化和项目管理体验。

首批实现目标：Project shell、Connection Manager、portable config editor、Agent Inspector、runtime snapshot、Timeline/Trace 容器。

Workbench 通过 `Packages/Schema` 处理离线资产，通过 `Packages/Protocol` 与运行中的 Bridge 通信。它不能直接依赖 Unreal、Unity 或 Godot SDK。
