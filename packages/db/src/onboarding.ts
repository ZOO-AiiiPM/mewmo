export interface OnboardingNoteDefinition {
  slug: string;
  title: string;
  summary: string;
  content: string;
  pinned: boolean;
}

interface OnboardingClient {
  note: {
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
}

export const ONBOARDING_NOTES: readonly OnboardingNoteDefinition[] = [
  {
    slug: "welcome-to-mewmo",
    title: "欢迎来到 mewmo：把信息变成可以继续使用的记忆",
    summary: "mewmo 不只是保存信息，而是让你记录过、读过和思考过的内容在需要时重新出现。",
    pinned: true,
    content: `# 欢迎来到 mewmo

mewmo 是一个云端优先的 AI 信息管理空间。你可以在这里记录想法、保存网页、订阅信息源，再让 AI 和这些真实内容一起工作。

## 保存不是终点

传统工具很擅长把内容收进文件夹，却很容易让它们从此沉底。mewmo 更关心下一步：当你准备写作、做产品、研究一个问题，过去保存的内容能不能重新参与思考。

因此，笔记、剪藏、订阅和 AI 对话不是几套彼此分开的功能。它们共同组成你的个人信息上下文。

## 云端是真相源，打开要足够快

你的内容以云端数据库为权威来源，便于在不同设备之间保持一致。同时，mewmo 会逐步用本地缓存和增量同步减少等待，让你先看到内容，再在后台完成刷新。

## 一只有分寸的 AI 猫

mewmo 希望保留一点陪伴感，但不会用卖萌打断工作。理想状态不是一个无所不知的助手，而是一个理解当前内容、记得重要上下文、也知道什么时候应该安静的伙伴。

��三篇笔记都是真实笔记。你可以直接修改或删除它们，从这里开始建立自己的空间。`,
  },
  {
    slug: "getting-started-with-mewmo",
    title: "开始使用 mewmo：记录、剪藏与整理",
    summary: "从写下第一篇笔记开始，逐步把网页、订阅内容和知识主题收进同一个工作区。",
    pinned: false,
    content: `# 开始使用 mewmo

## 写笔记

点击笔记列表顶部的新建按钮即可开始记录。标题和正文会自动保存，Markdown 标题会生成阅读目录，图片可以粘贴或上传到正文中。

## 保存网页剪藏

在剪藏区域输入网页链接，mewmo 会尝试提取标题与正文。剪藏适合保存以后需要引用、阅读或交给 AI 总结的外部内容。

## 订阅持续更新的信息源

订阅区域用于跟踪文章与媒体 Feed。后台任务会定期刷新条目，你可以阅读、标记状态，并把值得保留的内容收藏进自己的空间。

## 用知识库组织主题

知识库是手动组织内容的区域。你可以按项目或长期主题创建知识库和文件夹，再把笔记、剪藏或订阅条目放进去。新账号不会预先替你创建分类，因为结构应该来自你的真实使用方式。

## 当前边界

部分入口仍在持续开发，例如 PDF、电子书以及更完整的离线体验。界面中标记为待开发的能力不会假装已经可用。`,
  },
  {
    slug: "meet-mewmo-agent",
    title: "认识 mewmo Agent：和你的内容一起思考",
    summary: "AI Agent 会以你当前打开的内容为上下文，帮助总结、追问和连接已经保存的信息。",
    pinned: false,
    content: `# 认识 mewmo Agent

mewmo Agent 的价值不只是回答一个通用问题，而是理解你此刻正在看的内容，并在需要时连接你已经保存的信息。

## 当前内容就是上下文

打开一篇笔记、剪藏或订阅文章时，右侧 AI 区域可以知道当前内容的标题、类型和摘要。你不需要每次重新解释自己正在阅读什么。

## 可以怎么使用

- 总结一篇较长的文章，提取结论与待验证观点。
- 围绕当前笔记继续追问，补充不同角度。
- 整理零散想法，形成更清晰的结构。
- 在后续能力中，查找与当前主题相关的历史内容。

## Agent 不等于自动替你做决定

AI 输出可能不完整，也可能理解错误。重要判断仍需要回到原始内容核对。mewmo 会尽量保存对话和引用上下文，让结论可以追溯，而不是只给一个看起来确定的答案。

## 接下来的方向

未来的 Agent 会更主动地帮助回顾被遗忘的内容、发现长期主题和建立关联。这些属于演进方向；当前产品会明确区分已经可用的能力与仍在开发的能力。`,
  },
] as const;

export async function ensureOnboardingNotes(
  client: OnboardingClient,
  userId: string,
) {
  let existing = 0;
  let created = 0;

  for (const note of ONBOARDING_NOTES) {
    const found = await client.note.findUnique({
      where: { userId_slug: { userId, slug: note.slug } },
    });
    if (found) {
      existing += 1;
      continue;
    }

    await client.note.create({ data: { ...note, userId } });
    created += 1;
  }

  return { existing, created };
}
