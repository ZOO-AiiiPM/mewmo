# 知识库「导入文件夹到现有库」入口静默失败（command 未注册）

- **症状**：知识库 zone 里「导入文件夹到现有知识库」入口（folder 菜单 / kb 头部）按下去没反应，也不报错——典型的 Tauri 命令静默失败表现。注意区分：根级「导入文件夹（新建库）」走的是 `kb_import_folder`，那个能用；坏的是「导入进**现有**库」的 `kb_import_folder_into`。
- **根因**：`kb_import_folder_into` command 在 `knowledge_base.rs:983` 实现了、前端 `kb.ts:124` 的 `importFolderIntoKb` 也在调它，但 `lib.rs` 的 `invoke_handler` 只注册了 `kb_import_folder`，**漏注册** `kb_import_folder_into`。Tauri 2 安全模型下，未注册命令前端调用静默失败、无任何报错（agent.md「反直觉&坑」反复警告的点）。该命令在 commit `8f62b8d`（"import folder into existing KB"）加入时漏了这一步注册。
- **修法**（一行接线）：`app/src-tauri/src/lib.rs` 的 `invoke_handler` 在 `commands::knowledge_base::kb_import_folder,` 之后加 `commands::knowledge_base::kb_import_folder_into,`。
- **关联文件**：
  - `app/src-tauri/src/lib.rs`（invoke_handler 注册 kb_import_folder_into）
  - 实现侧无需改：`app/src-tauri/src/commands/knowledge_base.rs:983`（命令本就存在且正确）
- **验证**：
  - `cargo check` 通过——`generate_handler!` 宏引用不存在/签名不符的 fn 会编译失败，能编过即证明接线正确
  - 运行时探针（dev 真后端，零污染）：`__TAURI__.invoke('kb_import_folder_into', { dirName: '<真实库>', sourcePath: '/不存在的路径' })` 返回命令自身的早退错误「所选路径不是有效目录」，而非 "command not found"——证明命令已注册且活在运行中的 app 里
- **日期**：2026-06-23

## 踩坑记录

- **核心教训**：新增 Tauri command 后，「注册进 lib.rs invoke_handler」是和「写实现」「写前端 wrapper」同等必要的一步，漏了不会编译报错也不会运行报错，只会让入口静默死掉——最难排查的一类。新加/路过 invoke_handler 时，顺手核对「前端 call 的命令名」与「已注册命令」是否一一对应。
- **快速自检命令**：`grep -o "invoke<[^>]*>('[a-z_]*'" -r src/lib/ ` 列出前端调用的命令名，对照 `grep "commands::" src-tauri/src/lib.rs` 的注册清单，差集就是漏注册的。
- 验证未注册命令是否修好，不必跑完整 UI 流程：直接 `__TAURI__.invoke` 用一个会被命令早退的坏参数探一下，看返回的是命令自身的业务错误（已注册）还是 "command not found"（没注册），零副作用。
