'use client';

import { useState, ReactNode } from 'react';
import { RoomState, RoomMetrics } from '@/lib/roomHealth';
import HouseRoom from './HouseRoom';

interface Room {
  id: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  metrics: RoomMetrics;
  onClick: () => void;
}

interface HouseIllustrationProps {
  rooms: Room[];
}

const styles = `
  .house-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    padding: 28px 32px 24px;
    margin-bottom: 20px;
  }

  .house {
    max-width: 100%;
    margin: 0 auto;
    position: relative;
  }

  .roof-wrap {
    position: relative;
    height: 140px;
    margin-bottom: -1px;
    width: 100%;
  }

  .roof-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .ridge-cap {
    position: absolute;
    top: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 16px;
    height: 16px;
    background: var(--ink);
    border-radius: 2px;
    z-index: 3;
  }

  .walls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 2.4px solid var(--ink);
    border-top: none;
    background: var(--ink);
    gap: 2.4px;
    min-height: 320px;
  }

  .room {
    background: var(--card);
    padding: 28px 18px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.18s ease;
    outline: none;
    border: none;
    font-family: inherit;
    min-height: 160px;
    justify-content: flex-start;
  }

  .room:hover,
  .room:focus-visible {
    transform: scale(1.015);
    z-index: 2;
  }

  .status-badge {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    z-index: 2;
  }

  .room[data-state="thriving"] .status-badge {
    background: #10b981;
  }

  .room[data-state="attention"] .status-badge {
    background: #f59e0b;
  }

  .room[data-state="crumbling"] .status-badge {
    background: #ef4444;
  }

  .room[data-state="attention"] {
    background: linear-gradient(to bottom, rgba(254, 243, 232, 0.4) 0%, rgba(253, 233, 213, 0.35) 100%), var(--card);
    background-blend-mode: lighten;
    transform: perspective(800px) rotateZ(-0.3deg) rotateX(0.1deg);
    box-shadow: inset 0 0 12px rgba(217, 119, 6, 0.08);
  }

  .room[data-state="attention"]::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 300px 200px at center, rgba(217, 119, 6, 0.12), transparent);
    opacity: 1;
    z-index: 0;
    pointer-events: none;
  }

  .room[data-state="attention"]::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(
        0deg,
        rgba(217, 119, 6, 0.06) 0px,
        rgba(217, 119, 6, 0.06) 2px,
        transparent 2px,
        transparent 4px
      );
    opacity: 1;
    z-index: 0;
    pointer-events: none;
  }

  .room[data-state="crumbling"] {
    background: linear-gradient(to bottom, var(--card), var(--card)), var(--crumble-soft);
    background-blend-mode: normal;
    transform: perspective(600px) rotateZ(-1.2deg) rotateX(0.5deg);
    box-shadow: inset 0 0 30px rgba(138, 75, 59, 0.4);
  }

  .room[data-state="crumbling"] .room-content {
    opacity: 0.5;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
    animation: flicker 3.5s infinite;
  }

  .room[data-state="crumbling"]::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--crumble-soft);
    opacity: 0.75;
    z-index: 0;
    pointer-events: none;
  }

  .room[data-state="crumbling"]::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(
        0deg,
        rgba(138, 75, 59, 0.15) 0px,
        rgba(138, 75, 59, 0.15) 2px,
        transparent 2px,
        transparent 4px
      );
    opacity: 1;
    z-index: 0;
    pointer-events: none;
    animation: scanlines 0.15s linear infinite;
  }

  @keyframes flicker {
    0%, 100% { opacity: 0.5; }
    5% { opacity: 0.2; }
    10% { opacity: 0.55; }
    15% { opacity: 0.15; }
    25% { opacity: 0.48; }
    35% { opacity: 0.25; }
    45% { opacity: 0.52; }
    55% { opacity: 0.22; }
    70% { opacity: 0.5; }
    85% { opacity: 0.18; }
    90% { opacity: 0.53; }
  }

  @keyframes scanlines {
    0% { transform: translateY(0); }
    100% { transform: translateY(4px); }
  }

  .crack-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }

  .cobweb {
    position: absolute;
    z-index: 1;
    pointer-events: none;
  }

  .dust-warning {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, rgba(217, 119, 6, 0.2), transparent 70%);
    pointer-events: none;
    z-index: 0;
    animation: dust-warning-pulse 3s ease-in-out infinite;
  }

  @keyframes dust-warning-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.65; }
  }

  .dust-cloud {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 400px 200px at center, rgba(138, 75, 59, 0.4), transparent);
    pointer-events: none;
    z-index: 0;
    animation: dust-flicker 4s ease-in-out infinite;
  }

  @keyframes dust-flicker {
    0%, 100% { opacity: 0.75; }
    10% { opacity: 0.95; }
    25% { opacity: 0.65; }
    40% { opacity: 0.85; }
    60% { opacity: 0.7; }
    75% { opacity: 0.9; }
    90% { opacity: 0.68; }
  }

  .flicker-light {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 20px;
    height: 20px;
    background: radial-gradient(circle, #ffd700 0%, rgba(255, 215, 0, 0.4) 70%, transparent 100%);
    border-radius: 50%;
    z-index: 2;
    animation: light-flicker 4s ease-in-out infinite;
    filter: blur(2px);
  }

  @keyframes light-flicker {
    0%, 100% { opacity: 0.8; }
    5% { opacity: 0.3; }
    10% { opacity: 0.95; }
    15% { opacity: 0.4; }
    25% { opacity: 0.85; }
    35% { opacity: 0.5; }
    45% { opacity: 0.9; }
    55% { opacity: 0.45; }
    70% { opacity: 0.88; }
    85% { opacity: 0.3; }
    90% { opacity: 0.92; }
  }

  .porch {
    height: 22px;
    background: var(--ink);
    border-radius: 0 0 4px 4px;
    margin: 0 -1px;
    margin-top: -1px;
  }
`;

export default function HouseIllustration({ rooms }: HouseIllustrationProps) {
  return (
    <>
      <style>{styles}</style>
      <div className="house-card">
        <div className="house">
          <div className="roof-wrap">
            <svg className="roof-svg" viewBox="0 0 1000 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="0,140 500,0 1000,140" fill="var(--ink)" />
              <polygon points="30,134 500,8 970,134" fill="var(--paper)" />
            </svg>
            <div className="ridge-cap"></div>
          </div>

          <div className="walls">
            {rooms.map((room) => (
              <RoomElement key={room.id} room={room} />
            ))}
          </div>

          <div className="porch"></div>
        </div>
      </div>
    </>
  );
}

function RoomElement({ room }: { room: Room }) {
  const { state } = room.metrics;

  return (
    <button
      className="room"
      data-state={state}
      onClick={room.onClick}
      tabIndex={0}
      aria-label={`${room.title}: ${state}`}
    >
      <div className="status-badge"></div>

      {state === 'attention' && <DustWarning />}
      {state === 'crumbling' && (
        <>
          <div className="dust-cloud"></div>
          <div className="flicker-light"></div>
          <CrackSVG heavy={true} />
          <CobwebSVG />
          <CobwebSVG2 />
          <CobwebSVG3 />
        </>
      )}
      {state === 'attention' && <CrackSVG heavy={false} />}

      <div className="room-content relative z-10 text-center">
        <div className="mb-3 flex justify-center text-4xl">{room.icon}</div>
        <h3 className="text-base font-semibold">{room.title}</h3>
        <p className="mt-1 text-xs opacity-75">{room.subtitle}</p>
      </div>
    </button>
  );
}

function DustWarning() {
  return <div className="dust-warning"></div>;
}

function CrackSVG({ heavy }: { heavy: boolean }) {
  return (
    <svg className="crack-svg" viewBox="0 0 200 190" fill="none">
      <polyline
        points="150,0 142,34 158,52 148,80"
        stroke={heavy ? "#8A4B3B" : "#d97706"}
        strokeWidth={heavy ? "1.8" : "1.6"}
        opacity={heavy ? "0.75" : "0.58"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {heavy && (
        <>
          <polyline points="20,190 30,158 16,140 26,110" stroke="#8A4B3B" strokeWidth="1.8" opacity="0.68" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="80,0 88,45 92,70 80,95 95,130" stroke="#8A4B3B" strokeWidth="1.6" opacity="0.65" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="180,190 170,140 160,110 175,70" stroke="#8A4B3B" strokeWidth="1.5" opacity="0.6" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="50,80 65,85 55,120 70,145" stroke="#8A4B3B" strokeWidth="1.4" opacity="0.52" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {!heavy && <polyline points="40,190 48,148 35,120 50,85" stroke="#d97706" strokeWidth="1.5" opacity="0.48" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function CobwebSVG() {
  return (
    <svg className="cobweb" width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#8A4B3B" strokeWidth="1.1" opacity="0.52" strokeLinecap="round" strokeLinejoin="round" style={{ top: '8px', left: '8px' }}>
      <path d="M0 0 L36 0" />
      <path d="M0 0 L0 36" />
      <path d="M0 0 L22 22" />
      <path d="M0 12 L14 12 L14 0" />
      <path d="M0 24 L22 24 L22 0" />
    </svg>
  );
}

function CobwebSVG2() {
  return (
    <svg className="cobweb" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#8A4B3B" strokeWidth="1" opacity="0.48" strokeLinecap="round" strokeLinejoin="round" style={{ bottom: '12px', right: '12px' }}>
      <circle cx="20" cy="20" r="18" />
      <line x1="20" y1="2" x2="20" y2="38" />
      <line x1="2" y1="20" x2="38" y2="20" />
      <line x1="8" y1="8" x2="32" y2="32" />
      <line x1="32" y1="8" x2="8" y2="32" />
      <circle cx="20" cy="20" r="6" />
    </svg>
  );
}

function CobwebSVG3() {
  return (
    <svg className="cobweb" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#8A4B3B" strokeWidth="1.2" opacity="0.45" strokeLinecap="round" strokeLinejoin="round" style={{ bottom: '8px', left: '20px' }}>
      <path d="M8 2 Q16 8 8 14 Q16 16 8 22 Q16 26 8 30" />
      <path d="M8 2 L20 8" />
      <path d="M8 14 L22 14" />
      <path d="M8 22 L20 26" />
      <circle cx="8" cy="2" r="1.5" fill="#8A4B3B" />
    </svg>
  );
}
