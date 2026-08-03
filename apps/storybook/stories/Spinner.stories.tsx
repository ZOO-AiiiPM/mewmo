import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Spinner } from "@mewmo/ui";

const meta = {
  title: "基础组件/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  args: { size: "md" },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-5" aria-label="加载中">
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};
