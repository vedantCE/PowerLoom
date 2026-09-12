# Unified Responsive Grid & Card Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor frontend dashboard layout to achieve pixel-perfect vertical card alignment in Operator View and complete responsiveness across mobile, tablet, laptop, and desktop viewports.

**Architecture:** Update CSS grid and flexbox definitions in `OperatorView.tsx`, `EnergyFlow.tsx`, `Header.tsx`, `App.tsx`, and `SavingsCards.tsx` to enforce equal-height containers (`items-stretch`, `h-full flex flex-col justify-between`) and clean responsive breakpoints.

**Tech Stack:** React, Tailwind CSS, TypeScript, Vite.

## Global Constraints

- Preserve all existing functionality, interactive hooks, and i18n string keys.
- Do not introduce horizontal scrolling on standard device screens (`overflow-x-hidden`).
- Keep all interactive controls accessible with minimum 44px touch targets on mobile.

---

### Task 1: Refactor Operator View & EnergyFlow Component Layout

**Files:**
- Modify: `frontend/src/components/OperatorView/OperatorView.tsx`
- Modify: `frontend/src/components/EnergyFlow/EnergyFlow.tsx`

**Interfaces:**
- Consumes: `useAppStore`, `useT`, `formatINR`, `formatHourLabel`
- Produces: Equal-height 2-column grid layout for Operator View

- [ ] **Step 1: Update EnergyFlow wrapper to support flex stretching**

Update `frontend/src/components/EnergyFlow/EnergyFlow.tsx` so the root `div` accepts an optional `className` prop, defaulting to `h-full flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs`. Ensure the SVG container is wrapped in a `flex-1 min-h-0 flex items-center justify-center` element.

- [ ] **Step 2: Update OperatorView grid and equal-height column layout**

In `frontend/src/components/OperatorView/OperatorView.tsx`:
Update top-level container to:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-stretch h-full lg:overflow-hidden">
```
Set Advice card and Savings card to have matching padding (`p-5 sm:p-6`) and min-height flex properties so their top rows align identically.
Set Energy Flow and Next 6 Hours cards to have `flex-1 min-h-0 h-full flex flex-col justify-between`.

- [ ] **Step 3: Test and verify Operator View styling**

Run `npm --prefix frontend run build` to verify there are no TypeScript or compilation errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/OperatorView/OperatorView.tsx frontend/src/components/EnergyFlow/EnergyFlow.tsx
git commit -m "style: refactor OperatorView layout for equal height aligned cards"
```

---

### Task 2: Refactor Header Navigation & Control Bar Breakpoints

**Files:**
- Modify: `frontend/src/components/Header/Header.tsx`

**Interfaces:**
- Consumes: `useAppStore`, `useT`
- Produces: Fully responsive top control header bar

- [ ] **Step 1: Update Header container & controls wrapper**

In `frontend/src/components/Header/Header.tsx`:
Refactor header wrapper:
```tsx
<header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-md shadow-xs sm:px-6 sm:py-3.5">
  <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 sm:gap-4">
```
Wrap village selector, horizon buttons, language picker, run optimization button, presentation mode toggle, and backend status badges into clean responsive flex clusters.

- [ ] **Step 2: Verify Header build**

Run `npm --prefix frontend run build` to ensure clean TypeScript compilation.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Header/Header.tsx
git commit -m "style: enhance header control bar responsiveness and wrapping"
```

---

### Task 3: Refactor Analyst Dashboard & SavingsCards Responsiveness

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/SavingsCards/SavingsCards.tsx`

**Interfaces:**
- Consumes: `SavingsCards`, `ExplainBox`, `BaselineComparison`, `EnergyFlow`, `EnergyMixChart`, `SocChart`, `HourTimeline`
- Produces: Responsive card containers and grid layout in Analyst View

- [ ] **Step 1: Update SavingsCards responsive grid**

In `frontend/src/components/SavingsCards/SavingsCards.tsx`, ensure cards are arranged in `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` with uniform padding and font scaling.

- [ ] **Step 2: Update App.tsx section margins and overflow boundaries**

In `frontend/src/App.tsx`, standardize section gap to `space-y-6` and ensure chart wrappers have `min-w-0 w-full overflow-x-auto`.

- [ ] **Step 3: Verify build**

Run `npm --prefix frontend run build` to confirm zero build errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/SavingsCards/SavingsCards.tsx
git commit -m "style: standardize grid layout and card spacing in main dashboard"
```
