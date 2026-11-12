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
