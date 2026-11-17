# 源码边界与修改入口

## 数据流

```text
ui/input → app 的输入状态 → simulation/player.step
                              ├─ road：路段与路线
                              ├─ battle：近景舰队与母舰
                              └─ swarm：1024 架蜂群、弹幕与区域攻击
                                       ↓
                                  状态 + 战斗事件
                                       ↓
                       app 转发 → render / effects / audio / ui
```

`player.cjs` 是模拟入口，保留原 `InfiniteRoad` 接口兼容现有调用。`road.cjs` 只管理 WFC 与固定路段池；`battle.cjs` 和 `swarm.cjs` 不创建模型。模拟层的 `fresh()` 创建一局状态，`step()` 推进状态并返回事件，暂停时不推进。

`render/` 的工厂只在初始化创建模型，`update()` 读取状态并更新已有缓冲。`primitives.js` 共享材质、几何、程序纹理和种子随机数；`environment.js` 管海水、日夜、天空及初始飞机；`rider.js` 管自行车、角色和飞行模型；`road.js` 更新固定道路槽。不要在这些文件中扣血或判断技能命中。

`app.js` 保留应用装配、开始/结束/暂停、事件转发、相机和帧调度。它不再包含角色造型、WFC 算法或键盘映射。HUD 的周期性刷新在 `ui/hud.js`；音频开关、开始界面等生命周期 UI 仍由 app 管理。

## 常见改动应该放哪里

| 要改什么                           | 文件                                                |
| ---------------------------------- | --------------------------------------------------- |
| WFC 邻接规则、路宽、路段回收       | `src/simulation/road.cjs`                           |
| 飞行救援、角色物理、技能冷却、肩炮 | `src/simulation/player.cjs`                         |
| 母舰耐久、近景舰队                 | `src/simulation/battle.cjs`                         |
| 蜂群包抄、弹幕碰撞、母舰范围攻击   | `src/simulation/swarm.cjs`                          |
| 悟空、北极熊、鹈鹕和自行车外形     | `src/render/rider.js`                               |
| 母舰模型 / 蜂群实例化              | `src/render/fleet.js` / `swarm.js`                  |
| 六招尺度、并发与粒子预算           | `src/effects/six-host.js` 与 `scripts/build-six.py` |
| 爆炸、镜头震动                     | `src/effects/vfx.js`                                |
| 音效与背景配乐                     | `src/audio/audio.js`                                |
| 按键 / HUD / 布局                  | `src/ui/input.js` / `hud.js` / `styles.css`         |

## 构建与第三方代码

为了保留双击 `file://` 离线运行，浏览器源码采用有明确工厂入口的普通脚本，按 `scripts/browser-scripts.json` 的依赖顺序打包，不引入运行时模块加载器。模拟文件同时提供 CommonJS 导出，供 Node 测试直接调用。

构建流程：`vendor/reference-six/` → `scripts/build-six.py` → `build/six-bundle.js`；再由 `scripts/build.py` 将清单脚本、HTML 模板与 CSS 内联为根目录 `index.html`。第三方原文件与许可保留；游戏适配集中在构建转换和 `six-host.js`，不在生成文件里打补丁。

格式化仅覆盖自有源码、测试和构建辅助文件，跳过 vendor、生成文件和旧版本。历史说明里的文件名与性能数字对应当时版本，当前入口以 README 为准。

## 验证要求

移动/拆分模块后运行 `npm test`，它会先重建产物，避免测试旧 bundle。浏览器验证至少覆盖 Enter 开始、Z 射击、六技能、飞行、M 静音、P 暂停、母舰两种范围攻击。正常页面不得暴露 `audit*` 操作入口；调试时才使用 `?audit=1`。
