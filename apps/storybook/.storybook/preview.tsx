import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/nextjs-vite";

import "../preview.css";

const preview: Preview = {
  decorators: [
    withThemeByClassName({
      themes: { 浅色: "light", 深色: "dark" },
      defaultTheme: "深色",
      parentSelector: "html",
    }),
  ],
  parameters: {
    layout: "centered",
    controls: { expanded: true },
    options: { storySort: { order: ["基础组件"] } },
  },
};

export default preview;
