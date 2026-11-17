# 已查阅的成熟游戏机制

查阅日期：2026-11-17。以下均为官方产品页或官方手册。机制借鉴与本项目实现分开说明；没有下载商业游戏素材或复制源码。

| 游戏 / 来源 | 来源支持的机制 | 本项目采用 |
|---|---|---|
| [Sonic & All-Stars Racing Transformed / SEGA Steam](https://store.steampowered.com/app/212480/Sonic__AllStars_Racing_Transformed_Collection/) | 比赛途中车、船、飞机变形；武器及角色专属 All-Star Move | 飞机一级、四发二级、悟空筋斗云三种动力状态，模型与操控改变 |
| [Mario Kart 8 Deluxe / Nintendo 官方道具页](https://www.nintendo.com/my/switch/aabp/item/index.html) | Mushroom 短时加速；Bullet Bill 自动沿路线推进；Red Shell 追踪前方目标；Super Horn 清除周围道具；Super Star 短时无敌加速 | 北极熊跟踪肩炮、范围清弹护盾；筋斗云无敌自动辅助；分级短时推进 |
| [Distance / Refract Steam](https://store.steampowered.com/app/233610/Distance/) | 霓虹赛车与平台跑酷结合，跳跃、旋转、飞行及随机赛道 | 复用现有跳跃和 WFC 无限路段，把动力飞行与辅助落地接入 |
| [Thumper 官方手册](https://thumpergame.com/manual/) | 精准动作与连续成功提高倍率；冲击波；PLAY+ 高倍率进一步提速 | 危险预警、险穿/反击连击、加速音画反馈；未实现其完整节奏判定或 Boss |

本项目的“锁定→固定目标→来袭→闪避/拦截→资源奖励”组合是基于上述机制的设计选择，不是声称某一原作完整使用了相同系统。

WFC 原理参考：[mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)。沿用上一版本已实现的最小熵坍缩与邻接传播，不重写地图引擎。

## 本地特效代码复用

来源：`/Users/kinzun/CodeGitProjects/LinearAbiltyCastingThreeJS`，MIT，Copyright (c) 2026 mohamedachrefelouafi。

`vfx.js` 内复用 `src/effects/RibbonGeometry.js`、`src/shaders/lib/noise.glsl.js`；爆炸的噪声位移/Fresnel/快速膨胀与镜头震动参考改编自 `src/effects/BurstSphere.js` 和 `src/effects/CameraShake.js`。为固定资源预算，替换原动态扩容池为预分配循环池，移除深度纹理/后处理依赖。完整许可附在 REFERENCE-LICENSE.txt 与 vfx.js 顶部。

吞天风暴版进一步移植 `src/archive/materials/WindMaterial.js` 的 TornadoMaterial 与 WindRibbonMaterial 着色器主体，并复用 `src/shaders/lib/common.glsl.js`。保留原细丝抗锯齿、分层螺旋尘流、漏斗形变和消散算法；用固定材质参数代替原工程 settings / GUI，取消 softFade 的深度预通道采样。引擎热流也使用该旋涡材质作火色改编，并非原项目的体积光线步进火焰。许可沿用 REFERENCE-LICENSE.txt。

## GPU 粒子直接移植

`reference-particles.js` 由参考项目 `src/particles/ParticleSystem.js` 直接复制改编，并包含其 `src/shaders/lib/common.glsl.js`。保留原实例化四边形、GPU 运动、粒子形状与发射缓冲区；替换 ES module 导入为现有离线脚本工厂，保留 MIT 全文，去掉外部配置与深度预通道采样，修正零寿命粒子可见性。由 vfx.js 提供已有 noiseGLSL，管理固定三种粒子池及坐标回收。

## 六种完整技能迁移与大规模战场

实际复制参考项目 31 个源文件到 `reference-six/`：Ice、Thunder、Meteor、Beam、Snare、Glacier 六种 Ability，以及对应材质、GPU 粒子、BurstSphere、GroundDecals、GroundFissures、LightPool 和程序几何。原文件保留供编辑，`build-six.py` 生成离线 bundle；MIT 许可位于目录内 LICENSE。适配取消深度软交界预通道、限制单粒子系统容量 512，使用独立效果场景与相应缩放的相机呈现约 6 倍尺度；保持主场景深度遮挡。

研究参考：[Digital Domain《安德的游戏》制作介绍](https://digitaldomain.com/work/enderaes-game/)。借鉴其巨大舰队及分层战场的视觉方向，加入实例化蜂群与广域连爆；没有复制电影画面、模型或音效。上一轮为远景单位；当前版本已增加每架机体的攻击状态与固定弹幕池。


## 围攻与音频研究（2026-11-17）

- [Homeworld 3 官方战斗改进](https://www.homeworlduniverse.com/dev-update-unpacking-the-biggest-improvements-coming-to-update-1-3/)：介绍大编队分成小编队、分配火力。本项目据此选择八队包抄、错开齐射；没有移植其 AI 源码。
- [Returnal 官方敌人与弹幕设计](https://blog.playstation.com/2021/04/14/creating-returnals-otherworldly-enemies-vfx-driven-tentacle-tech-and-deep-sea-inspirations/)：突出敌人组合和 Boss 弹幕图案。本项目据此设计带预警与缺口的弹幕墙、扫射主炮，视觉危险区对应实际碰撞。
- [Returnal Hyperion 战斗制作](https://blog.playstation.com/2021/05/28/returnal-the-making-of-that-unforgettable-hyperion-fight/) 与 [作曲家访谈](https://blog.playstation.com/2021/04/09/the-music-of-returnal-an-interview-with-composer-bobby-krlic/)：递进音乐与战斗相互配合、环境主题延展为战斗音乐。采用分层鼓/贝斯/琶音，随战斗状态升降。
- [Returnal 3D 音频介绍](https://blog.playstation.com/?p=348928)：战斗时让即时威胁突出。采用左右声像、母舰提前警报、爆炸时音乐闪避，以及 32 声部预算。

参考工程 `LinearAbiltyCastingThreeJS/src` 未提供可迁移的音频模块。本项目 `audio.js` 使用 Web Audio 生成 22 个 PCM 音色缓冲，原创合成背景音乐和效果音；不使用上述商业作品的录音或旋律。声像为轻量立体声近似，不是完整 HRTF 空间音频。


## 命中爆炸与镜头冲击升级

`src/effects/camera-shake.js` 直接复制改编参考工程 `src/effects/CameraShake.js`，沿用叠加正弦噪声、二次强度、可变衰减/频率、三轴位移、滚转及持续 rumble；提高位移与滚转幅度。许可沿用 `vendor/REFERENCE-LICENSE.txt`。原适配遗漏的 decay/frequency 参数已完整传递。

`src/effects/six-host.js` 在原生 BurstSphere 和地面冲击波生成时放大半径、提高强度与粒子发射量，仍保持每种爆心/地面效果各 3 槽、23 个粒子系统及 11776 槽总预算。`vfx.js` 的技能命中追加大爆心和最多 6 处延迟殉爆，共用 16 槽队列与 8 个爆炸壳；不会为连续释放扩容。相机在 lookAt 后应用震动，下一帧先撤去上次位移，避免漂移。


## 重装目标与可见破坏反馈

参考 [Bandai Namco《装甲核心 6》官方新手指南](https://www.bandainamcoent.com/news/armored-core-6-fires-of-rubicon-beginners-guide) 的冲击积累、失衡和高伤窗口，以及 [Bethesda《DOOM Eternal》官方战役介绍](https://bethesda.net/en-US/news/put-an-end-to-hell-on-earth-in-doom-eternal%27s-single-player-campaign) 的可见破坏与武器破坏反馈。当前实现为自动锁定战斗中的冲击条、短暂失衡、装甲阶段脱落和命中声画反馈，不是精确瞄准身体部位的弱点系统。

新蜂群模型为程序生成的飞翼机身、双发动机、座舱及尾翼，合并几何后实例化，1024 架分 16 队展开；没有使用上述游戏模型或音频。

本轮进一步采用上述 AC6 指南中“伤害与冲击分别衡量”的思路：六技能使用不同冲击系数，伤害独立计算；母舰 HUD 显示姿态积累与失衡倒计时。来弹的亮芯、尾迹及齐射/擦身音色为本项目程序生成。
