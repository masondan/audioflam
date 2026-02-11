# 🚀 AudioFlam Documentation - START HERE

**Welcome!** This document is your entry point to AudioFlam documentation.

---

## ⚡ Quick Links

### I'm starting work on AudioFlam
👉 Read **[/AGENTS.md](/AGENTS.md)** (5 minutes)  
Everything you need to know: commands, architecture, critical rules.

### I'm stuck on an issue
👉 Search **[/docs/TROUBLESHOOTING.md](/docs/TROUBLESHOOTING.md)**  
Find your symptom, get root cause + fix + debug steps.

### I want to understand how something works
👉 Read **[/docs/ARCHITECTURE.md](/docs/ARCHITECTURE.md)**  
Visual diagrams of TTS pipeline, export pipeline, canvas composition, etc.

### I need to find a specific document
👉 Use **[/docs/README.md](/docs/README.md)** navigation hub  
Decision tree: "What document should I read?"

### I'm looking for historical context
👉 Check **[/docs/archive/MANIFEST.md](/docs/archive/MANIFEST.md)**  
Index of 5 archived documents explaining why decisions were made.

### I'm reviewing code quality
👉 Read **[/docs/QUALITY_REPORT.md](/docs/QUALITY_REPORT.md)**  
Issues found, priorities, testing gaps, recommendations.

---

## 📚 Documentation Structure

```
AudioFlam/
├── START_HERE.md ──────────────── THIS FILE (you are here)
├── AGENTS.md ────────────────────
├── design.md
├── afro-tts.md
│
└── docs/
    ├── README.md ──────────────── Navigation hub
    ├── ARCHITECTURE.md ────────── Visual diagrams
    ├── TROUBLESHOOTING.md ──────── Problem solver
    ├── QUALITY_REPORT.md ───────── Code review
    │
    └── archive/
        ├── MANIFEST.md ────────── Archive index
        ├── EXPORT_TECH_PLAN.md
        ├── MOBILE_EXPORT_FIX.md
        ├── EXPORT_FIX_IMPLEMENTATION.md
        ├── AUDIT_REPORT.md
        └── ROADMAP.md
```

---

## ✅ What's In Each Document

### `/AGENTS.md` - PRIMARY REFERENCE (472 lines)
**Read this first.** Everything an AI agent needs:
- Quick start & commands
- Project structure
- TTS providers (Azure, YarnGPT)
- MP4 export architecture (WebCodecs, MediaRecorder, cloud transcode)
- Design system (colors, typography, spacing)
- Critical rules & gotchas
- Architecture decision log (WHY we chose what)
- Common pitfalls (lessons learned)
- How to navigate the codebase
- Testing checklist
- Phase 2 plans

**Read time:** 5 minutes  
**Best for:** Everything—overview, reference, navigation

---

### `/docs/README.md` - NAVIGATION HUB (272 lines)
**Use this to find the right document.** Includes:
- Decision tree: "What document should I read?"
- Quick lookup guide (TTS, Audiogram, Export, Canvas, etc.)
- Search terms & where to find them
- Recommended reading paths (4 different types)
- How to find something specific
- Important notes for agents
- Help & resources

**Read time:** 5 minutes  
**Best for:** Figuring out which doc to read

---

### `/docs/ARCHITECTURE.md` - VISUAL REFERENCE (465 lines)
**System diagrams and data flows.** Includes:
- System overview diagram
- TTS pipeline (Text → Audio)
- Audiogram export pipeline (Canvas → MP4 with 3 tiers)
- Canvas composition layers
- WebCodecs export flow (detailed)
- MediaRecorder fallback flow (detailed)
- Cloud transcoding flow (api.video)
- State management (Svelte stores)
- Error handling strategy tree
- Performance considerations
- Browser compatibility matrix

**Read time:** 10 minutes  
**Best for:** Understanding how systems interact

---

### `/docs/TROUBLESHOOTING.md` - PROBLEM SOLVER (739 lines)
**Searchable Q&A for common issues.** Organized by category:
- TTS Pipeline Issues
- Audiogram Export Issues
- Canvas & Rendering Issues
- API & Network Issues
- Performance Issues
- Mobile-Specific Issues
- Development & Testing
- Deployment Issues

Each issue includes:
- Symptoms (how to recognize it)
- Root causes (why it happens)
- Fixes (how to solve it)
- Debug steps (how to investigate)

**Read time:** 10-30 minutes (reference)  
**Best for:** Debugging specific problems

---

### `/docs/QUALITY_REPORT.md` - CODE REVIEW (300+ lines)
**Robustness assessment and improvement recommendations.** Includes:
- 7 issues found & categorized
- Code quality gaps
- Architectural opportunities
- Testing gaps analysis
- Production readiness checklist
- Files to review/improve

**Overall:** Code Quality 8/10 (well-architected, minor issues)

**Read time:** 15 minutes  
**Best for:** Understanding code health and priorities

---

### `/docs/archive/MANIFEST.md` - ARCHIVE INDEX (218 lines)
**Guide to historical documents.** Includes:
- What's in the archive (5 documents)
- Status of each (planning, diagnostics, implementation, audit, roadmap)
- When to read each
- How AI agents should use them
- Cross-references

**Read time:** 5 minutes  
**Best for:** Understanding why past decisions were made

---

### `/docs/archive/` - HISTORICAL DOCUMENTS
**Preserved for context, not daily reference:**
- `EXPORT_TECH_PLAN.md` - Why WebCodecs + Mediabunny chosen over alternatives
- `MOBILE_EXPORT_FIX.md` - Diagnostic approach for black screen issue
- `EXPORT_FIX_IMPLEMENTATION.md` - How decoupled RAF loop fixed mobile export
- `AUDIT_REPORT.md` - Performance audit (base64 decoding, MIME types)
- `ROADMAP.md` - Original 14-step implementation plan

**Read time:** 5-30 min each (deep dives)  
**Best for:** Learning WHY decisions were made

---

## 🎯 Reading Paths

### Path 1: New to AudioFlam? (15 min)
1. This file (2 min)
2. `/AGENTS.md` (5 min)
3. `/docs/ARCHITECTURE.md` → System Overview (3 min)
4. `/docs/README.md` → bookmark for later (3 min)

### Path 2: Debugging Export? (20 min)
1. `/docs/TROUBLESHOOTING.md` → find your symptom (5 min)
2. `/docs/ARCHITECTURE.md` → relevant export section (8 min)
3. Follow debug steps (5-10 min)

### Path 3: Understanding a Decision? (30 min)
1. `/AGENTS.md` → Architecture Decision Log (5 min)
2. `/docs/archive/MANIFEST.md` (5 min)
3. Read relevant archive doc (15-20 min)

### Path 4: Implementing a Feature? (45 min)
1. `/AGENTS.md` (5 min)
2. `/docs/ARCHITECTURE.md` → relevant section (10 min)
3. `/docs/TROUBLESHOOTING.md` → edge cases (10 min)
4. `/docs/QUALITY_REPORT.md` → recommendations (10 min)
5. Code implementation (20-30 min)

---

## 🔍 How to Find Something

**Use `/docs/README.md` Quick Lookup Guide** for:
- TTS questions → see TTS section
- Export questions → see Export section
- Canvas/rendering → see Canvas section
- Mobile issues → see Mobile-specific
- Performance → see Performance
- Deployment → see Deployment

**Use TROUBLESHOOTING for:**
- "Audio doesn't play"
- "Export produces black screen"
- "WebCodecs not detected"
- "Memory issues"
- Any symptom → search by symptom

**Use ARCHITECTURE for:**
- "How does X work?"
- "How does data flow through Y?"
- "What's the complete pipeline?"
- Visual understanding needed

---

## ⚠️ Important for AI Agents

### Before Making Changes
1. **Read `/AGENTS.md`** → "Critical Rules & Gotchas"
2. **Check QUALITY_REPORT.md** → understand code health
3. **Review relevant TROUBLESHOOTING section** → understand pain points

### When Stuck
1. **Search `/docs/TROUBLESHOOTING.md`** for your symptom
2. **Check `/docs/ARCHITECTURE.md`** for the pipeline involved
3. **Read relevant `/docs/archive/` doc** for historical context
4. **Check console logs** for debug prefixes: `[WebCodecs]`, `[VideoExport]`, `[TTS]`

### When Done
1. **Update `/AGENTS.md`** if you changed architecture
2. **Update `/docs/TROUBLESHOOTING.md`** if you fixed a common issue
3. **Add decision note** to "Architecture Decision Log"
4. **Commit with code changes**

---

## 📞 Need Help?

**Question about:** → **Check this document:**
- How AudioFlam works → `/AGENTS.md`
- Why a decision was made → `/AGENTS.md` Decision Log, then `/docs/archive/`
- How to implement X → `/docs/README.md` quick lookup
- Debugging Y issue → `/docs/TROUBLESHOOTING.md`
- System architecture → `/docs/ARCHITECTURE.md`
- Code quality → `/docs/QUALITY_REPORT.md`
- Navigation → `/docs/README.md`

---

## ✨ Pro Tips

1. **Bookmark `/docs/README.md`** as your starting point for any question
2. **Grep for log prefixes** when debugging: `grep "[WebCodecs]"` console output
3. **Read QUALITY_REPORT.md** before implementing new features (know the gaps)
4. **Keep archive docs nearby** when making architecture changes
5. **Update docs when you learn something new** (help next agent!)

---

## 🎉 You're Ready!

You now have comprehensive documentation to:
- ✅ Understand AudioFlam completely
- ✅ Navigate the codebase efficiently
- ✅ Debug issues systematically
- ✅ Make informed architectural decisions
- ✅ Contribute with context and confidence

**Next step:** Open `/AGENTS.md` and read for 5 minutes.

---

**Documentation Status:** ✅ Complete and Current (February 2026)  
**Last Updated:** February 2026
