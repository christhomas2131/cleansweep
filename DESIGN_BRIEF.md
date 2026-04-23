# CleanSweep — Visual Identity Brief
# =====================================
# This is the design system. Every aesthetic decision lives here.
# It's opinionated by design — restraint and craft over flexibility.

## POSITIONING

CleanSweep is a premium personal privacy utility. It handles sensitive content
on a user's machine. The visual identity must communicate three things at once:

1. **Trustworthy.** This app is touching your private files. It needs to feel
   like a Swiss bank vault, not a hobby project.
2. **Effortless.** Premium utilities don't shout. They feel inevitable.
3. **Worth $29.** Every pixel signals craft. No shortcut feels right.

Peers (in the lane we're building toward):
- Cron / Notion Calendar (restrained gorgeousness)
- Things 3 (obsessive weight and spacing)
- 1Password 8 (security without the security-app aesthetic)
- Cleanshot X (Mac utility worth paying for)

NOT peers:
- Linear (too engineer-leaning, too cold)
- Notion (too loud)
- NYT / editorial (too text-heavy)
- Generic "AI app" dark mode templates

## DESIGN PRINCIPLES

### 1. Restraint over decoration

Every element earns its place. If a divider, icon, or animation isn't actively
helping the user, remove it. The screen should feel close to empty until you
need it to do something.

### 2. Typography as the lead

Type does the heavy lifting. Color and shape are secondary. We use ONE typeface
(see below) and use weight, size, and spacing to create hierarchy. No accent
fonts, no display headlines that look different from body. Just incredible
typography.

### 3. Quiet color, loud meaning

The interface is mostly grayscale. Color appears only when it carries meaning:
- Accent: only on the single most important action on each screen
- Warning yellow: only when the user is about to do something irreversible
- Success green: only on completion confirmation
- Danger red: only on destructive action confirmation
Color is a tool, not a decoration.

### 4. Generous whitespace

Things feel premium when they have room to breathe. Padding is doubled from
where you'd default. The eye should never feel crowded.

### 5. Motion that informs, never decorates

Every animation answers "what changed and where did it go." Easing curves are
intentional. No bouncing, no spinning, no playful flourishes. Motion is
functional.

## TYPOGRAPHY

### Single typeface: Inter Display + Inter

We use Inter (Google Fonts). For headers we use Inter Display — same family,
optical sizing tuned for large display use. For body we use Inter.

This is one of the few "internet defaults" that's actually correct. Don't try
to be clever with serifs or display fonts. Inter at the right weights and
sizes will outclass every other choice.

### Type scale (use ONLY these — no in-between sizes)

```
--text-xs:    11px / 1.4   (metadata, captions, labels)
--text-sm:    13px / 1.5   (UI text, secondary copy)
--text-base:  14px / 1.55  (body, primary UI)
--text-md:    16px / 1.5   (emphasized body, large buttons)
--text-lg:    20px / 1.4   (section headers)
--text-xl:    28px / 1.25  (screen titles)
--text-2xl:   40px / 1.15  (hero numbers, big stat displays)
--text-3xl:   56px / 1.05  (welcome screen, marketing-grade)
```

### Weights (use ONLY these)

```
--weight-regular: 400  (body)
--weight-medium:  500  (UI text, button labels)
--weight-semibold:600  (headers, emphasis)
--weight-bold:    700  (rare — only for hero numbers)
```

NO italic. NO 800/900. NO underlines except hover state on links.

### Letter-spacing

```
Default body: 0
UI labels (--text-xs uppercase): 0.06em
Large display (--text-2xl and up): -0.02em (tight)
```

### Numbers — the secret weapon

For ANY numeric display (file counts, percentages, sizes, timers), use:
```css
font-feature-settings: 'tnum' 1, 'cv11' 1;
font-variant-numeric: tabular-nums;
```

Tabular numbers don't shift width when the value changes. This is what makes
counters feel premium instead of jittery. Apply this to every counter in the app.

## COLOR SYSTEM

### Dark mode (the hero)

Not pure black. Pure black looks cheap and OLED-burned. We use slightly tinted
near-black with a hint of cool blue.

```css
/* Backgrounds */
--bg-base:        #0a0a0c;  /* page background */
--bg-surface:     #131316;  /* cards, panels */
--bg-surface-2:   #1a1a1e;  /* hover, raised elements */
--bg-overlay:     rgba(10, 10, 12, 0.85);  /* modal backdrop */

/* Borders */
--border-subtle:  rgba(255, 255, 255, 0.06);
--border-default: rgba(255, 255, 255, 0.10);
--border-strong:  rgba(255, 255, 255, 0.18);

/* Text */
--text-primary:   #f5f5f7;
--text-secondary: #a1a1aa;
--text-tertiary:  #71717a;
--text-quaternary:#52525b;  /* hints, disabled */

/* Accent — only ONE color */
--accent:         #818cf8;  /* indigo */
--accent-hover:   #6366f1;
--accent-subtle:  rgba(129, 140, 248, 0.12);

/* Semantic */
--success:        #4ade80;
--success-subtle: rgba(74, 222, 128, 0.12);
--warning:        #fbbf24;
--warning-subtle: rgba(251, 191, 36, 0.12);
--danger:         #f87171;
--danger-subtle:  rgba(248, 113, 113, 0.12);
```

### Light mode (equal effort)

Not pure white. Off-white with a hint of warmth. Premium light mode never uses
#FFFFFF for backgrounds — it's too clinical.

```css
/* Backgrounds */
--bg-base:        #fafaf9;  /* warm off-white */
--bg-surface:     #ffffff;  /* cards lift to pure white */
--bg-surface-2:   #f4f4f3;  /* hover, raised elements */
--bg-overlay:     rgba(10, 10, 12, 0.40);

/* Borders */
--border-subtle:  rgba(0, 0, 0, 0.06);
--border-default: rgba(0, 0, 0, 0.10);
--border-strong:  rgba(0, 0, 0, 0.18);

/* Text */
--text-primary:   #18181b;
--text-secondary: #52525b;
--text-tertiary:  #71717a;
--text-quaternary:#a1a1aa;

/* Accent (slightly darker for contrast on light bg) */
--accent:         #6366f1;
--accent-hover:   #4f46e5;
--accent-subtle:  rgba(99, 102, 241, 0.10);

/* Semantic (slightly darker for contrast) */
--success:        #16a34a;
--success-subtle: rgba(22, 163, 74, 0.10);
--warning:        #d97706;
--warning-subtle: rgba(217, 119, 6, 0.10);
--danger:         #dc2626;
--danger-subtle:  rgba(220, 38, 38, 0.10);
```

### Color rules (these are LAWS, not suggestions)

1. The accent indigo appears EXACTLY ONCE per screen on a primary action button.
2. Headers, body text, and structure use ONLY grayscale.
3. Icons are grayscale by default. Color only on active/hover state.
4. Backgrounds shift in 2-3% steps, never large jumps.
5. NEVER use gradient backgrounds (cheap). Solid only.
6. NEVER use drop shadows for "depth" — depth comes from background contrast.
   Shadows are reserved for elevated overlays (modals, popovers) and use the
   subtle spec below.

### Shadows (one shadow recipe, used sparingly)

```css
/* Modal / popover only */
--shadow-overlay: 0 1px 2px rgba(0,0,0,0.04),
                  0 8px 24px rgba(0,0,0,0.12),
                  0 24px 48px rgba(0,0,0,0.16);

/* Hover lift on interactive cards (very subtle) */
--shadow-lift:    0 1px 2px rgba(0,0,0,0.04),
                  0 4px 12px rgba(0,0,0,0.08);
```

That's it. Two shadow recipes for the entire app.

## LAYOUT & SPACING

### Spacing scale (use ONLY these — no in-betweens)

```
--space-0:  0
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  24px
--space-6:  32px
--space-7:  48px
--space-8:  64px
--space-9:  96px
--space-10: 128px
```

If you find yourself wanting "20px" — you're wrong. Use 16 or 24.

### Border radius (use ONLY these)

```
--radius-sm: 4px   (badges, tags, small inputs)
--radius-md: 8px   (buttons, cards, panels)
--radius-lg: 12px  (modals, large surfaces)
--radius-full: 9999px (pills, avatars)
```

Nothing else. No 6px. No 10px. No 14px.

### Layout principles

- **Single column primary content.** Everything important lives in a centered
  column max-width 720px. Settings is max 600px. Review grid breaks this rule
  and uses full-width grid. That's the only exception.
- **Generous left/right gutters.** Minimum 48px on either side at desktop sizes.
- **Vertical rhythm via space-5 (24px).** Most sections are spaced 24px apart.
  Some major sections use space-7 (48px).
- **No vertical scrollbars where possible.** If a screen needs to scroll, the
  scrollbar is custom, hairline, and lives 2px off the right edge.

## COMPONENT SPECIFICATIONS

### Buttons

Three button styles. That's it.

**Primary** — appears at most once per screen, on the most important action:
```css
background: var(--accent);
color: white;
padding: 10px 20px;
font: 14px / 1.2 medium;
border-radius: var(--radius-md);
transition: background 120ms ease;
&:hover { background: var(--accent-hover); }
```

**Secondary** — neutral actions, the default:
```css
background: var(--bg-surface-2);
color: var(--text-primary);
border: 1px solid var(--border-default);
padding: 10px 20px;
&:hover { border-color: var(--border-strong); background: var(--bg-surface-2); }
```

**Ghost** — tertiary actions, dismissals:
```css
background: transparent;
color: var(--text-secondary);
padding: 10px 16px;
&:hover { color: var(--text-primary); background: var(--bg-surface); }
```

**Danger** — only on destructive confirmations:
```css
background: transparent;
color: var(--danger);
border: 1px solid var(--danger);
&:hover { background: var(--danger-subtle); }
```

### Inputs

Inputs feel like the Things 3 / Linear text fields:
```css
background: var(--bg-surface);
border: 1px solid var(--border-default);
border-radius: var(--radius-md);
padding: 10px 14px;
font: 14px / 1.5 regular;
color: var(--text-primary);
transition: border-color 120ms ease;
&:focus {
    border-color: var(--accent);
    outline: 2px solid var(--accent-subtle);
    outline-offset: 0;
}
```

### Cards

Cards are flat by default. Hover state is subtle.
```css
background: var(--bg-surface);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-md);
padding: var(--space-5);
transition: all 120ms ease;
&:hover {
    border-color: var(--border-default);
}
```

### Badges

Tiny, uppercase, tabular numerics. Color only when it carries meaning.
```css
font-size: 11px;
font-weight: 600;
letter-spacing: 0.06em;
text-transform: uppercase;
padding: 3px 8px;
border-radius: var(--radius-sm);
font-feature-settings: 'tnum' 1;
```

## MOTION

### Easing

ONE easing curve for nearly everything: `cubic-bezier(0.32, 0.72, 0, 1)`.
This is "ease-out-quint" — feels effortless and confident.

For springs (rare — only on success/celebration moments):
`cubic-bezier(0.4, 0, 0.2, 1.4)` (slight overshoot)

NEVER use linear easing except on progress bars (where it's correct).
NEVER use bounce easing.

### Duration

```
--duration-instant: 80ms   (hover states, button press)
--duration-fast:    160ms  (most transitions)
--duration-medium:  280ms  (screen transitions, modals)
--duration-slow:    480ms  (large layout changes)
```

### Specific motion specs

- **Number counters:** animate value change over 280ms with ease-out
- **Progress bar:** linear interpolation, updates smoothly
- **Screen transitions:** 160ms crossfade only (no slide)
- **Modal entry:** scale from 0.96 + fade in over 280ms
- **Card selection pulse:** scale to 0.98 over 80ms, back to 1 over 80ms
- **Hover:** 120ms color/border transition only, no transform

## SIGNATURE ELEMENTS

These are the small details that make CleanSweep recognizable. Every premium
app has 2-3 signature moves. Ours:

### 1. The Tabular Counter

Every number in the app uses tabular-nums and animates value changes smoothly.
File counts, percentages, scan speeds, sizes. They never jitter, never jump.
This alone makes the app feel 30% more premium.

### 2. The Hairline Divider

When we use a divider, it's 1px var(--border-subtle). Never a thicker line.
Most sections don't need dividers — whitespace is the divider. Use rarely.

### 3. The Soft Focus Ring

Focus state on inputs and buttons uses a 2px outline in --accent-subtle with
0px offset. It's there for accessibility but doesn't shout.

### 4. The Optical Adjustment on Big Numbers

Display sizes (--text-2xl and up) use letter-spacing -0.02em. Inter Display
optical size variant. Numbers feel typographically dense and confident.

### 5. The Status Dot

Small system-state indicators use a 6px solid circle, not a checkbox or icon.
Green for healthy, gray for idle, amber for working. Used in title bar, recent
scans cards, scan history.

## SCREEN-SPECIFIC GUIDELINES

### Welcome / Setup screen

- Centered single column, 720px max width
- Large title at top: "CleanSweep" in --text-3xl, semibold, very tight tracking
- One sentence subtitle in --text-md secondary color
- Generous space-7 gap, then folder picker
- Recent scans cards below, hairline-bordered

### Progress screen

- Massive percentage display: --text-3xl tabular nums, semibold
- Progress bar is 4px tall, --accent fill, --bg-surface-2 track
- Stat grid: 4 cards in 2x2, each with --text-xs uppercase label and --text-xl
  value (tabular nums)
- "Pause" and "Stop" buttons at bottom, ghost style
- During scan, the title bar shows a 6px green status dot + "Scanning"

### Review screen

- Toolbar at top is a single row of secondary buttons + the histogram
- Histogram uses 2px tall bars, hairline subtle
- Grid is the only place we break the centered-column rule — full width
- Cards in grid: 4-6 per row depending on viewport
- Card thumbnail: aspect-ratio 1, border-radius md, subtle border
- Card meta below thumbnail: filename --text-xs muted, badge tabular

### Settings screen

- 600px column max
- Section headers: --text-xs uppercase 0.06em letter-spacing var(--text-tertiary)
- Each setting row: title + description on left, control on right
- Hairline dividers between sections only

## WHAT TO REMOVE FROM CURRENT BUILD

When implementing this brief, audit the current frontend and REMOVE:

- Any drop shadows on cards (depth comes from background contrast)
- Any gradients (we use solid colors only)
- Any border-radius values not in our scale
- Any spacing values not in our scale
- Any color values not in our palette
- Any uppercase text larger than --text-xs
- Any italic text anywhere
- Any animation that doesn't serve a function
- Any "fancy" hover effects (translateY, scale on hover, glow effects)
- Any decorative icons that don't represent an action

## WHAT TO PRESERVE

The current frontend has good bones. Don't rebuild — refine. Keep:

- All current functionality (every feature, every endpoint)
- The screen structure (welcome, progress, review, settings)
- The component logic (modals, toasts, withLoading wrapper)
- All Phase A-E features from PREMIUM_UX.md

This brief is about WHAT THINGS LOOK LIKE, not what they do.

## EXECUTION CHECKLIST

When CC implements this:

1. Replace styles.css entirely with this design system
2. Add light mode toggle in Settings (already exists in some form — make it
   first-class)
3. Audit every component for adherence to the rules above
4. Apply tabular-nums to every numeric display in the app
5. Verify motion specs are applied to all transitions
6. Check that ONLY ONE accent-colored button exists per screen
7. Run verify.py for all 12 phases — must stay 120/120 (this is visual only,
   no functional changes)
8. Take a screenshot of every screen in both modes for review

## FINAL NOTE

The hardest part of premium design is restraint. CC will be tempted to add
flourishes, decorations, and "improvements." Resist this. Every additional
element is a tax on the user's attention. Premium products earn their feel
by removing, not adding.
