"use client";
/**
 * DigestResolve — a hash that resolves out of noise, left to right.
 * Used the moment two independent lanes agree on one digest: the attestation
 * id literally crystallizes character by character. Reduced motion: instant.
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

const HEXCHARS = "0123456789abcdef";

export function DigestResolve({
  value,
  speed = 18,
  className = "",
  startDelay = 0,
}: {
  value: string;
  /** ms per resolved character */
  speed?: number;
  className?: string;
  startDelay?: number;
}) {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(0);
  const [noise, setNoise] = useState("");

  useEffect(() => {
    if (reduced) {
      setSettled(value.length);
      return;
    }
    setSettled(0);
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setSettled(i);
        if (i >= value.length && interval) clearInterval(interval);
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [value, speed, reduced, startDelay]);

  useEffect(() => {
    if (reduced || settled >= value.length) return;
    const scramble = setInterval(() => {
      setNoise(
        Array.from({ length: value.length - settled }, () =>
          HEXCHARS[Math.floor(Math.random() * 16)],
        ).join(""),
      );
    }, 40);
    return () => clearInterval(scramble);
  }, [settled, value, reduced]);

  if (settled >= value.length) {
    return <span className={className}>{value}</span>;
  }
  return (
    <span className={className} aria-label={value}>
      <span aria-hidden>{value.slice(0, settled)}</span>
      <span aria-hidden className="faint">
        {noise}
      </span>
    </span>
  );
}
