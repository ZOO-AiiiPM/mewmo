export interface MockNote {
  id: string;
  slug: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MockClip {
  id: string;
  url: string;
  title: string;
  content: string;
  summary: string;
  favicon: string;
  domain: string;
  tags: string[];
  createdAt: string;
}

export interface MockFeed {
  id: string;
  url: string;
  title: string;
  description: string;
  favicon: string;
  unreadCount: number;
  lastFetchedAt: string;
}

export interface MockFeedEntry {
  id: string;
  feedId: string;
  title: string;
  url: string;
  summary: string;
  author: string;
  publishedAt: string;
  isRead: boolean;
}

export interface MockChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// Deterministic seed-based pseudo-random
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const noteTitles = [
  "Getting Started with mewmo",
  "Weekly Review Template",
  "AI Research Notes",
  "Product Ideas Backlog",
  "Meeting Notes - Team Sync",
  "Book Summary: Thinking Fast and Slow",
  "Project Architecture Decision",
  "Learning Rust in 2026",
  "Personal OKRs Q3",
  "Design System Principles",
  "API Design Patterns",
  "Database Optimization Tips",
  "Frontend Performance Checklist",
  "User Interview Insights",
  "Startup Metrics Dashboard",
];

const tagPool = ["productivity", "knowledge", "ai", "design", "engineering", "reading", "personal", "work", "research", "ideas"];

const domains = ["medium.com", "dev.to", "news.ycombinator.com", "github.com", "arxiv.org", "blog.rust-lang.org", "vercel.com", "tailwindcss.com"];

const feedTitles = [
  "Hacker News Best",
  "Paul Graham Essays",
  "The Verge",
  "TechCrunch AI",
  "Daring Fireball",
  "CSS-Tricks",
  "Stratechery",
  "Benedict Evans",
  "a]6z Future",
  "Changelog",
];

function generateDate(rand: () => number, daysBack: number): string {
  const now = new Date("2026-06-25T12:00:00Z");
  const offset = Math.floor(rand() * daysBack) * 86400000;
  return new Date(now.getTime() - offset).toISOString();
}

function pickTags(rand: () => number): string[] {
  const count = Math.floor(rand() * 3) + 1;
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const tag = tagPool[Math.floor(rand() * tagPool.length)]!;
    if (!result.includes(tag)) result.push(tag);
  }
  return result;
}

export function generateNotes(count = 1000): MockNote[] {
  const rand = seededRandom(42);
  return Array.from({ length: count }, (_, i) => {
    const titleBase = noteTitles[i % noteTitles.length]!;
    const title = i < noteTitles.length ? titleBase : `${titleBase} (${Math.floor(i / noteTitles.length) + 1})`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return {
      id: `note-${String(i).padStart(4, "0")}`,
      slug,
      title,
      content: `# ${title}\n\nThis is the content for note ${i + 1}. It contains markdown with **bold**, *italic*, and \`code\` formatting.\n\n## Key Points\n\n- First important point about this topic\n- Second observation worth noting\n- Third insight for future reference\n\n> A relevant quote that captures the essence of this note.\n\nMore detailed thoughts and analysis would go here in a real note.`,
      summary: `Summary of "${title}" — covering key insights and takeaways from this knowledge entry.`,
      tags: pickTags(rand),
      pinned: rand() < 0.05,
      createdAt: generateDate(rand, 180),
      updatedAt: generateDate(rand, 30),
    };
  });
}

export function generateClips(count = 1000): MockClip[] {
  const rand = seededRandom(123);
  return Array.from({ length: count }, (_, i) => {
    const domain = domains[i % domains.length]!;
    const title = `Clipped Article ${i + 1}: Insights on ${tagPool[i % tagPool.length]}`;
    return {
      id: `clip-${String(i).padStart(4, "0")}`,
      url: `https://${domain}/article-${i + 1}`,
      title,
      content: `<p>This is the clipped content from ${domain}. It discusses important concepts related to ${tagPool[i % tagPool.length]}.</p><p>The article provides practical examples and real-world applications that are worth saving for later reference.</p>`,
      summary: `A curated article from ${domain} about ${tagPool[i % tagPool.length]} with actionable insights.`,
      favicon: `https://${domain}/favicon.ico`,
      domain,
      tags: pickTags(rand),
      createdAt: generateDate(rand, 120),
    };
  });
}

export function generateFeeds(count = 10): MockFeed[] {
  const rand = seededRandom(456);
  return Array.from({ length: count }, (_, i) => ({
    id: `feed-${String(i).padStart(3, "0")}`,
    url: `https://example.com/feed/${i}`,
    title: feedTitles[i % feedTitles.length]!,
    description: `A curated feed about technology, design, and innovation. Updated regularly with fresh perspectives.`,
    favicon: `https://example.com/favicon-${i}.ico`,
    unreadCount: Math.floor(rand() * 25),
    lastFetchedAt: generateDate(rand, 1),
  }));
}

export function generateFeedEntries(feedId: string, count = 1000): MockFeedEntry[] {
  const rand = seededRandom(789 + feedId.charCodeAt(feedId.length - 1));
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${feedId}-${String(i).padStart(4, "0")}`,
    feedId,
    title: `Article ${i + 1}: ${["Understanding", "Exploring", "Building", "Rethinking", "Optimizing"][i % 5]} ${["AI Systems", "Modern CSS", "Distributed Data", "Product Strategy", "Developer Tools"][i % 5]}`,
    url: `https://example.com/articles/${i + 1}`,
    summary: `A deep dive into modern approaches and best practices. This article covers real-world patterns and trade-offs.`,
    author: ["Alice Chen", "Bob Smith", "Carol Davis", "David Kim", "Eva Martinez"][i % 5]!,
    publishedAt: generateDate(rand, 14),
    isRead: rand() < 0.4,
  }));
}

export function generateChatMessages(count = 20): MockChatMessage[] {
  const conversations = [
    { role: "user" as const, content: "What are my most important notes from this week?" },
    { role: "assistant" as const, content: "Based on your recent activity, here are your key notes from this week:\n\n1. **Product Ideas Backlog** — Updated with 3 new feature concepts\n2. **Meeting Notes - Team Sync** — Action items from Thursday's standup\n3. **AI Research Notes** — New paper summaries on RAG architectures\n\nWould you like me to summarize any of these in more detail?" },
    { role: "user" as const, content: "Summarize the AI Research Notes" },
    { role: "assistant" as const, content: "Here's a summary of your AI Research Notes:\n\n**Key Topics Covered:**\n- Retrieval-Augmented Generation (RAG) improvements for 2026\n- Multi-modal embedding approaches\n- Context window optimization strategies\n\n**Main Takeaways:**\n- Hybrid search (vector + keyword) outperforms pure vector search by 15-20%\n- Chunking strategy matters more than embedding model choice\n- Late interaction models show promise for long documents\n\nShall I find related clips or feed articles on these topics?" },
    { role: "user" as const, content: "Yes, find related clips about RAG" },
    { role: "assistant" as const, content: "I found 4 related clips about RAG in your collection:\n\n1. **\"RAG is Dead, Long Live RAG\"** from medium.com — discusses evolution of retrieval patterns\n2. **\"Building Production RAG Systems\"** from dev.to — practical implementation guide\n3. **\"Vector Search Benchmarks 2026\"** from arxiv.org — performance comparisons\n4. **\"Context Window vs RAG Trade-offs\"** from blog.anthropic.com — when to use each approach\n\nWant me to tag these together or create a summary note?" },
  ];

  const rand = seededRandom(999);
  const messages: MockChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    const conv = conversations[i % conversations.length]!;
    messages.push({
      id: `msg-${String(i).padStart(3, "0")}`,
      role: conv.role,
      content: conv.content,
      createdAt: generateDate(rand, 7),
    });
  }
  return messages;
}
