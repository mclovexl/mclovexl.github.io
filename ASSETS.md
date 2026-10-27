# 参考与素材

## 参考项目

- [90x64/lovers-website](https://github.com/90x64/lovers-website)：参考情侣纪念站的整体内容思路。
- [liaoyanqing666/Photo_Wall](https://github.com/liaoyanqing666/Photo_Wall)：参考照片分类展示、点击大图、方向键浏览与相恋天数的交互思路。

本项目独立实现 HTML/CSS/JavaScript，未复制两个项目的代码、音乐或私人照片。

## 生成的星空背景

- 路径：`dist/assets/universe-hero.webp`，由原始生成 PNG 转为 WebP，尺寸保持不变，优化网页加载。
- 工具：内置 image_gen；2026-10-26 生成。
- 画面中的情侣为概念剪影，未使用或声称复原真人容貌。
- 最终提示词：

> Use case: stylized-concept. Asset type: premium romantic website cinematic hero background, landscape 3:2. A tiny dreamlike rose-peach planet in an immense midnight navy universe, positioned in the RIGHT HALF of the image, its surface softly illuminated like a glowing pink moon, delicate luminous elliptical orbital rings and scattered small moons orbit it. A very tiny couple seen only as silhouettes holding hands on the curved top surface of the small planet, no facial detail. Dusty blush nebula clouds drift across the lower right and bottom, fine sparse stars, warm starlight. The LEFT HALF is quiet almost solid deep ink navy negative space for website text. Elegant, poetic, sophisticated editorial 3D render with believable light and fine film grain, cream highlights, peach pink rim light, dark muted plum shadows, absolutely no bright purple, no blue cyan lasers. Strong depth and cinematic volumetric lighting. The globe and couple occupy center-right between x=65%-90%, vertical center, with generous surrounding dark space. Soft dreamy photography meets high end astronomical art. No text, no letters, no logos, no watermark, no UI, no borders.

## 照片墙氛围示例

图片来自 Unsplash。图片仅用于浪漫风景氛围示例，页面已明确标注；它们不是赵管家和黄少爷的真实经历或照片。首次上传真实照片时会替换全部示例。下载为本地文件以便离线使用，没有使用两个参考仓库内的情侣私人照片。

| 本地文件 | 原始图片 |
| --- | --- |
| memory-sea.jpg | https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1 |
| memory-sunset.jpg | https://images.unsplash.com/photo-1500530855697-b586d89ba3ee |
| memory-coffee.jpg | https://images.unsplash.com/photo-1442512595331-e89e73853f31 |
| memory-road.jpg | https://images.unsplash.com/photo-1464822759023-fed622ff2c3b |
| memory-flowers.jpg | https://images.unsplash.com/photo-1490750967868-88aa4486c946 |
| memory-stars.jpg | https://images.unsplash.com/photo-1462331940025-496dfbfc7564 |

星光、轨道、信封、礼物盒和界面装饰由项目原生 Canvas/CSS/SVG 绘制。

## 背景音乐

用户提供的《我曾这样寂寞生活 - 饭碗的彼岸.mp3》，保存为 `dist/assets/our-song.mp3`，使用原文件，未转码。文件大小 4,219,342 字节，SHA-256 为 `5a09de03c847df98487f3fc5e2fb7422b5c2acb2aae85cfd060cc84e5fd6125b`。点击页首音乐按钮播放或暂停，离线打包也包含该音乐。
