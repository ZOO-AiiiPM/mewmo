import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, Spinner } from "@mewmo/ui";

const meta = {
  title: "基础组件/Button",
  component: Button,
  tags: ["autodocs"],
  args: { children: "保存更改" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">保存更改</Button>
      <Button variant="secondary">稍后处理</Button>
      <Button variant="ghost">取消</Button>
      <Button variant="danger">永久删除</Button>
      <Button disabled>
        <Spinner size="sm" className="text-current" />
        正在保存
      </Button>
    </div>
  ),
};
