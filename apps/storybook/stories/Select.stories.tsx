import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Select } from "@mewmo/ui";

const options = [
  { value: "inbox", label: "收集箱" },
  { value: "product", label: "产品知识库" },
  { value: "archive", label: "长期归档与历史资料" },
];

const meta = {
  title: "基础组件/Select",
  component: Select,
  tags: ["autodocs"],
  args: { id: "destination", label: "移动到", options },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Error: Story = { args: { error: "请选择目标知识库" } };
