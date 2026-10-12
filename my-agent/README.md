# my-agent

基于相邻 `../pi` 源码构建的自定义编程 CLI。复用 Pi SDK 的文件读取、编辑、写入、Shell、会话持久化和上下文管理；CLI 界面在本项目中实现。

## 启动

```bash
cd /home/weijia/agent-dev/my-agent
nvm use
npm start -- --help
```

Node.js 要求 >=22.19。当前环境通过 nvm 安装 Node 22；新终端先执行 `nvm use`。

配置认证（二选一）：

```bash
# 使用提供商环境变量，例如 Anthropic
export ANTHROPIC_API_KEY="你的密钥"

# 或使用安装在本项目中的 Pi CLI 登录，运行后输入 /login
npm run pi
```

不要将密钥写入源码或提交到 Git。本应用读取 Pi 的凭据和模型配置，默认位于 `~/.pi/agent/`；也可使用 Pi 支持的提供商环境变量。

```bash
# 列出已配置凭据的可用模型
npm start -- --list-models

# 指定工作目录，使用 Pi 配置的默认模型
npm start -- --cwd /path/to/project

# 显式选择模型，ID 以 --list-models 输出为准
npm start -- --cwd /path/to/project --provider anthropic --model claude-sonnet-4-6

# 恢复该目录最近的一次 my-agent 会话
npm start -- --cwd /path/to/project --continue

# 单次任务；也适合脚本调用
npm start -- --cwd /path/to/project -p "介绍这个项目，先不要修改文件"
```

交互命令：`/help`、`/session`、`/exit`。运行中按 Ctrl+C 取消，空闲时按 Ctrl+C 退出。当前只接受单行输入；执行任务时的新输入不会排队。Ctrl+D 关闭输入并取消尚未完成的任务。

会话单独保存到 `~/.my-agent/sessions/<工作目录哈希>/`，不会继续 Pi 原 CLI 的会话。恢复时会加载历史上下文，目前不重绘全部历史消息。工作目录会先解析符号链接。

内置工具以启动用户的权限运行；`--cwd` 指定工作目录，不是沙箱。SDK 默认资源发现仍适用，但本 CLI 没有实现 Pi TUI 专用的扩展弹窗、选择器等界面，也未预装 CLI 特有的 MCP/codemode 扩展。

## 代码结构

```text
src/main.ts             输入循环、取消与退出
src/cli/options.ts      命令行参数
src/cli/render.ts       流式回答和工具事件展示
src/runtime/session.ts  SDK 会话创建、模型选择与恢复
src/tools/index.ts      自定义工具注册入口
scripts/sync-pi.mjs     构建并接入本地 Pi 包
test/session.test.ts    模拟模型驱动真实 SDK 的集成测试
```

先在 `src/tools/` 添加业务工具，在 `customTools` 中注册。需要修改会话、压缩或循环机制时，再修改 `../pi/packages/coding-agent` 或 `../pi/packages/agent`。

## 修改 Pi 后同步

```bash
npm run sync:pi
```

脚本使用 Pi 自带的打包和依赖接入工具，构建一套一致的本地 tarball，并为传递 Pi 依赖设置 overrides。每次生成新的 `../pi/.artifacts/my-agent-*/` 目录；当前 package.json/lockfile 引用的目录需要保留。生成的依赖路径适用于当前相邻目录布局，不是可发布到 npm 的产品构建。

快速开发时也可以直接运行源码：

```bash
npm run dev -- --cwd /path/to/project
```

`dev` 使用 Pi 仓库自带的源码解析器，直接加载 `../pi` 的 TypeScript；`start` 使用最近一次打包的版本。

首次在新机器配置时：

```bash
cd ../pi
npm ci --ignore-scripts
npm run hydrate:model-data
cd ../my-agent
npm run sync:pi
```

公开模型数据只需首次生成或按需更新；同步构建默认使用已有数据。应用与 Pi 的依赖安装均禁用 lifecycle scripts。

## 验证

```bash
npm run check
npm test
```

测试使用模拟模型和临时工作目录，验证真实文件工具、命令执行、流式输出、会话恢复与取消，不需要 API Key，也不调用付费模型。
