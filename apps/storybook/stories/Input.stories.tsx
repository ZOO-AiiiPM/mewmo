import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "@mewmo/ui";

const meta = {
  title: "基础组件/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    id: "note-title",
    label: "笔记标题",
    placeholder: "输入标题",
  },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Error: Story = {
  args: { defaultValue: "未完成的标题", error: "标题不能超过长度限制" },
};
export const Disabled: Story = {
  args: { defaultValue: "已归档笔记", disabled: true },
};
