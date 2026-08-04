import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, Dialog } from "@mewmo/ui";

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>打开对话框</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="删除这条笔记？">
        <p className="text-sm text-muted">删除后仍可在回收站中恢复。</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="danger" onClick={() => setOpen(false)}>
            删除
          </Button>
        </div>
      </Dialog>
    </>
  );
}

const meta = {
  title: "基础组件/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  args: { open: false, onClose: () => undefined, children: null },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = { render: () => <DialogDemo /> };
