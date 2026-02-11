# Documentation Hub

**Start here:** Comprehensive guide to navigating AudioFlam documentation  
**Last Updated:** February 2026

---

## 📍 What Document Should I Read?

### I'm a new AI agent starting on AudioFlam
1. **Read FIRST:** `/AGENTS.md` (project root, ~300 lines, 5 min read)
   - Gives you the complete picture of what AudioFlam is
   - Quick start commands, tech stack, project structure
   - Critical rules and gotchas to avoid

2. **Read SECOND:** `ARCHITECTURE.md` (this folder, ~400 lines, 10 min read)
   - Visual diagrams of how components interact
   - Data flow from TTS generation to MP4 export
   - Browser compatibility matrix

3. **Keep handy:** `TROUBLESHOOTING.md` (this folder, ~600 lines, reference)
   - Searchable Q&A for common issues
   - Root causes and fixes
   - Debug steps for each category

### I need to implement a feature
1. Read: `/AGENTS.md` → "How to Navigate This Codebase" section
2. Read: `ARCHITECTURE.md` → Relevant pipeline diagram
3. Reference: `/src/` code + existing components
4. Consult: `TROUBLESHOOTING.md` if stuck

### I'm debugging an issue
1. Read: `TROUBLESHOOTING.md` → Find symptom section
2. Read: `ARCHITECTURE.md` → Understand the pipeline
3. Check: `/AGENTS.md` → "Critical Rules & Gotchas"
4. Read: `archive/MOBILE_EXPORT_FIX.md` (if export-related)

### I want to understand a design decision
1. Read: `/AGENTS.md` → "Architecture Decision Log"
2. Deep dive: `archive/` folder (see MANIFEST.md)
   - EXPORT_TECH_PLAN.md (why WebCodecs + Mediabunny)
   - AUDIT_REPORT.md (why audio pipeline was refactored)
   - ROADMAP.md (original implementation plan)

### I'm deploying or managing production
1. Read: `/AGENTS.md` → "Environment Variables" section
2. Read: `/AGENTS.md` → "Critical Rules & Gotchas"
3. Reference: `TROUBLESHOOTING.md` → "Deployment Issues"
4. Monitor: Console logs prefixed `[TTS]`, `[WebCodecs]`, `[VideoExport]`

---

## 📚 Document Overview

### Root-Level Documents

| File | Purpose | Read Time | Audience |
|------|---------|-----------|----------|
| `/AGENTS.md` | **Primary reference** - Everything an AI agent needs | 5 min | Everyone |
| `ROADMAP.md` | Original implementation roadmap (in archive) | 20 min | Interested in feature planning |
| `design.md` | Design vision & UX patterns | 10 min | UI/design work |
| `afro-tts.md` | African TTS research/notes | 5 min | TTS customization |

### Docs Folder Structure

```
docs/
├── README.md                    ← You are here
├── ARCHITECTURE.md              ← System diagrams & data flow
├── TROUBLESHOOTING.md           ← Searchable issue reference
└── archive/
    ├── MANIFEST.md              ← Navigation guide for archive
    ├── EXPORT_TECH_PLAN.md      ← Why WebCodecs + Mediabunny
    ├── MOBILE_EXPORT_FIX.md     ← Black screen diagnostics
    ├── EXPORT_FIX_IMPLEMENTATION.md ← RAF loop history
    ├── AUDIT_REPORT.md          ← Audio pipeline optimization
    └── ROADMAP.md               ← Original 14-step plan
```

---

## 🎯 Quick Lookup Guide

### TTS (Text-to-Speech)
- **How it works:** `/AGENTS.md` → TTS Providers + API Endpoint
- **Architecture diagram:** `ARCHITECTURE.md` → TTS Pipeline
- **Troubleshooting:** `TROUBLESHOOTING.md` → TTS Pipeline Issues
- **Optimization:** `archive/AUDIT_REPORT.md` → Base64 double-conversion fix
- **Files:** `src/routes/api/tts/+server.ts`, `src/routes/+page.svelte`

### Audiogram (Image + Audio + Waveform → MP4)
- **How it works:** `/AGENTS.md` → MP4 Export Architecture
- **Architecture diagram:** `ARCHITECTURE.md` → Audiogram Export Pipeline
- **Troubleshooting:** `TROUBLESHOOTING.md` → Audiogram Export Issues
- **Design reference:** `design.md` + `info/` folder (mockups)
- **Files:** `src/lib/components/AudiogramPage.svelte`, `src/lib/utils/video-export.ts`

### MP4 Export (The Hard Part)
- **Overview:** `/AGENTS.md` → MP4 Export Architecture
- **Detailed flows:** `ARCHITECTURE.md` → WebCodecs Export, MediaRecorder Fallback, Cloud Transcoding
- **Why this design:** `archive/EXPORT_TECH_PLAN.md` (WebCodecs vs alternatives)
- **How it was fixed:** `archive/EXPORT_FIX_IMPLEMENTATION.md` (RAF loop coupling)
- **Debugging:** `archive/MOBILE_EXPORT_FIX.md` (diagnostic logs)
- **Troubleshooting:** `TROUBLESHOOTING.md` → Export Issues
- **Files:** `src/lib/utils/webcodecs-export.ts`, `src/lib/utils/video-export.ts`

### Canvas & Rendering
- **Architecture:** `ARCHITECTURE.md` → Canvas Composition Layers
- **Troubleshooting:** `TROUBLESHOOTING.md` → Canvas & Rendering Issues
- **Files:** `src/lib/components/CompositionCanvas.svelte`, `src/lib/utils/compositor.ts`

### Cloud Transcoding (api.video)
- **How it works:** `ARCHITECTURE.md` → Cloud Transcoding Flow
- **Why api.video:** `archive/EXPORT_TECH_PLAN.md` (cost analysis vs Cloudinary)
- **Troubleshooting:** `TROUBLESHOOTING.md` → Cloud transcode fails
- **Files:** `src/routes/api/transcode/+server.ts`, `src/lib/utils/video-export.ts`

### Mobile Issues
- **Android specific:** `archive/MOBILE_EXPORT_FIX.md` (black screen diagnosis)
- **iOS specific:** `TROUBLESHOOTING.md` → iOS Safari issues
- **Performance:** `TROUBLESHOOTING.md` → Performance Issues → Mobile-Specific
- **Matrix:** `ARCHITECTURE.md` → Browser Compatibility Matrix

### Performance & Optimization
- **Audio pipeline:** `archive/AUDIT_REPORT.md` (base64, MIME type, event cleanup)
- **Export timing:** `TROUBLESHOOTING.md` → Performance Issues
- **Profiling guide:** `TROUBLESHOOTING.md` → Performance Monitoring
- **Bottlenecks:** `ARCHITECTURE.md` → Performance Considerations

---

## 🔍 How to Find Something

### Use this command to search across docs:
```bash
# Find all mentions of "WebCodecs":
grep -r "WebCodecs" docs/ AGENTS.md

# Find all debug steps:
grep -A 5 "Debug steps:" TROUBLESHOOTING.md

# Find all "CRITICAL" notes:
grep -i "CRITICAL" docs/* AGENTS.md
```

### Common Search Terms & Where to Find Them

| Term | Primary Reference | Also See |
|------|------|----------|
| WebCodecs | AGENTS.md + ARCHITECTURE.md | EXPORT_TECH_PLAN.md |
| MediaRecorder | AGENTS.md + ARCHITECTURE.md | MOBILE_EXPORT_FIX.md |
| api.video | AGENTS.md | EXPORT_TECH_PLAN.md |
| H.264 | AGENTS.md + ARCHITECTURE.md | EXPORT_TECH_PLAN.md |
| Base64 | AGENTS.md | AUDIT_REPORT.md |
| Black screen | TROUBLESHOOTING.md | MOBILE_EXPORT_FIX.md |
| Mono audio | AGENTS.md + TROUBLESHOOTING.md | webcodecs-export.ts |
| Host header | AGENTS.md | src/routes/api/tts/+server.ts |
| Waveform | ARCHITECTURE.md | ROADMAP.md |
| Cloud transcode | AGENTS.md + ARCHITECTURE.md | EXPORT_TECH_PLAN.md |

---

## 📖 Recommended Reading Paths

### Path 1: TTS Customization (30 min)
1. `/AGENTS.md` → TTS Providers section (3 min)
2. `/AGENTS.md` → Critical Rules (2 min)
3. `ARCHITECTURE.md` → TTS Pipeline section (5 min)
4. `TROUBLESHOOTING.md` → TTS Issues (10 min)
5. **Code:** `src/routes/api/tts/+server.ts` (5 min)
6. **Code:** `src/routes/+page.svelte` (TTS panel) (5 min)

### Path 2: Export Pipeline Troubleshooting (45 min)
1. `/AGENTS.md` → MP4 Export Architecture (5 min)
2. `ARCHITECTURE.md` → All Export sections (20 min)
3. `TROUBLESHOOTING.md` → Export Issues (15 min)
4. If needed: `archive/MOBILE_EXPORT_FIX.md` (5 min)

### Path 3: New Feature Implementation (1 hour)
1. `/AGENTS.md` → Entire document (5 min)
2. `ARCHITECTURE.md` → Relevant sections (15 min)
3. `ROADMAP.md` → Feature steps (10 min)
4. **Code:** Existing implementation (20 min)
5. `TROUBLESHOOTING.md` → Edge cases (10 min)

### Path 4: Deep Historical Context (2 hours)
1. `/AGENTS.md` → Architecture Decision Log (5 min)
2. `ROADMAP.md` → Overview (10 min)
3. `archive/EXPORT_TECH_PLAN.md` → Full analysis (20 min)
4. `archive/EXPORT_FIX_IMPLEMENTATION.md` → Solution (15 min)
5. `archive/MOBILE_EXPORT_FIX.md` → Diagnostics (15 min)
6. `archive/AUDIT_REPORT.md` → Pipeline fixes (15 min)
7. **Code:** Trace through implementation (40 min)

---

## ⚠️ Important Notes for Agents

### What to Do BEFORE Making Changes
1. **Read `/AGENTS.md`** — Don't skip this, it has critical rules
2. **Check "Critical Rules & Gotchas"** — Avoid breaking patterns
3. **Check "Common Pitfalls for Agents"** — Learn from past mistakes
4. **Check `TROUBLESHOOTING.md`** — Understand impact of changes

### What to Do WHEN Stuck
1. **Search `TROUBLESHOOTING.md`** for your symptom (keyword search)
2. **Look at "Debug steps"** section for your issue
3. **Check `ARCHITECTURE.md`** for the pipeline you're debugging
4. **Check console logs** for prefixes: `[WebCodecs]`, `[VideoExport]`, `[TTS]`
5. **Read relevant archive doc** for historical context

### What to Do WHEN DONE
1. Update `/AGENTS.md` if you changed architecture
2. Update `TROUBLESHOOTING.md` if you fixed a common issue
3. Add decision notes to "Architecture Decision Log"
4. Commit changes to docs alongside code changes

---

## 🚀 Getting Help

### For Questions About...

**Project scope & constraints:**
→ `/AGENTS.md` → Project Overview + Current Phase Focus

**How to navigate the code:**
→ `/AGENTS.md` → How to Navigate This Codebase

**Why we made a choice:**
→ `/AGENTS.md` → Architecture Decision Log
→ `archive/` docs for deep dives

**How something works:**
→ `ARCHITECTURE.md` → Find the pipeline

**What to do when something breaks:**
→ `TROUBLESHOOTING.md` → Find your symptom

**Design & UI:**
→ `design.md` + `info/` folder (mockups)

**Original implementation plan:**
→ `ROADMAP.md` (in archive)

---

## 📝 Document Maintenance

**For agents/maintainers adding to docs:**

When you fix a bug:
- Add entry to `TROUBLESHOOTING.md` so next agent finds it

When you make an architecture decision:
- Add to `/AGENTS.md` → "Architecture Decision Log"
- If major, consider archive doc for full analysis

When docs become outdated:
- Update relevant file immediately
- Note date updated at bottom
- Don't delete old docs, move to archive/old/

When adding new feature:
- Add to `/AGENTS.md` → "Project Structure"
- Add to `ARCHITECTURE.md` → relevant pipeline
- Consider adding to `TROUBLESHOOTING.md` → potential issues

---

**Last Updated:** February 2026  
**Maintained by:** AudioFlam development team
