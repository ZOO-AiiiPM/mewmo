import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Textarea } from "@mewmo/ui";

const meta = {
  title: "基础组件/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    id: "summary",
    label: "摘要",
    defaultValue: "这是一段用于检查长中文内容、自动换行和输入区域高度的摘要。",
  },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Error: Story = { args: { error: "摘要内容不能为空" } };
