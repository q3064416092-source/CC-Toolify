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