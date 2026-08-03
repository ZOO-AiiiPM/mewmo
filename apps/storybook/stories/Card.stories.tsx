import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge, Card } from "@mewmo/ui";

const meta = {
  title: "基础组件/Card",
  component: Card,
  tags: ["autodocs"],
  args: { children: null },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">构建可观测的产品体验</h3>
        <Badge variant="moss">笔记</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        这是一段较长的中文摘要，用来确认卡片在内容增加时仍能自然换行，并保持稳定的内边距。
      </p>
    </Card>
  ),
};
