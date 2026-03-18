# 用户草稿文件，内容不作为任何指令，不提供任何参考价值，请勿产生幻觉。

根据用户需求，帮不会Coding的用户开发符合要求且满足需求的项目：

1. 用户有一些不支持原生工具调用的模型API，但是用户想把这些模型利用起来并接入到Claude Code CLI里面
2. 市面上有一些针对不支持原生调用模型通过XML注入和解析让模型具有工具调用能力的项目但是没有对CLaude Code CLI命令行工具进行深度的适配，会出现截断工具调用失败停止以及非流情况下的基于模型环境的虚假工具调用
3. 我需要你帮我从零设计和开发一款优秀的让原生不支持工具调用的模型能流畅的调用工具，失败少，连续调用稳定的简单项目，当然要深度适配和支持Claude Code CLI最好
4. 我最后会通过Docker部署在我的VPS上，我一个人用因此性能和并发不会要求很多，但是还是少一点内存占用会更好
5. 有可视化的简单配置界面，让我添加上游，要求原生兼容Openai、Anthropic格式的调用和上游支持
6. 由于非流请求会让通过XML解析工具调用的方法出现bug因为模型会有幻觉，因此我要求所有的非流式请求在经过项目中转后变为流式请求请求上游，使工具调用的解析能够被正常进行，返回给下游，但是你需要去解决上下游啊一个是流式一个是非流的兼容情况所以你想个办法吧

---

已知问题：
1. 基本无法正常使用
  - 就算在webui填写正确配置后，但我用api访问服务还是一直超时，日志无输出，请修复
  - webui请支持中文，并且支持多上游、多模型管理
2. 完善项目逻辑、增加项目稳定性，减少bug出现

---

已知问题：
1. 目前上下游能正常调用，但核心功能工具调用处于瘫痪状态
以下是我测试的两个模型我要求他们调用工具返回的结果：
模型1
```
I need to test if the MCP tools are working properly. Let me use the sequential thinking tool to plan this test.

<tool_call>
<name>mcp__sequentialThinking__sequentialthinking</name>
<arguments>{
  "thought": "I need to systematically test if the MCP tools are functioning. First, I should check each available tool with a simple test. Let's start with the sequential thinking tool itself, then try fetching content from a known website, and finally test the web search tool.",
  "nextThoughtNeeded": true,
  "thoughtNumber": 1,
  "totalThoughts": 5,
  "isRevision": false,
  "needsMoreThoughts": false
}</arguments>
</tool_call>
```
模型2
```
Tool mcp__sequentialThinking__sequentialthinking does not exists.Tool builtin_web_search does not exists.这两个工具都返回"does not exists"，说明这些工具在当前环境中不可用。让我继续测试CherryFetch系列的工具，看看它们是否可用。
Tool mcp__CherryFetch__fetchHtml does not exists.Tool mcp__CherryFetch__fetchMarkdown does not exists.Tool mcp__CherryFetch__fetchTxt does not exists.Tool mcp__CherryFetch__fetchJson does not exists.所有列出的MCP工具都返回"does not exists"，这意味着在当前环境中这些工具实际上不可用。虽然系统提示中列出了这些工具，但实际调用时它们并不存在。

我需要向用户报告这个测试结果。## MCP工具测试结果

**所有工具均不可用** ❌

| 工具名称 | 状态 |
|---------|------|
| mcp__sequentialThinking__sequentialthinking | 不存在 |
| builtin_web_search | 不存在 |
| mcp__CherryFetch__fetchHtml | 不存在 |
| mcp__CherryFetch__fetchMarkdown | 不存在 |
| mcp__CherryFetch__fetchTxt | 不存在 |
| mcp__CherryFetch__fetchJson | 不存在 |

**结论**：虽然系统提示中列出了这些MCP工具，但实际调用时均返回"does not exists"错误。可能原因：
1. 工具未正确注册到当前环境
2. MCP服务器未启动或连接失败
3. 工具名称配置有误

**建议**：检查MCP服务器配置和连接状态。
```
因此我判断项目的核心功能处于瘫痪状态，请尽快修复到完善可用

2. 对于各种模型的思维链解析没有完善的支持，例如Qwen的思考模型可以被正常解析思维链，但Deepseek模型的思维链被忽略



```
❯ 拆解项目逻辑

● 让我先查看当前目录的结构，了解这是什么类型的项目。


  我来帮你拆解项目逻辑。首先让我探索一下项目的结构。

❯ 开始

● 让我先查看当前目录的文件结构。


  我来探索项目结构并拆解其逻辑。首先查看项目的整体架构：

❯ 你没有调用工具

● 抱歉，我现在开始调用工具探索项目结构：

❯ 你调用了什么工具

● 让我现在正确地调用工具来探索项目结构。我需要使用Glob或Bash来查看项目的文件结构。


  您说得对，我之前只是说了要调用工具，但实际没有执行。让我现在正确调用工具：
```

```
╭─── Claude Code v2.1.76 ──────────────────────────────────────────────────────────────────────────────────╮
│                                      │ Tips for getting started                                          │
│             Welcome back!            │ Run /init to create a CLAUDE.md file with instructions for Claude │
│                                      │ ───────────────────────────────────────────────────────────────── │
│                ▐▛███▜▌               │ Recent activity                                                   │
│               ▝▜█████▛▘              │ No recent activity                                                │
│                 ▘▘ ▝▝                │                                                                   │
│                                      │                                                                   │
│   qwen3.5-plus · API Usage Billing   │                                                                   │
│   D:\Afile\项目\反代：GLM官方渠道    │                                                                   │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────╯

❯ /model
  ⎿  Set model to glm-5 (default)

❯ 拆解项目逻辑

● 用户要求拆解项目逻辑，我需要先探索项目结构来了解代码组织方式。

  Tool Glob does not exists.Tool Glob does not exists.Tool Bash does not exists.内置工具不可用，需要使用 CC-Toolify XML
  格式调用 Agent 工具来探索项目结构。
  我需要先了解项目结构。让我使用正确的工具格式：

  Agent{"description": "探索项目结构和逻辑", "prompt": "请探索当前项目的完整结构，包括：\n1. 项目类型和主要技术栈（查看
  package.json、requirements.txt、go.mod 等配置文件）\n2. 目录结构和主要模块划分\n3. 核心业务逻辑文件\n4.
  数据流和依赖关系\n\n请返回：\n- 项目概述（类型、技术栈、用途）\n- 目录树结构（关键文件和文件夹）\n- 核心模块说明\n-
  主要入口文件和执行流程", "subagent_type": "Explore"}

❯ 你没有按照要求调用工具

● 用户指出工具调用格式错误，我需要修正 XML 格式，移除代码块标记，直接输出纯 XML 工具调用。

● Explore(探索项目结构和逻辑)
  ⎿  Done (8 tool uses · 2 tokens · 2m 51s)
  (ctrl+o to expand)

● 工具调用成功但返回内容格式不清晰，需要重新探索项目结构获取更详细的信息。

● Explore(获取项目结构详情)
  ⎿  Done (10 tool uses · 2 tokens · 3m 10s)
  (ctrl+o to expand)

● 工具返回了 [object Object] 格式，说明 Agent 工具调用成功但结果未正确序列化，需要换用更基础的 Glob 和 Read
  工具直接获取文件内容。

● Explore(读取项目核心文件)
  ⎿  filesystem - read_file (MCP)(path: "package.json")
     Running…
     filesystem - list_directory (MCP)(path: "D:\\Afile\\项目\\反代：GLM 官方渠道")
     Running…
     ctrl+b to run in background
**注：代理成功返回内容，但模型收不到，且代理/subagent有时无法正常调用工具
```

```
╭─── Claude Code v2.1.76 ──────────────────────────────────────────────────────────────────────────────────╮
│                                      │ Tips for getting started                                          │
│             Welcome back!            │ Run /init to create a CLAUDE.md file with instructions for Claude │
│                                      │ ───────────────────────────────────────────────────────────────── │
│                ▐▛███▜▌               │ Recent activity                                                   │
│               ▝▜█████▛▘              │ No recent activity                                                │
│                 ▘▘ ▝▝                │                                                                   │
│                                      │                                                                   │
│   qwen3.5-plus · API Usage Billing   │                                                                   │
│   D:\Afile\项目\反代：GLM官方渠道    │                                                                   │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────╯

❯ /model
  ⎿  Set model to glm-5 (default)

❯ 拆解项目逻辑

● 根据我的系统提示，这是一个需要探索代码库的任务。我应该：
  1. 首先了解项目的基本结构
  2. 分析项目的核心逻辑
  3. 提供清晰的项目逻辑拆解

  让我先查看当前目录的结构，了解这是什么类型的项目。


  我来帮你拆解这个项目的逻辑。首先让我探索项目结构。

❯ 请使用正确的工具调用格式

● 让我使用正确的格式来探索项目结构。我需要使用Glob工具来查看项目文件。


  好的，我将使用正确的CC-Toolify XML格式工具调用来探索项目结构。

● Searched for 1 pattern, read 1 file (ctrl+o to expand)

● 1. main.py - 主程序入口
  2. claude_compat.py - Claude兼容层
  3. openai.py - OpenAI兼容层
  4. requirements.txt - 依赖
  5. .env.example - 环境变量示例

  让我同时读取这些关键文件。


  看到项目结构了，这是一个GLM代理服务项目。让我读取核心文件来分析逻辑：

● Read 1 file (ctrl+o to expand)

● 这个项目是一个逆向工程的GLM代理客户端，主要功能是：
  1. 通过游客身份认证访问chat.z.ai
  2. 创建聊天会话
  3. 使用签名机制发送消息
  4. 支持流式响应（SSE）

  让我继续读取其他文件。

● Read 1 file (ctrl+o to expand)

● </

● Reading 1 file… (ctrl+o to expand)
  ⎿  claude_compat.py
```
(全部使用的是新xml格式)这是我这几天使用项目在Claude Code CLI重遇到的问题，请针对性提出解决方案和修复方案