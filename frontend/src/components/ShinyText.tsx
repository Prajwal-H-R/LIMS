// ShinyText.tsx

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  motion,
  useMotionValue,
  useAnimationFrame,
  useTransform,
} from "framer-motion";

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: "left";
  delay?: number;
}

const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 2,
  className = "",
  color = "#8b5cf6",
  shineColor = "#ffffff",
  spread = 120,
  pauseOnHover = false,
  direction = "left",
  delay = 0,
}) => {
  const [isPaused, setIsPaused] = useState(false);

  const progress = useMotionValue(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const directionRef = useRef(direction === "left" ? 1 : -1);

  const animationDuration = speed * 1000;
  const delayDuration = delay * 1000;

  useAnimationFrame((time) => {
  if (disabled || isPaused) {
    lastTimeRef.current = null;
    return;
  }
 
  if (lastTimeRef.current === null) {
    lastTimeRef.current = time;
    return;
  }
 
  const deltaTime = time - lastTimeRef.current;
  lastTimeRef.current = time;
 
  elapsedRef.current += deltaTime;
 
  const cycleDuration = animationDuration + delayDuration;
  const cycleTime = elapsedRef.current % cycleDuration;
 
  if (cycleTime < animationDuration) {
    const p = (cycleTime / animationDuration) * 100;
    progress.set(p); // 👈 always left → right
  } else {
    progress.set(0); // reset after delay
  }
});

  useEffect(() => {
    directionRef.current = direction === "left" ? 1 : -1;
    elapsedRef.current = 0;
    progress.set(0);
  }, [direction, progress]);

  const backgroundPosition = useTransform(
    progress,
    (p) => `${150 - p * 2}% center`
  );

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) {
      setIsPaused(true);
    }
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) {
      setIsPaused(false);
    }
  }, [pauseOnHover]);

  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(
      ${spread}deg,
      ${color} 0%,
      ${color} 35%,
      ${shineColor} 50%,
      ${color} 65%,
      ${color} 100%
    )`,
    backgroundSize: "200% auto",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",

    // CSS merged here directly
    fontSize: "2.8rem",
    fontWeight: 800,
    lineHeight: 1.2,
    textAlign: "center",
    letterSpacing: "-0.5px",
    marginBottom: "10px",
    userSelect: "none",
    cursor: "default",
    display: "block",
  };

  return (
    <motion.h1
      className={className}
      style={{
        ...gradientStyle,
        backgroundPosition,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </motion.h1>
  );
};

export default ShinyText;