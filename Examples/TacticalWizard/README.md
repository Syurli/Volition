# Tactical Wizard Reference Application #1

本目录只包含普通 portable data / fixture，用来验证 `Syurli/TWR_Dev` 的真实需求，不复制 Tactical Wizard 源码或资产。

固定回放：

```text
Patrol → Noise → Investigate → Visual Confirm → Engage
       → Visual Lost → Search last seen memory
       → confidence decay → Patrol
```

关键约束：

- Context 不包含隐藏玩家的实时位置；
- `visual_actor visible:false` 不携带 position；
- noise 使用 Host 已解析的 perceived position，而不是 Volition 自己读取音频/世界对象；
- Aim/Fire/Reload 只成为 Host action；
- fixture 同时服务产品 Demo 与自动回归测试。
