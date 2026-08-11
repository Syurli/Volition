# Volition Workbench

`Apps/Workbench` 是 Volition 的正式浏览器产品应用，同时也是 GitHub Pages 部署源。

## Reference Slice 01

首版不是大型 AI 节点编辑器，而是一个可直接使用的 Runtime Inspector：

- bundled Tactical Wizard generic rifle demo；
- Project / portable config viewer、JSON file import 与 validation；
- Agent list；
- Context / Observation；
- Memory / Belief；
- Decision Candidates / selected Intent；
- Current Action / ActionResult；
- Trace Timeline；
- Connection Manager；
- About / version / docs 属于同一 Workbench Shell。

## Build

从仓库根目录：

```bash
npm install
npm run test
npm run build
```

本地 production build 与 GitHub Pages 使用相同 `npm run build`，产物位于 `Apps/Workbench/dist`。

Tactical Wizard 侧本地合同验证可生成 source reference tarballs：

```bash
npm run pack:reference
```

该产物仅用于当前双仓验证，不提前决定 npm registry / GitHub Packages / binary/WASM 等长期分发策略。

## Connection modes

- Pages / HTTPS：Offline Demo 永远可用；Live 首版只接受安全的 `wss://` endpoint。
- Local development：允许 `ws://localhost` / 局域网 endpoint 用于 Bridge 调试。

Workbench 不直接依赖 Babylon.js、Jolt、Vlox、Unreal、Unity 或 Godot SDK，也不是 shipping runtime 强依赖。
