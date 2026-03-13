# Registry Policies Design: Ecommerce/SaaS Startup Suite

**Date:** 2026-03-13
**Status:** Draft
**Context:** Comprehensive policy registry for an early-stage ecommerce/SaaS hybrid startup (B2B + B2C) with an early brand kit (logo, colors, 1-2 fonts, rough tone guidelines). All deliverables require human review. Multi-channel: website, Instagram, Facebook, LinkedIn, Twitter/X, email, Amazon, Shopify.

---

## Table of Contents

1. [Overview](#overview)
2. [Automated Checks](#automated-checks)
3. [Subjective Criteria](#subjective-criteria)
4. [Policy Compositions](#policy-compositions)
5. [Implementation Notes](#implementation-notes)

---

## Overview

### Inventory

- **11 Policies** across 4 categories: Marketing, Product, Customer, Brand/Design
- **8 New Checks** (automated, code-executed validation)
- **14 New Criteria** (AI-evaluated with expert scoring guidance)
- **8 Enhanced Existing Criteria** (upgraded prompt guidance)

### Policy Map

| Category | Policies |
|---|---|
| **Marketing** | `landing-page`, `email-campaign`, `social-ad`, `social-post` |
| **Product** | `product-description`, `feature-announcement`, `help-article` |
| **Customer** | `onboarding-sequence`, `support-response` |
| **Brand/Design** | `brand-asset`, `social-graphic` |

### Design Principles

- All policies use stages `["objective", "subjective", "human"]`
- Human review is always required
- Pass thresholds are calibrated per policy: higher-stakes content (help articles, support responses, brand assets) has a 7.0 threshold; standard marketing has 6.0-6.5; high-volume organic social has 5.5
- Max revisions range from 2 (time-sensitive or simple) to 3 (complex or high-stakes)
- Check severity is `blocking` for content that should never ship (placeholders, profanity, wrong formats) and `warning` for guideline violations that deserve attention but aren't showstoppers
- Criteria weights range from 1 (baseline concern) to 3 (primary success factor for that policy)

---

## Automated Checks

### Existing Checks (used as-is)

| Check | Description | Supported Types |
|---|---|---|
| `file-size` | Validates max file size | `*/*` |
| `format-check` | Validates content type against whitelist | `*/*` |
| `word-count` | Validates text word count bounds | `text/*` |
| `text-length` | Validates character count | `text/*` |
| `profanity` | Scans for prohibited words | `text/*` |
| `aspect-ratio` | Validates image aspect ratio | `image/*` |
| `image-dimensions` | Validates SVG viewBox dimensions | `image/svg+xml` |

### New Check: `placeholder-detection`

Scans for unreplaced template tokens, dummy content, and development artifacts.

- **Supported types:** `text/*`, `image/svg+xml`
- **Config schema:**
  - `custom_patterns: string[]` — additional regex patterns to flag (default: `[]`)
- **Default patterns:** `\[INSERT.*?\]`, `\[TODO.*?\]`, `\[TBD\]`, `\blorem ipsum\b`, `\bfoo\.com\b`, `\bexample\.(com|org|net)\b`, `\bXXX\b`, `\basdf\b`, `\{\{.*?\}\}` (unresolved template vars), `<your .+? here>`
- **Severity in policies:** always blocking

### New Check: `link-validation`

Detects URLs that are broken, placeholder, or structurally malformed.

- **Supported types:** `text/*`
- **Config schema:**
  - `allow_localhost: boolean` (default: `false`)
  - `blocked_domains: string[]` (default: `["example.com", "test.com", "foo.com", "yoursite.com"]`)
- **Logic:** Extract all URLs via regex. Flag: bare protocols (`http://` alone), placeholder domains, `mailto:` with no address, anchor links to nonexistent IDs, any URL containing `TODO` or `INSERT`
- **Severity in policies:** blocking

### New Check: `heading-structure`

Validates heading hierarchy in markdown or HTML content.

- **Supported types:** `text/*`
- **Config schema:**
  - `require_h1: boolean` (default: `true`)
  - `max_h1_count: number` (default: `1`)
  - `allow_skip_levels: boolean` (default: `false`)
- **Logic:** Parse heading levels. Flag: missing H1, multiple H1s, skipped levels (H1 to H3 with no H2), heading-only content with no body text between
- **Severity in policies:** warning

### New Check: `subject-line-length`

Validates email subject line character count for deliverability and open rates.

- **Supported types:** `text/*`
- **Config schema:**
  - `min_chars: number` (default: `20`)
  - `max_chars: number` (default: `60`)
  - `field: string` (default: `"subject"`)
- **Logic:** Extract subject line from first line or named field. Flag too short or too long (truncated on mobile)
- **Severity in policies:** warning

### New Check: `meta-length`

Validates SEO meta title and description character counts.

- **Supported types:** `text/*`
- **Config schema:**
  - `title_min: number` (default: `50`)
  - `title_max: number` (default: `60`)
  - `desc_min: number` (default: `140`)
  - `desc_max: number` (default: `160`)
- **Logic:** Extract meta title and description from content (named fields or first lines). Flag out-of-range.
- **Severity in policies:** warning

### New Check: `required-sections`

Configurable check that ensures named sections or fields are present in the deliverable.

- **Supported types:** `text/*`
- **Config schema:**
  - `sections: string[]` — list of section headings or field names that must exist
- **Logic:** Case-insensitive search for each required section as a heading or field label. Reports which are missing.
- **Example configs:**
  - Landing page: `["headline", "subheadline", "call to action", "social proof"]`
  - Product description: `["title", "description", "features"]`
- **Severity in policies:** blocking or warning depending on policy

### New Check: `image-text-ratio`

Estimates the percentage of an image occupied by text overlay.

- **Supported types:** `image/*`
- **Config schema:**
  - `max_text_percent: number` (default: `20`)
- **Logic:** For SVG, calculate area of `<text>` elements relative to viewBox. For raster, use pixel analysis heuristic on high-contrast regions. Flag if text area exceeds threshold.
- **Severity in policies:** warning

### New Check: `marketplace-fields`

Validates that required marketplace listing fields are populated and within platform limits.

- **Supported types:** `text/*`
- **Config schema:**
  - `platform: string` (e.g., `"amazon"`, `"shopify"`)
  - `required_fields: string[]`
  - `field_limits: Record<string, { min?: number, max?: number }>`
- **Default Amazon config:** requires `["title", "bullet_points", "description"]`, title max 200 chars, 5 bullet points each max 500 chars, description max 2000 chars
- **Default Shopify config:** requires `["title", "description", "tags"]`, title max 70 chars
- **Severity in policies:** blocking

---

## Subjective Criteria

All criteria use a 1-10 scale. Scoring bands: 1-3 (failing), 4-6 (acceptable with issues), 7-10 (strong to excellent).

### New Criteria

#### `conversion-potential`

- **Applicable to:** `text/*`, `image/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as a senior growth marketer assessing whether this deliverable will drive the intended conversion action. Assess the persuasion architecture: does it follow a logical emotional and rational progression from attention through interest, desire, and action? Look for a single clear primary CTA — not competing asks. Evaluate whether the copy reduces friction (addresses objections, provides social proof, minimizes perceived risk) rather than just asserting value. Check that the ask matches the audience's awareness stage — a cold audience shouldn't be asked to buy, a warm audience shouldn't be re-educated. Score 1-3 if the conversion path is unclear, the CTA is buried or absent, or the copy creates more questions than it answers. Score 4-6 if the structure is sound and CTA is present but the persuasion is generic, friction points are unaddressed, or the ask is mismatched to the funnel stage. Score 7-10 if the piece has a deliberate persuasion arc, a single unmistakable CTA, pre-handles the most likely objections, and makes the next step feel low-risk and high-reward.

#### `value-proposition-clarity`

- **Applicable to:** `text/*`, `image/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as a brand strategist assessing whether the core value proposition lands within the first 5 seconds of engagement. The value prop must answer three questions immediately: what is this, who is it for, and why should they care — in the audience's language, not the company's internal jargon. Assess whether the benefit is stated in terms of the customer's outcome (time saved, revenue gained, problem eliminated) rather than product features or capabilities. Check for differentiation: does this sound like it could only come from this brand, or could any competitor say the same thing? Score 1-3 if the value prop is missing, buried below the fold, stated in jargon, or indistinguishable from a competitor's generic claim. Score 4-6 if the value prop is present and reasonably clear but is feature-led rather than outcome-led, lacks specificity (no numbers, no concrete outcomes), or fails the "could a competitor say this?" test. Score 7-10 if the value prop is immediate, outcome-specific, differentiated, and uses language that mirrors how the target customer actually describes their problem.

#### `customer-empathy`

- **Applicable to:** `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a voice-of-customer researcher assessing whether this content demonstrates genuine understanding of the customer's world. Look for evidence that the writer knows the customer's situation before presenting a solution — does it name the specific pain point, the context in which it occurs, and the emotional weight it carries? Assess the language register: does it match how this audience actually speaks and thinks, or does it talk down, over-explain, or use insider terminology the customer wouldn't use? Check for the "mirror moment" — a point where the reader should think "they get me." Score 1-3 if the content is self-focused (talks about the company/product without grounding in customer reality), uses generic pain points ("struggling with X?"), or reads as tone-deaf to the audience's sophistication level. Score 4-6 if it acknowledges a real customer problem but in surface-level terms, uses reasonable language but nothing that signals deep audience understanding, or jumps to the solution too quickly without sitting in the problem. Score 7-10 if it demonstrates specific, researched knowledge of the customer's situation, uses their vocabulary naturally, earns the right to present a solution by first validating the problem, and calibrates tone to the audience's emotional state.

#### `urgency-authenticity`

- **Applicable to:** `text/*`, `image/*`
- **Default weight:** 1
- **Scale:** 10

**Prompt guidance:**

Evaluate as a consumer psychology specialist assessing whether urgency and scarcity signals are used ethically and effectively. Legitimate urgency is grounded in real constraints: actual inventory limits, genuine deadline-driven events, or time-bound economic conditions. Fabricated urgency — fake countdown timers, "only 3 left" on unlimited digital goods, perpetual "ending soon" sales — erodes trust and in many jurisdictions violates consumer protection law. Assess whether any urgency language is truthful, specific, and proportionate. Score 1-3 if urgency tactics are deceptive (fake scarcity, manufactured deadlines, pressure language designed to override rational decision-making) or if urgency is the primary persuasion mechanism rather than value. Score 4-6 if urgency is present and not dishonest but is vague ("limited time"), disproportionate to the actual stakes, or used as a crutch for otherwise weak copy. Score 7-10 if urgency is either absent (not every piece needs it) or grounded in specific, verifiable constraints, used sparingly, and layered on top of a strong value argument rather than substituting for one. Note: a score of 7+ is achievable with zero urgency language — the absence of manufactured pressure is itself a quality signal.

#### `seo-effectiveness`

- **Applicable to:** `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a senior SEO strategist assessing whether this content is engineered to capture search intent, not just sprinkled with keywords. Start with intent alignment: does the content's structure and depth match what a searcher with this query actually wants? A "how to" query demands a tutorial, not a product pitch. A comparison query demands honest evaluation, not a sales page. Assess keyword integration: primary terms should appear in the title, H1, first 100 words, and naturally throughout — but never at the expense of readability. Check for snippet-readiness: does the content contain a concise, direct answer to the implied question within the first 200 words that could be extracted as a featured snippet? Evaluate internal linking opportunity and whether the content builds topical authority. Score 1-3 if there is no discernible keyword strategy, the content doesn't match likely search intent, or keywords are stuffed unnaturally. Score 4-6 if there is a plausible target keyword present in key positions but intent alignment is imperfect, the content lacks structural SEO elements (no subheadings, no snippet-ready answer, thin depth), or keyword usage feels mechanical. Score 7-10 if the content is clearly engineered for a specific search intent, keywords are integrated naturally, the structure supports featured snippet extraction, heading hierarchy maps to related search queries, and the depth of coverage would satisfy a searcher without needing to click back and try another result.

#### `information-architecture`

- **Applicable to:** `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as an information architect assessing whether this content's structure serves the reader's cognitive flow. Great content architecture means the reader never has to work to figure out where they are, what comes next, or how to find what they need. Assess the hierarchy: does the heading structure create a scannable outline that communicates the full narrative even if the body text is skipped? Evaluate chunking: are ideas broken into digestible units with one concept per paragraph, or do paragraphs try to do too much? Check for progressive disclosure — does the content lead with the most important information and layer in detail for readers who want it, rather than front-loading context and burying the payoff? Assess visual rhythm: is there variation in paragraph length, appropriate use of lists and callouts, and enough whitespace to prevent wall-of-text fatigue? Score 1-3 if the content is a wall of text with no meaningful structure, headings are decorative rather than functional, the reader has to parse the entire piece to find what they need, or the most important information is buried deep. Score 4-6 if structure exists but is formulaic (heading, paragraph, heading, paragraph without logical progression), chunking is inconsistent, the content is scannable but the scan doesn't reveal a coherent narrative, or formatting tools (lists, callouts, bold) are underused or overused. Score 7-10 if the heading structure alone tells a complete story, the content follows a clear progressive disclosure pattern, chunking matches the complexity of each idea, formatting serves comprehension rather than decoration, and a reader at any scroll depth knows exactly where they are in the argument.

#### `email-craft`

- **Applicable to:** `text/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as a senior email marketing strategist who has optimized campaigns across millions of sends. Start with the subject line: does it create a specific, honest curiosity gap or state a clear benefit — not a vague tease, not clickbait, not ALL CAPS gimmicks? It should be front-loaded with the most compelling word in the first 3-4 words (mobile truncation cuts at ~35 characters). Assess preview text: does it complement the subject line by adding new information rather than repeating it, or is it defaulting to "View in browser" boilerplate? Evaluate the body structure: emails are scanned, not read — is the key message in the first 2-3 lines? Is there a single clear thread from open to click, or does the email try to accomplish multiple unrelated goals? Check the CTA: is there one primary action that is visually distinct and above the fold on mobile? Assess mobile-readiness: short paragraphs (2-3 sentences max), no reliance on multi-column layouts, images that aren't load-bearing for comprehension. Score 1-3 if the subject line is generic or deceptive, the email has no clear single purpose, the CTA is buried or competing with other asks, or the content assumes desktop reading with long paragraphs and complex layouts. Score 4-6 if the subject line is honest but unremarkable, the email has a clear purpose but takes too long to get to it, structure is adequate but not optimized for scanning, or there are multiple CTAs diluting focus. Score 7-10 if the subject line earns the open with a specific hook, preview text adds a second reason to open, the body delivers on the subject line's promise within the first line, structure is ruthlessly scannable, a single primary CTA is unmissable, and the entire email reads naturally on a 375px-wide screen.

#### `marketplace-optimization`

- **Applicable to:** `text/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as an ecommerce conversion specialist who optimizes listings across Amazon, Shopify, and direct-to-consumer storefronts. The listing must work in two contexts simultaneously: search ranking (algorithmic) and purchase decision (human). For search: are high-intent keywords placed in the title and first bullet point? Are long-tail variations distributed naturally through the description? Does the title follow platform conventions (Brand + Key Feature + Product Type + Size/Variant)? For purchase decision: do the first 3 bullet points answer the shopper's top 3 questions (what does it do, why this one over alternatives, what do I get)? Is the description structured for comparison shopping — meaning a buyer comparing 3 tabs can find specs, dimensions, compatibility, and use cases without scrolling? Assess social proof integration: are ratings, review counts, or testimonials referenced where appropriate? Check for conversion killers: missing size/compatibility info, ambiguous product scope ("set" without specifying count), or lifestyle claims without practical grounding. Score 1-3 if the listing reads like a brand statement rather than a selling tool, keywords are absent or stuffed unnaturally, critical purchase-decision information (size, compatibility, what's included) is missing, or the format ignores platform conventions. Score 4-6 if keywords are present and purchase information is adequate but bullet points are feature-focused rather than benefit-led, the listing doesn't anticipate comparison shopping behavior, or the description is a single block rather than structured for scanning. Score 7-10 if the title is keyword-optimized and human-readable, bullets lead with benefits and follow with specs, the description is structured for both algorithmic indexing and rapid human scanning, all critical purchase-decision fields are populated, and the listing would outperform a typical competitor listing in a side-by-side comparison.

#### `technical-accuracy`

- **Applicable to:** `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a technical product marketing manager who is accountable for every claim shipping to customers. Every factual assertion — performance numbers, integration capabilities, feature descriptions, pricing, compatibility claims — must be either verifiably true or clearly qualified. Assess specificity: vague claims ("blazing fast," "seamlessly integrates," "enterprise-grade security") without substantiation are worse than no claim at all because they train the audience to distrust the copy. Check for promise inflation: does the content describe what the product actually does, or what the team wishes it did? Look for temporal accuracy: are features described as available that may be in-progress or planned? Evaluate consistency: do claims in this piece conflict with what's stated elsewhere in the product (pricing pages, docs, changelogs)? Score 1-3 if the content contains unsubstantiated performance claims, describes features that don't exist or are materially misrepresented, uses superlatives without evidence ("the fastest," "the only"), or makes comparison claims without citation. Score 4-6 if claims are generally accurate but rely on vague qualifiers ("up to," "as fast as") rather than specific metrics, some features are described more aspirationally than accurately, or technical specificity is inconsistent — precise in some areas, hand-wavy in others. Score 7-10 if every claim is specific and substantiable, performance numbers are qualified with conditions, feature descriptions match actual current capability, comparisons are cited or qualified, and the content would survive a skeptical technical buyer reading it line by line.

#### `response-resolution`

- **Applicable to:** `text/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as a head of customer support who measures team quality on first-contact resolution rate. The primary question is: will the customer need to write back? A response that is polite but doesn't solve the problem is a failure. Assess diagnostic completeness: does the response demonstrate that the agent understood the specific issue, not a generic version of it? Check for solution specificity: does it provide exact steps, not vague guidance ("try clearing your cache" without explaining how)? Evaluate edge case awareness: does the response anticipate the most likely follow-up question and preemptively address it? Look for closure mechanics: does the customer know exactly what will happen next, by when, and what to do if it doesn't work? Assess scope discipline: does the response answer what was asked without over-explaining tangential topics that dilute the core answer? Score 1-3 if the response misidentifies the problem, provides generic template language that doesn't address the specific issue, gives vague instructions the customer can't act on, or leaves the customer unclear on next steps. Score 4-6 if the response correctly identifies the problem and provides a reasonable solution but lacks step-by-step specificity, doesn't anticipate the likely follow-up, requires the customer to infer next steps, or buries the answer under unnecessary preamble. Score 7-10 if the response mirrors the customer's specific issue back to confirm understanding, provides an unambiguous step-by-step resolution, preempts the most likely follow-up question, states explicit next steps and timeline, and includes a fallback path if the primary solution doesn't work.

#### `emotional-intelligence`

- **Applicable to:** `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a customer experience director who trains teams on de-escalation and rapport. The core principle: match the customer's emotional register before attempting to redirect it. A frustrated customer who receives a cheerful response feels dismissed. A confused customer who receives a formal, procedural response feels intimidated. Assess tone calibration: does the response acknowledge the emotional reality of the situation before moving to logistics? Look for validation without patronizing — "I understand this is frustrating" is empty; "Having your checkout fail mid-purchase with guests arriving tomorrow is stressful — let me fix this right now" is specific validation. Check for ownership language: does the response use "I" and "we" with accountability ("I'll make sure this is resolved") or does it deflect to systems and processes ("the system requires")? Evaluate warmth-to-efficiency ratio: onboarding and welcome content should be warm and encouraging; urgent support should be warm but lead with the fix; transactional confirmations should be clear and brief. Score 1-3 if the tone is robotic, defensive, or mismatched to the customer's emotional state — cheerful in response to frustration, formal in response to confusion, or dismissive of a legitimate complaint. Score 4-6 if the tone is appropriate but generic — stock empathy phrases, correct but impersonal, or the emotional acknowledgment feels bolted on rather than integrated into the response. Score 7-10 if the tone precisely matches the situation — specific validation of the customer's experience, natural ownership language, warmth calibrated to the urgency and context, and the customer would feel heard and helped rather than processed.

#### `accessibility-inclusivity`

- **Applicable to:** `text/*`, `image/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as an accessibility specialist assessing whether this content can be effectively consumed by the broadest possible audience. For text content: assess reading level — marketing content should target a 6th-8th grade reading level (Flesch-Kincaid), not because the audience is unsophisticated but because low cognitive load increases comprehension and conversion across all literacy levels. Check for jargon, idioms, and cultural references that assume specific background knowledge. Evaluate sentence complexity: are there run-on sentences or nested clauses that require re-reading? For visual content: verify that all images have descriptive alt text (not "image1.png"), that text-on-image has sufficient contrast (WCAG AA minimum 4.5:1 for body, 3:1 for large text), and that no information is conveyed through color alone. For all content: check for inclusive language — avoid gendered defaults, ableist metaphors ("blind spot," "falling on deaf ears"), and assumptions about the reader's identity, family structure, or physical ability. Score 1-3 if reading level exceeds 10th grade, jargon is unexplained, images lack alt text, contrast is insufficient, or language contains exclusionary patterns. Score 4-6 if reading level is reasonable but inconsistent, alt text exists but is perfunctory ("photo of product"), contrast passes but marginally, or language is neutral but not actively inclusive. Score 7-10 if reading level is consistently accessible, alt text is descriptive and purposeful, contrast exceeds minimums, language is deliberately inclusive, and the content would be equally effective for someone using a screen reader, translating to another language, or reading in a noisy environment.

#### `visual-hierarchy`

- **Applicable to:** `image/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as a senior art director reviewing work for a tier-one client. Visual hierarchy is the invisible architecture that controls the order in which the eye processes information. Assess the entry point: is there a single dominant element that captures attention within the first 500 milliseconds — a bold headline, a striking image, a contrasting color block? Then trace the viewing path: does the composition guide the eye from the entry point through supporting information to the call to action in a deliberate sequence, or does the eye bounce randomly? Evaluate contrast ratios: hierarchy is created through size, color, weight, and whitespace differentials — if everything is the same size and weight, nothing is important. Check typographic hierarchy: there should be no more than 3 levels (headline, subhead, body) clearly differentiated by size and weight. Assess whitespace: is it used strategically to group related elements and separate unrelated ones, or is the layout either cramped or wastefully sparse? Evaluate restraint: every element should earn its place — decorative elements that don't guide the eye or reinforce the message are visual noise. Score 1-3 if there is no clear entry point, the eye has no guided path, typographic levels are undifferentiated, the layout is cluttered with competing elements, or whitespace is an afterthought. Score 4-6 if an entry point exists but the path from attention to action has gaps, typography has some differentiation but not enough contrast between levels, whitespace is present but not strategic, or decorative elements compete with functional ones. Score 7-10 if the composition has an unmistakable focal point, the eye follows a deliberate path from hook through message to CTA, typographic hierarchy is crisp with clear size/weight jumps between levels, whitespace is used to create rhythm and breathing room, and every element on the canvas serves the communication goal.

#### `platform-native-craft`

- **Applicable to:** `image/*`, `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a platform-specific creative strategist who knows that content performing on one channel actively repels audiences on another. The core test: would a daily user of this platform recognize this as native content or flag it as an ad from someone who doesn't understand the platform? For Instagram: assess whether the visual style matches current aesthetic norms (not 2019 norms — platforms evolve), whether text overlays use native-feeling typography rather than corporate fonts, whether the content respects the platform's visual-first hierarchy. For LinkedIn: assess whether the tone is professionally conversational rather than either stiff corporate-speak or inappropriately casual, whether the format uses platform conventions (short paragraphs, line breaks for readability, hooks in the first two lines before the "see more" fold). For Facebook: assess link preview optimization, whether the format matches what performs (carousel vs. single image vs. video for the content type). For Twitter/X: assess character efficiency, hook-in-first-line discipline, thread structure if long-form. For email: assess whether the design feels like a communication rather than a brochure, whether it respects inbox conventions. For marketplace listings: assess whether format follows platform-specific conventions (Amazon A+ content structure, Shopify product page patterns). Score 1-3 if the content is clearly repurposed from another channel without adaptation — wrong dimensions, wrong tone register, wrong format conventions, or visually inconsistent with what performs on the target platform. Score 4-6 if the content technically fits the platform's format requirements but feels generic rather than native — correct dimensions but corporate aesthetic on Instagram, correct character count but LinkedIn-speak on Twitter, or adequate but not optimized for how users actually consume content on that platform. Score 7-10 if the content is indistinguishable from high-performing native content on the target platform — matches current aesthetic and tonal norms, uses platform-specific format conventions, respects how users scroll and engage on that specific channel, and demonstrates awareness of what the platform's algorithm rewards.

### Enhanced Existing Criteria

#### `brand-consistency` (enhanced)

- **Applicable to:** `image/*`, `video/*`, `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a brand manager responsible for maintaining coherent brand identity across every touchpoint. At an early-stage company with a basic brand kit (logo, primary colors, 1-2 fonts, rough tone guidelines), consistency means disciplined use of what exists — not creative reinterpretation. Assess visual consistency: are the brand's defined colors used correctly (primary for emphasis, secondary for supporting elements), or are off-palette colors introduced without justification? Are the designated fonts used consistently, or have substitutes crept in? Is the logo used per any existing guidelines (clear space, minimum size, no unapproved modifications)? Assess tonal consistency: does the voice match the brand's defined personality, and is it consistent across the piece — not formal in the headline and casual in the body, or professional in the opening and slangy in the CTA? For early-stage brands, also assess whether the content is building equity in a recognizable direction rather than fragmenting across conflicting styles. Score 1-3 if brand colors or fonts are absent or wrong, the tone contradicts established voice guidelines, the logo is misused, or the piece could belong to any brand — there is nothing recognizably "ours." Score 4-6 if brand elements are present but applied inconsistently (correct primary color but used in wrong contexts, correct font but inconsistent sizing), tone is generally appropriate but drifts, or the piece is on-brand in isolation but wouldn't sit comfortably next to other recent brand outputs. Score 7-10 if all defined brand elements are applied correctly and consistently, tone is unmistakably the brand's voice throughout, the piece would sit naturally alongside other brand outputs, and where the brand kit is silent the creative choices feel like a natural extension of the established direction rather than a departure.

#### `visual-impact` (enhanced)

- **Applicable to:** `image/*`, `video/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as a creative director judging whether this visual would stop a thumb mid-scroll. In a feed environment, you have roughly 300 milliseconds to earn attention — the visual must work at that speed before any copy is read. Assess stopping power: does the image create immediate visual tension through contrast, unexpected composition, bold color, or human-centric elements (faces, hands, eye contact)? Evaluate memorability: after 10 seconds of exposure, would the viewer remember this image specifically or would it blend into the visual noise of their feed? Check for clarity at small scale: does the visual communicate at thumbnail size (roughly 150x150px) and in a moving feed, or does it depend on being viewed at full resolution? Assess emotional resonance: does the visual trigger a feeling — aspiration, curiosity, recognition, delight — or is it merely informational? Evaluate production quality: are there artifacts, resolution issues, awkward crops, inconsistent lighting, or stock-photo sterility that undermine credibility? Score 1-3 if the visual has no stopping power (would be scrolled past), looks like unmodified stock photography, is illegible at feed-scale, contains quality defects, or triggers no emotional response. Score 4-6 if the visual is competent and clean but unremarkable — correct but not compelling, adequate quality but no distinctive style, or communicates the message but wouldn't earn a second look in a competitive feed. Score 7-10 if the visual creates immediate stopping power through deliberate compositional or chromatic tension, communicates clearly at any scale, triggers a specific emotional response aligned with the content's goal, has polished production quality, and would be remembered after the viewer scrolls past.

#### `tone-alignment` (enhanced)

- **Applicable to:** `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a senior copywriter assessing whether the voice in this piece matches the tone specified in the brief — and sustains it without breaking character. Tone is not just "formal vs. casual" — it's the intersection of formality, energy, warmth, and authority, calibrated to the specific audience and context. First, identify the target tone from the brief. Then assess consistency: a piece that opens with punchy, confident copy and drifts into passive, hedging language in the middle has broken tone. Check for register mismatches: jargon in casual content, slang in professional content, humor in serious contexts, or stiffness in content meant to feel approachable. Evaluate whether the tone serves the content's goal — a help article should feel calm and competent, a product launch should feel energized and confident, a support response should feel warm and capable. Assess sentence rhythm: tone lives in the cadence as much as word choice — short, punchy sentences create energy; longer, flowing sentences create warmth; monotonous sentence length creates boredom regardless of word choice. Score 1-3 if the tone contradicts the brief's direction, shifts erratically within the piece, or is inappropriate for the audience and context (too casual for enterprise, too formal for consumer, too energetic for a complaint response). Score 4-6 if the tone generally matches the brief but is inconsistent — correct in the headline but drifting in the body, appropriate vocabulary but monotonous rhythm, or on-target for the audience but generic rather than distinctive. Score 7-10 if the tone precisely matches the brief's direction, sustains consistently from first word to last, varies sentence rhythm to create energy and flow, matches the formality and warmth the audience expects, and feels like a distinct voice rather than default copy.

#### `readability` (enhanced)

- **Applicable to:** `text/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as an editor at a publication known for making complex ideas accessible. Readability is not about dumbing down — it's about removing every obstacle between the reader and the idea. Assess sentence construction: are sentences front-loaded with the subject and verb, or do they bury the point behind subordinate clauses and qualifiers? Check for nominalizations — verbs turned into nouns ("the implementation of" instead of "implement") — which add syllables without meaning. Evaluate paragraph discipline: does each paragraph advance exactly one idea, with a topic sentence that earns the reader's commitment to the rest? Check for filler: words like "very," "really," "actually," "in order to," "it is important to note that" — each one is a tax on the reader's attention. Assess the ratio of concrete to abstract: strong writing anchors abstract concepts in specific examples, numbers, or scenarios. Evaluate transitions: does each section logically follow the previous one, or does the reader have to bridge gaps in the argument? Score 1-3 if sentences regularly exceed 25 words, paragraphs contain multiple competing ideas, filler words are pervasive, the text relies on abstractions without grounding, or the reader must re-read sentences to extract meaning. Score 4-6 if the text is comprehensible on first read but not effortless — some long sentences that could be split, occasional filler, adequate but uninspired transitions, or an over-reliance on passive voice that creates distance. Score 7-10 if every sentence earns its length, paragraphs are focused and disciplined, filler is absent, abstract claims are grounded in concrete specifics, transitions are seamless, and the text reads with a sense of forward momentum where each sentence makes the reader want to read the next one.

#### `originality` (enhanced)

- **Applicable to:** `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a content strategist who knows that undifferentiated content is invisible content. In a landscape saturated with AI-generated material, originality is the primary differentiator. Assess whether this content offers something a reader cannot get from the first page of Google results on the same topic. Look for: a distinct point of view or argument rather than a balanced summary of everyone else's points; specific proprietary examples, data, or anecdotes rather than generic industry truisms; unexpected angles or frameworks that reframe a familiar topic. Check for AI-generated hallmarks: the "in today's fast-paced world" opening, the "in conclusion" closing, the five-paragraph-essay structure, the list of obvious points that anyone could generate, the absence of any claim the author is uniquely positioned to make. Assess structural originality: does the piece use a fresh format, unexpected narrative device, or compelling hook — or does it follow the most predictable template for its content type? Score 1-3 if the content reads as a generic summary of commonly available information, follows the most obvious template for its type, contains no proprietary insight or distinct perspective, or exhibits multiple hallmarks of undifferentiated AI-generated content. Score 4-6 if the content has a reasonable point of view but doesn't push it far enough to be memorable, includes some specific examples but relies mostly on generic claims, or has moments of originality diluted by sections of template-grade filler. Score 7-10 if the content takes a clear, defensible position, supports it with specific evidence or examples the reader wouldn't find elsewhere, uses structure and framing that feel intentional rather than default, and passes the test: would this piece still be worth reading if five competitors published on the same topic the same day?

#### `call-to-action` (enhanced)

- **Applicable to:** `image/*`, `video/*`, `text/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a conversion rate optimization specialist who has tested thousands of CTA variations. The CTA is where all upstream persuasion either converts or leaks. Assess clarity: can the reader identify the single primary action within 2 seconds of scanning? Multiple CTAs of equal visual weight fracture attention and reduce overall conversion. Evaluate the CTA copy itself: does it describe the value the user gets ("Start my free trial," "Get the report") or just the mechanical action ("Submit," "Click here," "Learn more")? Check for friction signals: does the CTA feel low-risk and reversible ("Try free for 14 days — no credit card") or does it create commitment anxiety ("Buy now," "Sign up" with no context on what happens next)? Assess visual prominence: in visual content, is the CTA the highest-contrast, most visually distinct element after the headline? In text content, is it visually offset (button, bold, standalone line) rather than buried mid-paragraph? Evaluate placement: is the CTA positioned at a moment of peak motivation — after the value case is made — rather than prematurely or as an afterthought? Score 1-3 if the CTA is absent, buried in body text, uses generic "click here" language, competes with multiple equal-weight alternatives, or appears before any value case has been made. Score 4-6 if a primary CTA is identifiable but uses action-only language ("Sign up") rather than value language, has adequate but not strong visual distinction, is positioned reasonably but not at peak motivation, or is accompanied by secondary CTAs that partially dilute focus. Score 7-10 if there is a single unmistakable primary CTA, it uses value-first language that answers "what do I get?", it is the most visually prominent actionable element, friction is actively reduced through risk-reversal language, it is positioned at the moment of peak motivation, and any secondary CTAs are clearly subordinate in visual weight.

#### `ad-compliance` (enhanced)

- **Applicable to:** `image/*`, `video/*`, `text/*`
- **Default weight:** 3
- **Scale:** 10

**Prompt guidance:**

Evaluate as a platform policy compliance officer who has reviewed thousands of ad submissions and knows the difference between what's written in the policy docs and what actually gets flagged in practice. Assess across the major platforms (Meta/Instagram, Google Ads, LinkedIn, Twitter/X) since a single creative is often deployed multi-platform. Check for: misleading claims — before/after implications, income or results guarantees, "free" offers with undisclosed conditions; prohibited content categories — discriminatory targeting language, sensationalized health claims, deceptive UI elements (fake play buttons, simulated notifications, interface elements that mimic platform UI); required disclosures — sponsorship/partnership labels, material connection disclaimers, contest rules references. For images specifically: evaluate Meta's text overlay guidelines (text should not dominate the image), check for sensationalized imagery designed to shock-click, and verify that any person depicted is shown in a respectful, non-exploitative context. For financial or health-adjacent products: apply elevated scrutiny — any claim about outcomes, savings, or results must be qualified. Score 1-3 if the content contains claims that would be flagged as misleading on any major platform, uses prohibited tactics (fake UI elements, shock imagery, discriminatory language), or makes unqualified outcome claims in regulated categories. Score 4-6 if the content is generally compliant but contains gray-area elements — claims that are technically true but could be read as misleading, disclosures that are present but insufficiently prominent, or image text ratios that may trigger automated flags on some platforms. Score 7-10 if the content would pass review on all target platforms without modification, all claims are substantiated and qualified, required disclosures are present and prominent, visual content follows platform-specific guidelines, and the creative demonstrates awareness of the spirit of advertising standards — not just the letter.

#### `platform-fit` (enhanced)

- **Applicable to:** `image/*`, `video/*`
- **Default weight:** 2
- **Scale:** 10

**Prompt guidance:**

Evaluate as a paid media buyer who manages creative across Instagram, Facebook, LinkedIn, and Twitter/X and knows what converts on each. Platform fit goes beyond correct dimensions — it's about whether the creative is built for how people actually consume content on that specific platform. For Instagram feed: assess whether the visual anchors attention in the top third (where the eye lands first in a feed scroll), whether it works as a standalone visual without requiring the caption to make sense, and whether the aesthetic matches the curated, polished standard users expect. For Instagram Stories/Reels: assess vertical-first design, whether key content is in the safe zone (avoiding UI overlay areas), and whether the format leverages motion or interactive elements native to the format. For Facebook: assess whether the creative is optimized for link preview rendering, whether it works within Facebook's older-skewing, text-heavier consumption pattern. For LinkedIn: assess professional appropriateness, whether the creative style matches the platform's more conservative visual norms, and whether it's optimized for desktop viewing (LinkedIn over-indexes on desktop). For Twitter/X: assess whether the creative works with extreme text compression (tweets are short), whether the image communicates independently of the tweet copy, and whether it's optimized for the fast-scroll, high-volume feed environment. Score 1-3 if the creative is obviously repurposed from another platform — wrong aspect ratio, wrong visual style for the platform's norms, or built for a different consumption context (e.g., desktop-designed creative pushed to Stories). Score 4-6 if the creative meets the platform's technical specifications and is generally appropriate but doesn't leverage platform-specific behaviors — correct dimensions but generic visual style, appropriate tone but not optimized for the platform's feed mechanics, or functional but indistinguishable from a cross-posted creative. Score 7-10 if the creative is purpose-built for the target platform — leverages platform-specific format features, matches the visual and tonal norms of high-performing content on that platform, accounts for how users physically interact with the platform (scroll speed, tap behavior, typical session context), and would outperform a generic cross-platform creative in an A/B test.

---

## Policy Compositions

All policies use stages `["objective", "subjective", "human"]` with `human.required: true`.

### Policy 1: `landing-page`

**Description:** Website landing pages, product pages, feature pages
**Max revisions:** 3

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `link-validation` | default | blocking |
| `profanity` | default | blocking |
| `required-sections` | `sections: ["headline", "subheadline", "call to action", "social proof"]` | blocking |
| `heading-structure` | `require_h1: true, max_h1_count: 1` | warning |
| `meta-length` | `title_min: 50, title_max: 60, desc_min: 140, desc_max: 160` | warning |
| `word-count` | `min: 200, max: 2000` | warning |

**Subjective criteria (pass threshold: 6.5):**

| Criterion | Weight | Rationale |
|---|---|---|
| `value-proposition-clarity` | 3 | Landing pages live or die on immediate value clarity |
| `conversion-potential` | 3 | The page exists to convert — this is the primary outcome metric |
| `call-to-action` | 3 | CTA is the conversion mechanism |
| `readability` | 2 | Visitors scan, don't read — content must be effortless |
| `information-architecture` | 2 | Structure drives the scroll-to-convert path |
| `customer-empathy` | 2 | Must demonstrate understanding of visitor's problem |
| `seo-effectiveness` | 2 | Organic discovery is critical for startup unit economics |
| `brand-consistency` | 2 | Every page builds or erodes brand equity |
| `accessibility-inclusivity` | 1 | Baseline inclusivity |

### Policy 2: `email-campaign`

**Description:** Marketing emails, newsletters, promotional drip sequences
**Max revisions:** 3

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `link-validation` | default | blocking |
| `profanity` | default | blocking |
| `subject-line-length` | `min_chars: 20, max_chars: 60` | warning |
| `word-count` | `min: 50, max: 1000` | warning |

**Subjective criteria (pass threshold: 6.0):**

| Criterion | Weight | Rationale |
|---|---|---|
| `email-craft` | 3 | Email-specific structure and deliverability are paramount |
| `conversion-potential` | 3 | Campaigns are conversion instruments |
| `call-to-action` | 2 | Single clear CTA per email |
| `tone-alignment` | 2 | Tone must match brand voice and campaign intent |
| `readability` | 2 | Emails are scanned in seconds |
| `customer-empathy` | 2 | Relevance to the reader's situation determines open-to-click |
| `brand-consistency` | 2 | Every send is a brand impression |
| `accessibility-inclusivity` | 1 | Email clients vary wildly — accessible structure matters |

### Policy 3: `social-ad`

**Description:** Paid ad creatives across Instagram, Facebook, LinkedIn, Twitter/X
**Max revisions:** 3

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `format-check` | `allowed: ["image/png", "image/jpeg", "video/mp4"]` | blocking |
| `file-size` | `max_mb: 30` | blocking |
| `aspect-ratio` | `allowed_ratios: ["1:1", "4:5", "9:16", "1.91:1"]` | blocking |
| `placeholder-detection` | default patterns | blocking |
| `profanity` | default | blocking |
| `text-length` | `max_chars: 2200` | warning |
| `image-text-ratio` | `max_text_percent: 20` | warning |

**Subjective criteria (pass threshold: 6.5):**

| Criterion | Weight | Rationale |
|---|---|---|
| `visual-impact` | 3 | Ads compete in a feed — stopping power is non-negotiable |
| `conversion-potential` | 3 | Paid media must convert to justify spend |
| `ad-compliance` | 3 | Policy violations waste budget and risk account bans |
| `value-proposition-clarity` | 2 | Small format demands instant value communication |
| `call-to-action` | 2 | Every ad dollar wasted without a clear CTA |
| `platform-native-craft` | 2 | Native-feeling ads outperform repurposed ones 2-3x |
| `platform-fit` | 2 | Format-specific optimization per placement |
| `brand-consistency` | 2 | Paid impressions are high-frequency brand touchpoints |

### Policy 4: `social-post`

**Description:** Organic social media content — text posts, carousels, stories (non-paid)
**Max revisions:** 2

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `profanity` | default | blocking |
| `text-length` | `max_chars: 2200` | warning |
| `link-validation` | default | warning |
| `format-check` | `allowed: ["image/png", "image/jpeg", "text/*"]` | blocking |
| `file-size` | `max_mb: 10` | blocking |

**Subjective criteria (pass threshold: 5.5):**

| Criterion | Weight | Rationale |
|---|---|---|
| `platform-native-craft` | 3 | Organic content must feel native or it gets zero engagement |
| `originality` | 2 | Organic social rewards fresh perspectives |
| `tone-alignment` | 2 | Social is where brand voice is most visible |
| `brand-consistency` | 2 | High-frequency touchpoint — inconsistency compounds fast |
| `customer-empathy` | 2 | Community building requires understanding your audience |
| `visual-impact` | 2 | Feed competition is fierce even for organic |
| `call-to-action` | 1 | Not every organic post needs a CTA |
| `accessibility-inclusivity` | 1 | Alt text, captions, inclusive language |

Lower pass threshold (5.5) reflects that organic social is higher-volume, faster-turn content.

### Policy 5: `product-description`

**Description:** Product listings for own site, Amazon, Shopify, and other marketplaces
**Max revisions:** 3

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `profanity` | default | blocking |
| `required-sections` | `sections: ["title", "description", "features"]` | blocking |
| `word-count` | `min: 50, max: 500` | warning |
| `marketplace-fields` | `platform: "shopify", required_fields: ["title", "description", "tags"]` | warning |
| `link-validation` | default | warning |

**Subjective criteria (pass threshold: 6.5):**

| Criterion | Weight | Rationale |
|---|---|---|
| `marketplace-optimization` | 3 | Listings must work for both algorithms and humans |
| `value-proposition-clarity` | 3 | Shopper must instantly understand what they're buying and why |
| `technical-accuracy` | 3 | Inaccurate product claims drive returns and kill reviews |
| `conversion-potential` | 2 | Every listing is a sales page |
| `readability` | 2 | Comparison shoppers scan |
| `seo-effectiveness` | 2 | Product search is high-intent |
| `customer-empathy` | 2 | Address what the buyer actually worries about |
| `brand-consistency` | 1 | Marketplace conventions take precedence over brand style |

### Policy 6: `feature-announcement`

**Description:** Changelog entries, release notes, "what's new" posts, product updates
**Max revisions:** 2

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `profanity` | default | blocking |
| `link-validation` | default | blocking |
| `heading-structure` | `require_h1: true, allow_skip_levels: false` | warning |
| `word-count` | `min: 100, max: 1500` | warning |

**Subjective criteria (pass threshold: 6.5):**

| Criterion | Weight | Rationale |
|---|---|---|
| `technical-accuracy` | 3 | Feature claims must exactly match what shipped |
| `value-proposition-clarity` | 3 | Users need to understand why they should care |
| `readability` | 2 | Mix of technical and non-technical readers |
| `information-architecture` | 2 | Scannable structure for relevance-finding |
| `customer-empathy` | 2 | Frame features in terms of user problems solved |
| `tone-alignment` | 2 | Product updates set the brand's expertise tone |
| `originality` | 1 | Accuracy and clarity matter more here |
| `brand-consistency` | 1 | Voice matters; visual brand less relevant |

### Policy 7: `help-article`

**Description:** Help center documentation, FAQs, knowledge base articles, how-to guides
**Max revisions:** 3

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `link-validation` | default | blocking |
| `profanity` | default | blocking |
| `heading-structure` | `require_h1: true, max_h1_count: 1, allow_skip_levels: false` | warning |
| `word-count` | `min: 200, max: 3000` | warning |
| `required-sections` | `sections: ["title", "solution"]` | warning |

**Subjective criteria (pass threshold: 7.0):**

| Criterion | Weight | Rationale |
|---|---|---|
| `response-resolution` | 3 | The article exists to solve a problem |
| `readability` | 3 | Users arrive frustrated — minimize cognitive load |
| `technical-accuracy` | 3 | Wrong instructions are worse than no article |
| `information-architecture` | 2 | Must support non-linear reading |
| `accessibility-inclusivity` | 2 | Help content has the most diverse audience |
| `seo-effectiveness` | 1 | Often the #1 organic entry point |
| `tone-alignment` | 1 | Calm, competent, efficient |

Higher pass threshold (7.0) because bad help articles generate support tickets — the most expensive content failure mode.

### Policy 8: `onboarding-sequence`

**Description:** Welcome emails, activation sequences, getting-started guides, first-run experiences
**Max revisions:** 3

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `link-validation` | default | blocking |
| `profanity` | default | blocking |
| `subject-line-length` | `min_chars: 20, max_chars: 50` | warning |
| `word-count` | `min: 50, max: 500` | warning |

**Subjective criteria (pass threshold: 6.5):**

| Criterion | Weight | Rationale |
|---|---|---|
| `emotional-intelligence` | 3 | First impressions set the relationship tone |
| `customer-empathy` | 3 | New users are uncertain — meet them where they are |
| `call-to-action` | 2 | Each onboarding step needs exactly one clear next action |
| `email-craft` | 2 | Onboarding emails compete in the same inbox |
| `readability` | 2 | Overwhelm during onboarding is the #1 activation killer |
| `value-proposition-clarity` | 2 | Reinforce why they signed up |
| `information-architecture` | 2 | Progressive disclosure — don't dump everything at once |
| `brand-consistency` | 2 | First extended conversation with the user |

### Policy 9: `support-response`

**Description:** Customer support replies via email, chat, or ticket system
**Max revisions:** 2

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `placeholder-detection` | default patterns | blocking |
| `profanity` | default | blocking |
| `link-validation` | default | warning |
| `word-count` | `min: 20, max: 1000` | warning |

**Subjective criteria (pass threshold: 7.0):**

| Criterion | Weight | Rationale |
|---|---|---|
| `response-resolution` | 3 | First-contact resolution is the north star |
| `emotional-intelligence` | 3 | Tone-deaf support creates churn |
| `technical-accuracy` | 2 | Wrong answers waste time and erode trust |
| `readability` | 2 | Support readers are already frustrated |
| `customer-empathy` | 2 | Customer must feel heard before they'll accept a solution |
| `tone-alignment` | 2 | Must match severity of the issue |
| `accessibility-inclusivity` | 1 | Clear language, no jargon assumptions |

Higher pass threshold (7.0) and only 2 max revisions — support is time-sensitive.

### Policy 10: `brand-asset`

**Description:** Logos, banners, icons, design system elements, brand collateral
**Max revisions:** 2

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `format-check` | `allowed: ["image/png", "image/svg+xml", "image/jpeg", "application/pdf"]` | blocking |
| `file-size` | `max_mb: 50` | blocking |
| `image-dimensions` | `min_width: 100, min_height: 100` | warning |
| `aspect-ratio` | `allowed_ratios: ["1:1", "16:9", "4:3", "2:1"]` | warning |

**Subjective criteria (pass threshold: 7.0):**

| Criterion | Weight | Rationale |
|---|---|---|
| `brand-consistency` | 3 | Brand assets ARE the brand |
| `visual-hierarchy` | 3 | Design fundamentals must be flawless |
| `visual-impact` | 2 | Must be distinctive and memorable |
| `accessibility-inclusivity` | 2 | Contrast, legibility at small sizes |

High threshold (7.0), fewer criteria but heavily weighted — quality over breadth.

### Policy 11: `social-graphic`

**Description:** Organic social images, story graphics, cover photos, event banners
**Max revisions:** 2

**Objective checks:**

| Check | Config | Severity |
|---|---|---|
| `format-check` | `allowed: ["image/png", "image/jpeg", "image/svg+xml"]` | blocking |
| `file-size` | `max_mb: 10` | blocking |
| `aspect-ratio` | `allowed_ratios: ["1:1", "4:5", "9:16", "16:9", "1.91:1"]` | blocking |
| `image-text-ratio` | `max_text_percent: 20` | warning |
| `placeholder-detection` | default patterns | blocking |

**Subjective criteria (pass threshold: 6.5):**

| Criterion | Weight | Rationale |
|---|---|---|
| `visual-impact` | 3 | Feed stopping power determines engagement |
| `visual-hierarchy` | 2 | Clear focal point and reading order |
| `platform-native-craft` | 2 | Must feel native to the target platform |
| `brand-consistency` | 2 | High-frequency visual touchpoint |
| `platform-fit` | 2 | Optimized for specific placement |
| `call-to-action` | 1 | Some graphics are engagement-driven, not CTA-driven |
| `accessibility-inclusivity` | 1 | Text contrast, alt text |

### Summary Matrix

| Policy | Checks | Criteria | Pass Threshold | Max Revisions |
|---|---|---|---|---|
| `landing-page` | 7 | 9 | 6.5 | 3 |
| `email-campaign` | 5 | 8 | 6.0 | 3 |
| `social-ad` | 7 | 8 | 6.5 | 3 |
| `social-post` | 6 | 8 | 5.5 | 2 |
| `product-description` | 6 | 8 | 6.5 | 3 |
| `feature-announcement` | 5 | 8 | 6.5 | 2 |
| `help-article` | 6 | 7 | 7.0 | 3 |
| `onboarding-sequence` | 5 | 8 | 6.5 | 3 |
| `support-response` | 4 | 7 | 7.0 | 2 |
| `brand-asset` | 4 | 4 | 7.0 | 2 |
| `social-graphic` | 5 | 7 | 6.5 | 2 |

---

## Implementation Notes

### File Structure

Each new item follows existing registry conventions:

```
registry/
├── checks/
│   ├── placeholder-detection/
│   │   ├── manifest.json
│   │   └── check.ts
│   ├── link-validation/
│   │   ├── manifest.json
│   │   └── check.ts
│   ├── heading-structure/
│   │   ├── manifest.json
│   │   └── check.ts
│   ├── subject-line-length/
│   │   ├── manifest.json
│   │   └── check.ts
│   ├── meta-length/
│   │   ├── manifest.json
│   │   └── check.ts
│   ├── required-sections/
│   │   ├── manifest.json
│   │   └── check.ts
│   ├── image-text-ratio/
│   │   ├── manifest.json
│   │   └── check.ts
│   └── marketplace-fields/
│       ├── manifest.json
│       └── check.ts
├── criteria/
│   ├── conversion-potential/
│   │   └── manifest.json
│   ├── value-proposition-clarity/
│   │   └── manifest.json
│   ├── customer-empathy/
│   │   └── manifest.json
│   ├── urgency-authenticity/
│   │   └── manifest.json
│   ├── seo-effectiveness/
│   │   └── manifest.json
│   ├── information-architecture/
│   │   └── manifest.json
│   ├── email-craft/
│   │   └── manifest.json
│   ├── marketplace-optimization/
│   │   └── manifest.json
│   ├── technical-accuracy/
│   │   └── manifest.json
│   ├── response-resolution/
│   │   └── manifest.json
│   ├── emotional-intelligence/
│   │   └── manifest.json
│   ├── accessibility-inclusivity/
│   │   └── manifest.json
│   ├── visual-hierarchy/
│   │   └── manifest.json
│   └── platform-native-craft/
│       └── manifest.json
└── policies/
    ├── landing-page/
    │   └── manifest.json
    ├── email-campaign/
    │   └── manifest.json
    ├── social-ad/
    │   └── manifest.json
    ├── social-post/
    │   └── manifest.json
    ├── product-description/
    │   └── manifest.json
    ├── feature-announcement/
    │   └── manifest.json
    ├── help-article/
    │   └── manifest.json
    ├── onboarding-sequence/
    │   └── manifest.json
    ├── support-response/
    │   └── manifest.json
    ├── brand-asset/          (enhance existing)
    │   └── manifest.json
    └── social-graphic/
        └── manifest.json
```

### Implementation Order

**Phase 1: New checks** — implement the 8 new automated checks with tests
**Phase 2: New criteria** — create the 14 new criterion manifests
**Phase 3: Enhanced criteria** — update the 8 existing criterion manifests with new prompt guidance
**Phase 4: New policies** — create the 8 new policy manifests referencing checks and criteria
**Phase 5: Enhanced policies** — update existing `brand-asset` policy, retire old `blog-post` and `instagram-ad` policies (superseded by `help-article` and `social-ad`)

### Dependency Map

Policies depend on their declared checks and criteria. The `requires` field in each policy manifest lists all dependencies. No check or criterion depends on another — they are all leaf nodes.

### Existing Policy Disposition

- `blog-post` — superseded by `help-article` (for documentation) and `landing-page` (for SEO content). Can be retired or kept as a legacy option.
- `brand-asset` — enhanced in place with new criteria and updated prompt guidance.
- `instagram-ad` — superseded by `social-ad` which covers all platforms. Can be retired or kept as a platform-specific variant.
