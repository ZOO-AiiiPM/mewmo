import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@mewmo/ui";

const meta = {
  title: "基础组件/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: { children: "默认标签" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>默认</Badge>
      <Badge variant="moss">已同步</Badge>
      <Badge variant="coral">需要处理</Badge>
      <Badge variant="muted">一段更长的中文状态标签</Badge>
    </div>
  ),
};
