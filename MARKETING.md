# CleanSweep — Marketing Strategy

---

## Target Audience

### Primary: IT / Sysadmin (highest willingness to pay)
**Who:** IT admins, MSPs, helpdesk techs who reclaim and re-image devices.
**Scenario:** Employee separation, hardware refresh, returned laptops from contractors. The device goes back into the fleet — but nobody wants to audit 50,000 files manually before imaging.
**Pain:** Finding inappropriate content on company hardware is a liability. Manual review is impractical at scale. Enterprise tools are expensive and send data to the cloud.
**Buy trigger:** One uncomfortable incident with a returned device. Once bitten, $29 is nothing.

### Secondary: Privacy-focused individuals
**Who:** Power users, DataHoarders, people who've accumulated years of files across drives and don't know what's in there.
**Scenario:** Selling a used laptop, cleaning up a shared family PC, auditing a drive inherited from someone else.
**Pain:** Manually going through thousands of files is tedious. Cloud-based tools mean uploading private files to a stranger's server.
**Buy trigger:** Discovered something unexpected in a folder, or about to sell a device and want to be sure.

### Tertiary: Parents
**Who:** Parents who share a computer or external drive with their kids.
**Pain point:** No practical offline tool to audit what's on a shared drive.
**Note:** Harder to reach, more price-sensitive, but word-of-mouth potential is high.

---

## Key Differentiators

1. **100% offline.** Every competitor either is cloud-based or requires an account. CleanSweep never uploads a single file. This is the #1 feature for the privacy-conscious audience and the enterprise/IT buyer.

2. **Scans inside documents and videos.** Not just image files. An NSFW image embedded in a Word doc or a PPTX is invisible to file-name-based tools. CleanSweep extracts and scans them.

3. **One-time price, no subscription.** The market for "pay once, own forever" desktop software is underserved. $29 is an impulse buy for a professional who needs this once.

4. **Review before you delete.** Confidence scores + visual grid means you never accidentally nuke a false positive. Gives the user control.

5. **No setup friction.** No Python, no command line, no config files. Download, install, scan. First-time users are scanning in under 3 minutes.

---

## Launch Sequence

### Week 1 — Soft launch (community posts)
- Post to r/privacy, r/DataHoarder, r/sysadmin (see drafts below)
- Post to r/software
- Submit to Hacker News as "Show HN" (see draft below)
- Cross-post to relevant Discord servers (privacy, self-hosting, Windows power users)

### Week 2 — Product Hunt launch
- Prep assets: icon, tagline, screenshots/GIF, first comment
- Schedule launch for Tuesday–Thursday (highest traffic days)
- Ask early users to upvote and leave a comment
- See Product Hunt checklist below

### Week 3 — Content + outreach
- Reach out to 3–5 privacy-focused YouTube channels / newsletters with a free Pro key
- Write a short blog post: "How we built an offline AI scanner in 12 weeks" (dev audience on HN and DEV.to)
- Submit to Windows app directories and freeware sites (Softpedia, FileHippo, Ninite if applicable)

### Ongoing
- Monitor Reddit mentions of "NSFW scanner", "find explicit files", "clean up old drive"
- Reply helpfully to relevant threads — don't spam, add value first

---

## Reddit Posts

### r/privacy

**Title:** I built an offline NSFW file scanner — AI runs on your machine, nothing uploaded

> Hi r/privacy,
>
> I spent the last few months building a tool I kept wishing existed: a desktop app that scans a folder for sensitive/explicit content using an AI model that runs entirely on your computer.
>
> No account. No uploads. No cloud. The model downloads once (~350MB) and after that the app works fully offline.
>
> **Why I built it:** I had to clean up a laptop before selling it and realized there was no good option. Cloud tools want you to upload everything. Manual review of thousands of files is a nightmare. So I built it.
>
> **What it does:**
> - Scans images, videos (via ffmpeg), and documents (PDFs, Word, PowerPoint — it extracts and scans embedded images)
> - Shows flagged files in a visual grid with confidence scores
> - You review, then delete or quarantine with one click
>
> **Free tier:** up to 500 image files. **Pro ($29, one-time):** unlimited files, video scanning, document scanning.
>
> Happy to answer questions. Feedback welcome.
>
> [Download / more info: link]

---

### r/DataHoarder

**Title:** Built a tool to audit drives for NSFW content — runs offline, scans inside videos and documents

> Fellow hoarders —
>
> If you've ever needed to audit a drive (old laptop sale, cleaning up a shared drive, getting organized) and wished there was something better than "go through 40,000 files manually" — I built that tool.
>
> CleanSweep uses an on-device AI model to scan for explicit/sensitive content. Supports images, videos (extracts frames via ffmpeg), and documents (scans embedded images in PDFs, DOCX, PPTX, XLSX).
>
> Everything runs locally. No uploads. Works on Windows 10/11.
>
> The free tier handles up to 500 images. Pro ($29 one-time) is unlimited + video + docs.
>
> [Link to download]
>
> Would love feedback from people with large collections — especially around performance on big drives.

---

### r/sysadmin

**Title:** Built an offline NSFW scanner for auditing reclaimed devices — no cloud, no account, Windows installer

> Hey r/sysadmin,
>
> We've all been there: employee offboards, IT gets the laptop back, and someone has to figure out if there's anything on it that shouldn't be there before it gets re-imaged or re-issued.
>
> I built a Windows desktop tool that automates this. It uses an on-device AI classifier to scan for explicit/sensitive images — including images embedded inside PDFs, Word docs, and PowerPoints. No uploads, no accounts, no cloud dependency. You install it on the machine, point it at a folder, and it gives you a visual review grid with confidence scores.
>
> **Practical use case:** Run it on a returned device before imaging. Takes a few minutes. Gives you a defensible audit trail (exportable CSV). Far faster than manual review and doesn't involve sending files to a third-party service.
>
> Free tier: 500 images. Pro ($29, one-time license): unlimited, video, documents, export.
>
> [Link]
>
> Happy to answer questions about the tech or use cases.

---

## Hacker News "Show HN"

**Title:** Show HN: CleanSweep – offline AI scanner that finds explicit content in files (Windows)

> I built a Windows desktop app that scans folders for NSFW/explicit content using an on-device AI model. Everything runs locally — no uploads, no account required, works offline after an initial model download.
>
> The motivation: I needed to audit a drive before selling a laptop and couldn't find a tool that didn't require uploading my files to someone's server.
>
> Tech stack: Python (Flask) backend with a HuggingFace NSFW classifier, Electron frontend, packaged as a Windows NSIS installer. The model is ~350MB and runs on CPU or NVIDIA GPU.
>
> It handles images (JPG/PNG/GIF/etc), videos (frame extraction via ffmpeg), and documents (extracts embedded images from PDF, DOCX, PPTX, XLSX).
>
> Free tier: up to 500 image files. Pro ($29 one-time): unlimited files, video/document scanning, CSV export.
>
> [Link to download / landing page]
>
> Happy to discuss the architecture or any aspect of building offline AI-powered desktop apps.

---

## Product Hunt Checklist

- [ ] Create a Maker account and link to your product
- [ ] Tagline: "Find and remove sensitive content from your files — 100% offline AI"
- [ ] Description: 2–3 sentences, lead with the privacy angle
- [ ] Gallery: 4–5 screenshots (hero, scan screen, progress screen, review grid, settings)
- [ ] Demo GIF: record a 30–60 second scan-to-review flow
- [ ] First comment: write a personal note as the maker — why you built it, what problem it solves
- [ ] Topics: Privacy, Security, Windows, Productivity, Artificial Intelligence
- [ ] Schedule for Tuesday, Wednesday, or Thursday
- [ ] Line up 10–15 people to upvote on launch day (friends, colleagues, early users from Reddit)
- [ ] Respond to every comment on launch day

---

## SEO Keywords

**Primary:**
- nsfw file scanner
- find explicit images on computer
- explicit content scanner windows
- offline nsfw detector

**Secondary:**
- scan hard drive for inappropriate content
- remove explicit photos from computer
- ai image scanner privacy
- nsfw image detection software windows
- clean up old hard drive explicit content

**Long-tail:**
- how to scan computer for nsfw images
- find inappropriate files on windows pc
- scan folder for explicit content offline
- audit hard drive before selling laptop

---

## Social One-Liners

**Twitter/X:**
> CleanSweep — AI scans your files for sensitive content. Runs 100% on your machine. No uploads, no accounts, no subscriptions. Windows desktop app. [link]

> Built an offline NSFW file scanner. Points at a folder, checks every image/video/doc, shows you what it found. $29 one-time or free up to 500 files. [link]

**LinkedIn:**
> I built a privacy-first desktop tool for a problem IT teams deal with regularly: auditing reclaimed devices for sensitive content before redeployment. CleanSweep uses an on-device AI model — no cloud dependency, no uploads, no per-seat licensing. Windows installer, one-time purchase. Feedback welcome. [link]
