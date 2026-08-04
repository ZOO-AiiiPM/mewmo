import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Toast, ToastContainer } from "@mewmo/ui";

const meta = {
  title: "基础组件/Toast",
  component: Toast,
  tags: ["autodocs"],
  args: { message: "笔记已保存", type: "success", duration: 60_000 },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};
export const Error: Story = {
  render: () => (
    <ToastContainer>
      <Toast message="同步失败，请稍后重试" type="error" duration={60_000} />
    </ToastContainer>
  ),
};
