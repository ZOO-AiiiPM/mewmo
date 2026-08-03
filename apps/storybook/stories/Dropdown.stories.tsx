import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, Dropdown, DropdownItem } from "@mewmo/ui";

const meta = {
  title: "基础组件/Dropdown",
  component: Dropdown,
  tags: ["autodocs"],
  args: { trigger: <Button>更多操作</Button>, children: null },
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => (
    <div className="h-44 w-72">
      <Dropdown trigger={<Button>更多操作</Button>}>
        <DropdownItem>移动到知识库</DropdownItem>
        <DropdownItem>复制链接</DropdownItem>
        <DropdownItem destructive>删除</DropdownItem>
      </Dropdown>
    </div>
  ),
};
