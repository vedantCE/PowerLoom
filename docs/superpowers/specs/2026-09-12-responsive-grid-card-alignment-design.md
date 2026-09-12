# Design Specification: Unified Responsive Grid & Card Alignment

**Date**: 2026-09-12
**Status**: Draft for User Approval
**Target System**: PowerLoom Frontend (`frontend/src`)

---

## 1. Overview & Goals

The goal of this refactoring is to make the entire PowerLoom frontend dashboard fully responsive across all device breakpoints (mobile 360px+, tablet 768px+, laptop 1024px+, desktop 1440px+) and ensure pixel-perfect vertical alignment of cards in both the **Operator View** and the **Analyst View**.

Key Requirements:
- Pixel-perfect top and bottom alignment of cards in 2-column desktop layouts.
- Header and control bar clean breakpoint wrapping without awkward multi-line breakage.
- Responsive scaling for SVG flow diagrams and chart containers.
- Consistent padding, borders, typography, and card tokens across all viewports.

---

## 2. Component Design & Changes

### A. Operator View (`frontend/src/components/OperatorView/OperatorView.tsx`)
- **Layout Grid**: Use a 2-column grid layout at `lg:` breakpoint (`grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch`).
- **Left Column (`lg:col-span-2 flex flex-col gap-6 h-full min-h-0`)**:
  - **Advice Card ("What Should I Do Now?")**: Set a matched header height / padding baseline (`p-5 sm:p-6 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white flex items-center justify-between min-h-[120px]`).
  - **Energy Flow Card**: Update container to `flex-1 min-h-0 flex flex-col h-full`. Ensure the component fills remaining column height seamlessly.
- **Right Column (`flex flex-col gap-6 h-full min-h-0`)**:
  - **Savings Card ("Today's Savings")**: Match top card padding and height baseline of the Advice card (`p-5 sm:p-6 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white flex items-center justify-between min-h-[120px]`).
  - **Next 6 Hours Card**: Set `flex-1 min-h-0 flex flex-col h-full`. The 6 hourly indicator sub-cards render in a flexible overflow-y grid (`grid grid-cols-2 gap-3 flex-1`).
- **Result**: The left side cards and right side cards align exactly at top headers and bottom container borders.

### B. Energy Flow Component (`frontend/src/components/EnergyFlow/EnergyFlow.tsx`)
- Update outer card wrapper to accept `className?: string` prop and default to `h-full flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs`.
- Wrap SVG diagram in a `flex-1 min-h-0 flex items-center justify-center w-full` wrapper so the SVG scales proportionally while filling available height.

### C. Header & Top Control Bar (`frontend/src/components/Header/Header.tsx`)
- Refactor top header flexbox structure:
  - **Brand Block**: Sidebar toggle button + Powerloom logo + Title & Tagline (`flex items-center gap-3 shrink-0`).
  - **Controls Wrapper**: Group controls (Village selector, Horizon 24h/48h, Language switcher, Run Optimization button, Status chips) into a responsive flex container (`flex flex-wrap lg:flex-nowrap items-center justify-start sm:justify-end gap-2 sm:gap-3 w-full lg:w-auto`).
- On small screens (`< 1024px`), controls scroll horizontally or wrap gracefully without pushing the main header off-screen.

### D. Main App Layout & Analyst View (`frontend/src/App.tsx`)
- Standardize spacing between cards using unified `gap-6` and `space-y-6`.
- Ensure side panel (`WhatIfPanel` and `RunHistory`) on desktop (`lg:w-80 lg:shrink-0`) maintains sticky position (`lg:sticky lg:top-20 lg:self-start`).
- Wrap chart components in overflow-safe containers (`min-w-0 w-full overflow-x-auto lg:overflow-visible`).

---

## 3. Verification Plan

1. **Desktop View (1440px+)**: Verify Operator View left column and right column top cards and bottom cards align with 0px offset.
2. **Tablet View (768px - 1024px)**: Verify layout cleanly switches to 1-column stacked grid with scrollable header controls.
3. **Mobile View (360px - 480px)**: Verify no horizontal document overflow (`overflow-x-hidden`), clear touch target spacing, and legible SVG text.
