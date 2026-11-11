---
name: paper-shaders
description: Animated shader backgrounds (mesh gradients, grain, halftone, liquid metal, dithering, warp, etc.) from @paper-design/shaders-react, inside Remotion videos. Use when a video needs an animated or textured background.
---

# Paper Shaders in Remotion

`@paper-design/shaders-react` and `@paper-design/shaders` are installed (docs: https://shaders.paper.design, source github.com/paper-design/shaders).

```tsx
import { MeshGradient } from "@paper-design/shaders-react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

export const Fondo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <MeshGradient
        style={{ width: "100%", height: "100%" }}
        colors={["#5100ff", "#00ff80", "#ffcc00", "#ea00ff"]}
        speed={0}
        frame={(frame / fps) * 1000}
      />
    </AbsoluteFill>
  );
};
```

Rules for deterministic renders: set `speed={0}` and drive time with the `frame` prop (milliseconds) from `useCurrentFrame()`, never let the shader animate on its own clock. List the available components and their props from `node_modules/@paper-design/shaders-react` before choosing one.

In a cloud session (no GPU) render with `--gl=swangle --browser-executable=/opt/pw-browsers/chromium`.
