import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, Modal } from "@mewmo/ui";

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>打开弹窗</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="导入到知识库">
        <p className="text-sm text-muted">
          请选择文件后继续，支持较长的中文文件名正常换行显示。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            继续
          </Button>
        </div>
      </Modal>
    </>
  );
}

const meta = {
  title: "基础组件/Modal",
  component: Modal,
  tags: ["autodocs"],
  args: { open: false, onClose: () => undefined, children: null },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = { render: () => <ModalDemo /> };
