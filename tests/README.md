# 手机记录流程回归

在 Claude 优化版目录启动独立测试服务（与日常预览端口分开）：

```sh
python3 -m http.server 4176 --bind 127.0.0.1 --directory project
```

使用现有原型工作区安装的 Playwright 运行：

```sh
NODE_PATH='../好好吃饭原型/node_modules' node tests/recording-flow.cjs
```

可通过 `TEST_BASE_URL` 和 `TEST_OUTPUT_DIR` 调整测试地址、报告目录。默认报告为 `/tmp/hhcf-recording-check/results.json`。

17 项检查覆盖 Chromium 与 WebKit 的选图、重复选图、取消选图、损坏文件恢复、相机拒绝后的原生拍摄 input、模拟 AI 成功/失败、手动修改、保存后重新加载、两类键盘视口、可视区域偏移、失焦时按钮稳定性、关闭键盘、缩放，以及 Chromium 模拟摄像头采集和释放。

测试使用独立浏览器上下文及本地应用图标作为图片文件，不读取或修改日常记录。识别接口完全拦截为测试响应，不调用 OpenAI。Chromium 使用浏览器模拟摄像头；WebKit 测试的系统相机入口用文件注入验证。键盘测试通过 VisualViewport 几何事件或调整布局视口重现遮挡条件，不是实体手机键盘或系统照片选择器。成功用例截图只保存键盘专项，失败详情记录在 JSON；原生权限弹窗、HEIC 解码和硬件相机仍需真机验收。

单项食物贴纸回归：

```sh
NODE_PATH='../好好吃饭原型/node_modules' node tests/food-stickers.cjs
```

覆盖 Chromium / WebKit 中单项识别结果的编辑、合计、保存刷新、超过 5 项的完整展示、手动裁剪、未知热量、手动新增、换图后清空旧区域及旧记录提示；另用隔离的模拟上游响应验证服务端结构、热量合计和越界坐标拒绝。不调用真实识别接口，不验证模型描边精度。

2026-11-12 抠图更新：`food-stickers.cjs` 使用 `tests/fixtures/salad-real.jpg` 和真实的本地 SlimSAM / WASM 推理，在 Chromium 与 WebKit 中验证透明遮罩、逐项保存及手动点选；只有食物名称/营养接口响应仍为测试输入。模型和运行库固定版本并随项目同源提供，无需测试密钥。首次读取模型约 25 MB，之后由浏览器缓存。

线上真实识别另以用户提供的饭团截图调用，2026-11-12 返回 HTTP 503 / API 额度不足。此结果不可记为识别通过。真实沙拉照片分割结果和饭团复杂背景失败案例保存在原型工作区 `design/food-cutout-real-2026-11-12/`，没有把用户照片加入 Git 仓库。

额外边界回归：`NODE_PATH='../好好吃饭原型/node_modules' node tests/cutout-edge.cjs`。验证旧方框/多边形不会作为完成贴纸渲染、抠图中取消后可重试、真实遮罩包含透明区域，以及保存刷新后仍保留。
