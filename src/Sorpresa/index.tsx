import {
  Dithering,
  GodRays,
  GrainGradient,
  MeshGradient,
  Warp,
} from "@paper-design/shaders-react";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const { fontFamily: inter } = loadInter("normal", {
  weights: ["500", "800", "900"],
  subsets: ["latin", "latin-ext"],
});
const { fontFamily: mono } = loadMono("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export const W = 1080;
export const H = 1920;
const T = 20; // frames per transition

// Shaders animate on Remotion's clock (speed 0 + frame in ms), so every render is identical.
const useShaderTime = (rate = 1) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (frame / fps) * 1000 * rate;
};
const full: React.CSSProperties = { width: "100%", height: "100%" };

const Center: React.FC<{ children: React.ReactNode; gap?: number }> = ({
  children,
  gap = 40,
}) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      gap,
      padding: 80,
      textAlign: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

/* 1 · Terminal on a dithered sphere */
const Escena1: React.FC = () => {
  const frame = useCurrentFrame();
  const t = useShaderTime(1.4);
  const prompt = "claude, sorpréndeme";
  const chars = Math.floor(interpolate(frame, [12, 50], [0, prompt.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const cursorOn = Math.floor(frame / 8) % 2 === 0;
  const sub = interpolate(frame, [58, 72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <Dithering style={full} colorBack="#050505" colorFront="#c6ff3c" shape="sphere" type="4x4" size={3} scale={0.9} speed={0} frame={t} />
      <Center>
        <div
          style={{
            fontFamily: mono,
            fontSize: 64,
            fontWeight: 700,
            color: "#f4f4f4",
            background: "rgba(5,5,5,0.82)",
            padding: "36px 48px",
            borderRadius: 24,
            border: "2px solid #c6ff3c55",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "#c6ff3c" }}>{"> "}</span>
          {prompt.slice(0, chars)}
          <span style={{ opacity: cursorOn ? 1 : 0, color: "#c6ff3c" }}>▌</span>
        </div>
        <div style={{ fontFamily: mono, fontSize: 36, color: "#c6ff3c", opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
          remotion · paper shaders · código
        </div>
      </Center>
    </AbsoluteFill>
  );
};

/* 2 · NOSOTROS letter by letter on a warp field */
const Escena2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useShaderTime(0.8);
  const word = "NOSOTROS";
  const sub = spring({ frame: frame - 45, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill>
      <Warp style={full} colors={["#1a0533", "#6b21ff", "#ff3d9a", "#ffb547"]} proportion={0.45} softness={1} distortion={0.25} swirl={0.8} swirlIterations={10} shape="checks" shapeScale={0.1} speed={0} frame={t} />
      <Center gap={30}>
        <div style={{ display: "flex", fontFamily: inter, fontWeight: 900, fontSize: 158, color: "white", letterSpacing: -5, textShadow: "0 12px 40px rgba(30,0,60,0.45)" }}>
          {word.split("").map((ch, i) => {
            const s = spring({ frame: frame - 6 - i * 3, fps, config: { damping: 11, stiffness: 140 } });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  transform: `translateY(${(1 - s) * 260}px) rotate(${(1 - s) * (i % 2 ? 25 : -25)}deg) scale(${0.4 + 0.6 * s})`,
                  opacity: Math.min(1, s * 1.5),
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        <div style={{ fontFamily: inter, fontWeight: 500, fontSize: 52, color: "white", opacity: sub, transform: `translateY(${(1 - sub) * 30}px)` }}>
          un vídeo hecho solo con código
        </div>
      </Center>
    </AbsoluteFill>
  );
};

/* 3 · Three claims sliding in over a grainy blob */
const Escena3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useShaderTime(1);
  const lineas = [
    ["fondos", "que respiran"],
    ["letras", "que bailan"],
    ["cortes", "de cine"],
  ];
  return (
    <AbsoluteFill>
      <GrainGradient style={full} colorBack="#3a0d00" colors={["#ff5a1f", "#ffb800", "#ff2e63", "#7a1fff"]} softness={0.7} intensity={0.6} noise={0.3} shape="wave" speed={0} frame={t} />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 110, gap: 50, flexDirection: "column" }}>
        {lineas.map(([a, b], i) => {
          const s = spring({ frame: frame - 8 - i * 14, fps, config: { damping: 14, stiffness: 120 } });
          return (
            <div key={i} style={{ transform: `translateX(${(1 - s) * -900}px)`, fontFamily: inter, lineHeight: 0.95 }}>
              <div style={{ fontSize: 150, fontWeight: 900, color: "white", letterSpacing: -4 }}>{a}</div>
              <div style={{ fontSize: 70, fontWeight: 500, color: "#fff3d6" }}>{b}</div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* 4 · Counters under god rays */
const Contador: React.FC<{ from: number; to: number; start: number; label: string; color: string }> = ({ from, to, start, label, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = interpolate(frame, [start, start + 40], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const s = spring({ frame: frame - start, fps, config: { damping: 200 } });
  return (
    <div style={{ opacity: s, transform: `scale(${0.8 + 0.2 * s})`, fontFamily: inter, textAlign: "center" }}>
      <div style={{ fontSize: 230, fontWeight: 900, color, letterSpacing: -8, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{Math.round(v)}</div>
      <div style={{ fontSize: 54, fontWeight: 500, color: "white" }}>{label}</div>
    </div>
  );
};
const Escena4: React.FC = () => {
  const t = useShaderTime(1);
  return (
    <AbsoluteFill style={{ background: "#06040f" }}>
      <GodRays style={full} colorBack="#06040f" colorBloom="#ffcf6b" colors={["#ffcf6b55", "#ff7ad955", "#7ab8ff55"]} density={0.35} spotty={0.4} midSize={0.25} midIntensity={0.6} intensity={0.7} bloom={0.6} speed={0} frame={t} />
      <Center gap={90}>
        <Contador from={0} to={440} start={6} label="fotogramas" color="#ffcf6b" />
        <Contador from={99} to={0} start={36} label="cámaras" color="#ff7ad9" />
      </Center>
    </AbsoluteFill>
  );
};

/* 5 · The question back to you */
const Escena5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useShaderTime(1.2);
  const big = spring({ frame: frame - 4, fps, config: { damping: 9, stiffness: 110 } });
  const sub = spring({ frame: frame - 30, fps, config: { damping: 200 } });
  const pulse = (frame % 45) / 45;
  return (
    <AbsoluteFill>
      <MeshGradient style={full} colors={["#00e5ff", "#7c3aed", "#ff4ecd", "#c6ff3c"]} distortion={0.9} swirl={0.6} speed={0} frame={t} />
      <Center gap={50}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", width: 820, height: 820, borderRadius: "50%", border: "6px solid white", opacity: 1 - pulse, transform: `scale(${0.7 + pulse * 0.6})` }} />
          <div style={{ fontFamily: inter, fontWeight: 900, fontSize: 170, color: "white", letterSpacing: -6, whiteSpace: "nowrap", transform: `scale(${big})`, textShadow: "0 10px 50px rgba(40,0,90,0.5)" }}>
            ¿Y ahora?
          </div>
        </div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 48, color: "#0b0b14", background: "white", padding: "22px 40px", borderRadius: 999, opacity: sub, transform: `translateY(${(1 - sub) * 40}px)` }}>
          dime qué vídeo quieres
        </div>
      </Center>
    </AbsoluteFill>
  );
};

const DUR = [90, 100, 100, 100, 130];
export const SORPRESA_FRAMES = DUR.reduce((a, b) => a + b, 0) - T * (DUR.length - 1);

export const Sorpresa: React.FC = () => {
  const spr = springTiming({ config: { damping: 200 }, durationInFrames: T });
  const lin = linearTiming({ durationInFrames: T });
  return (
    <AbsoluteFill style={{ background: "black" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={DUR[0]}>
          <Escena1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={iris({ width: W, height: H })} timing={spr} />
        <TransitionSeries.Sequence durationInFrames={DUR[1]}>
          <Escena2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={spr} />
        <TransitionSeries.Sequence durationInFrames={DUR[2]}>
          <Escena3 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-top-left" })} timing={lin} />
        <TransitionSeries.Sequence durationInFrames={DUR[3]}>
          <Escena4 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={clockWipe({ width: W, height: H })} timing={lin} />
        <TransitionSeries.Sequence durationInFrames={DUR[4]}>
          <Escena5 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
