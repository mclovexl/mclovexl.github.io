# 你就是我的宇宙 · 云端相册版

赵管家 × 黄少爷，始于北京时间 2026 年 6 月 24 日 19:30。

保留星空、照片墙、相恋时钟、故事、愿望与小游戏。照片改为 Supabase 私有云存储，支持登录后跨设备查看。

## 使用

首次使用专属的一次性开通链接，由本人设置至少 12 个字符的相册密码。以后用邮箱与该密码登录「共享相册」。开通链接只存于私有交付目录，不属于网站源码。

登录后上传照片，照片和标题、分类、日期都保存到云端。另一设备登录后打开或刷新即可读取；当前打开的页面每 30 秒同步一次，切回页面时也会刷新。

当前只开放用户指定的账号。第二个账号需要在后台名单中加入，且使用独立开通链接自行设置密码。数据库最多允许一个 owner 和一个 partner。前台没有公开注册入口。

## 数据边界

- 相册照片、分类、标题、日期：云端共享。
- 故事、愿望、昵称修改、情书编辑：当前仍保存在当前浏览器，未声称支持同步。
- 退出后立即清除页面中的私密照片展示；其他设备的登录不受影响。
- 「打包送给她」导出可离线阅读的完整 HTML，包含导出时的照片，不包含登录会话或开通凭据。导出的文件不再自动同步。
- GitHub Pages 的网页展示范围由 GitHub 配置决定，当前页面的预置文案在静态源码中。私密照片始终通过云端鉴权，不放进代码仓库。

## 后端

项目：`our-universe`，区域：Singapore，项目引用：`ktjtnwduryzxrbptgiuk`。

- 数据表：`public.album_photos`，RLS 对名单内的已登录账号开放。
- 私有桶：`our-universe-private`，原图使用短时签名链接。
- 成员名单：`private.album_members`，账号只能读取自己的角色，无法在网页修改成员。
- 开通能力：`album-enroll` Edge Function，校验高熵的一次性开通令牌；数据库只保存令牌哈希，绑定预先授权的邮箱。
- 管理服务密钥由 Supabase 托管在函数环境中；前端只使用 publishable key。
- SQL 迁移文件在 `supabase/migrations/`。

## GitHub Pages

GitHub 仓库：`zhaomengchi/-`。

源码放在 `main`，可以使用 `.github/workflows/pages.yml` 发布 `dist/`。如果采用独立 `gh-pages` 分支，则发布该分支根目录。最终以实际成功部署的配置为准。

## 本地检查

```powershell
node scripts/verify.cjs
python scripts/cloud-access-check.py
python -m http.server 4175 --bind 127.0.0.1 --directory dist
```

`scripts/preview-private.py` 仅供本机开通时使用，需有被 Git 忽略的 `.private/enrollment.json`。不要把 `.private/` 上传到仓库。

Supabase JavaScript SDK 版本固定为 `2.118.0`，官方 npm 包的 UMD 文件自托管在 `dist/vendor/`，不需要第三方 CDN 才能加载页面。
