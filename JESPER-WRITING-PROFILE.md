# Jesper Melin — Writing Profile & Communication DNA

> This file is machine-readable for Brain Core. It encodes Jesper's writing patterns,
> tone variations by context, vocabulary, and email classification logic.

---

## 1. Identity

- **Full name:** Jesper Bengt Tomas Melin
- **Aliases:** Captain J, Jesper / Captain J
- **Email accounts:** jesper.melin89@gmail.com (primary), jesper.melin@gmail.com, wayofthefather@gmail.com
- **Roles:** Founder of CDP (Coaches Don't Play), Author of "Way of the Vikings", Community builder
- **Location:** Costa Blanca / Torrevieja, Spain (folkbokförd Malmö, Sweden)
- **Languages:** Swedish (native), English (fluent, daily use), Spanish (functional), some German

---

## 2. Writing Modes

### MODE A: Casual Swedish (team/internal)
**Used with:** Sanna, collaborators, friends, team
**Characteristics:**
- Short, punchy sentences
- Direct and action-oriented
- Uses numbered lists for instructions
- Casual openers: "Hej Sanna!", "Snabb heads up:"
- Signs off: "/J" or "Vi kör!"
- Mixes Swedish with English tech/business terms naturally ("content", "quote cards", "launch-posts")
- Never uses corporate filler
- Emoji: rarely, only when necessary

**Example phrases:**
- "Vi kör igång med dagligt content"
- "Om du får ett mail från mig som känns lite 'strukturerat' — det är assistenten"
- "Kan du filma en kort story-sekvens?"
- "Behöver de poleras/justeras innan vi postar?"

### MODE B: Formal Swedish (myndigheter/institutioner)
**Used with:** Skatteverket, Kronofogden, lawyers, formal institutions
**Characteristics:**
- Full, correct Swedish with no slang
- Respectful but firm
- Very structured: numbered points for each request
- Opens with full identification (name, personnummer, address)
- Always explains "bakgrunden" (context) before asking
- Vulnerable but dignified — never self-pitying
- Signs off: "Med vänliga hälsningar, Jesper Melin" with full contact info

**Example phrases:**
- "Jag skriver till er för att jag önskar få en fullständig sammanställning"
- "Det har aldrig funnits någon avsikt att undvika betalning"
- "Jag nås enklast via e-post på denna adress"

### MODE C: English Partnership Pitches
**Used with:** Brands (Goodr, NoBull, Whoop, TRX, LMNT, Gymshark, etc.)
**Characteristics:**
- Opens with a hook that connects to the recipient's brand DNA
- Very direct: "Hey," or "Hi [name],"
- Concrete numbers everywhere: "1,500+ members", "42 countries", "50-100 people daily"
- Short paragraphs (1-3 sentences max)
- Emotionally charged but not flowery
- Always includes proof points (Instagram, Skool, Beach Butler)
- Bold, confrontational CTAs: "Are you in?", "We built what you've been looking for"
- Signs as "Jesper / Captain J" with title and links
- Bullet lists for proposals

**Example phrases:**
- "No algorithms. No content theater. Just real training, real people, real results."
- "This isn't influencer marketing."
- "We're not asking for a sponsorship deal. We're asking if you want to be part of a movement."
- "Data doesn't lie. Neither do we."

### MODE D: Swedish Partnership Pitches
**Used with:** Swedish brands (NOCCO, Barebells, Craft)
**Characteristics:**
- Same punchy energy as English but in Swedish
- Uses Swedish identity as connection: "Barebells är svenskt. Vi är svenska."
- Raw, authentic: "Inte influencer-marketing. Det är en gemenskap."
- Mixes Swedish/English ("affiliate-kod", "micro-influencers", "organic content")
- Shorter than English versions — more gut-punch, less explanation

### MODE E: Spanish Business (local partnerships)
**Used with:** Local Spanish businesses, Hyrox España, ISDIN
**Characteristics:**
- Correct but not overly formal Spanish
- Community-focused angle
- Highlights international appeal (42 countries)
- Always mentions physical presence (Beach Butler, strandpromenaden)

---

## 3. Core Voice Attributes

| Attribute | Level | Description |
|-----------|-------|-------------|
| Directness | 9/10 | Gets to the point immediately. No warming up. |
| Authenticity | 10/10 | Never corporate-speak. Always real. |
| Confidence | 8/10 | Bold claims backed by numbers. Not arrogant. |
| Vulnerability | 7/10 | Shares struggle openly when relevant. Not performative. |
| Energy | 9/10 | High-energy, forward-moving. "Vi kör!" |
| Structure | 7/10 | Uses lists and numbers. Organized but not rigid. |
| Warmth | 6/10 | Warm with team, cooler with strangers. |

---

## 4. Signature Patterns

- **Em-dash (—)** used frequently for emphasis and asides
- **Short sentences** as standalone paragraphs for impact
- **Numbers** always concrete, never vague ("50-100", not "many")
- **Proof points** come naturally — Instagram, Skool, Beach Butler
- **CTAs** are confident questions: "Are you in?", "Vill du ändra världen tillsammans?"
- **Sign-offs** vary by mode: "/J", "Jesper / Captain J", "Med vänliga hälsningar"
- **No emojis** in business emails (rare exceptions)
- **Bullet lists** with "-" not "•"

---

## 5. Email Classification Schema

For Brain Core to categorize and learn from Jesper's mail:

```json
{
  "categories": {
    "partnership_pitch": {
      "description": "Outgoing sponsorship/collaboration pitches to brands",
      "priority": "high",
      "action": "track_responses",
      "subcategories": ["fitness_brands", "nutrition_brands", "tech_wearables", "local_business", "swedish_brands"]
    },
    "team_coordination": {
      "description": "Internal communication with team (Sanna, coaches, etc.)",
      "priority": "high",
      "action": "respond_or_delegate",
      "key_contacts": ["zannatrollstierna@gmail.com"]
    },
    "myndigheter": {
      "description": "Swedish government/institutional correspondence",
      "priority": "critical",
      "action": "flag_for_jesper",
      "subcategories": ["skatteverket", "kronofogden", "försäkringskassan"]
    },
    "community_skool": {
      "description": "Skool notifications, new members, comments",
      "priority": "medium",
      "action": "summarize_daily",
      "source": "noreply@skool.com"
    },
    "dev_ops": {
      "description": "Vercel, Render, GitHub deploy notifications",
      "priority": "low",
      "action": "auto_archive_unless_failure",
      "sources": ["notifications@vercel.com", "no-reply@render.com", "no-reply@github.com"]
    },
    "marketing_tools": {
      "description": "SaaS onboarding, newsletters, product updates",
      "priority": "low",
      "action": "auto_archive",
      "examples": ["Ollama", "Wispr Flow", "BookBeat"]
    },
    "delivery_failures": {
      "description": "Bounced emails, delivery status notifications",
      "priority": "medium",
      "action": "flag_and_suggest_fix",
      "source": "mailer-daemon@googlemail.com"
    },
    "security_alerts": {
      "description": "Login alerts, password changes, 2FA",
      "priority": "high",
      "action": "flag_immediately",
      "sources": ["no-reply@accounts.google.com", "security@mail.instagram.com"]
    },
    "personal": {
      "description": "Personal conversations, friends, family",
      "priority": "high",
      "action": "flag_for_jesper"
    }
  }
}
```

---

## 6. Daily Mail Summary Template

Brain Core should generate this for Jesper every morning:

```
📬 MAIL-SAMMANFATTNING [datum]

🔴 KRÄVER SVAR (X st):
- [Avsändare] — [Ämne] — [Kort sammanfattning] — [Föreslagen åtgärd]

🟡 BRA ATT VETA (X st):
- [Kategori]: [Sammanfattning]

🟢 AUTO-ARKIVERAT (X st):
- X dev-notifikationer (alla OK / Y failure)
- X nyhetsbrev
- X Skool-notiser (Z nya medlemmar, W kommentarer)

📤 VÄNTAR PÅ SVAR (X st):
- [Brand] — Pitchad [datum] — Inget svar ännu
- [Brand] — Pitchad [datum] — Bounced! Kontrollera adress

💡 REKOMMENDATION:
[AI-genererad rekommendation baserad på mönster]
```

---

## 7. Learning Triggers for Brain Core

Brain Core should learn from these patterns:

1. **When Jesper writes a new pitch** → Analyze structure, save as template variant
2. **When Jesper replies to someone** → Learn tone match for that contact
3. **When a pitch gets a response** → Mark as "effective", study what worked
4. **When a pitch bounces** → Flag bad address, suggest alternative
5. **When Jesper corrects an AI-drafted email** → High-priority learning signal
6. **When Jesper archives without reading** → Learn what to auto-archive
7. **When Jesper stars/flags something** → Learn what matters

---

## 8. Current Mail Stats (2026-03-27)

- **Total messages:** 434
- **Total threads:** 306
- **Unread:** ~50
- **Accounts:** 3 (jesper.melin89, jesper.melin, wayofthefather)
- **Active drafts in Gmail:** ~25+ (mostly partnership pitches for Viking Challenge)
- **Sent recently:** ~20 partnership pitches + team coordination with Sanna
- **Bounced:** 2 (craftsportswear.com, smiledentalspain.com — bad addresses)
- **Delivery delayed:** 1 (alegriarealestate.com)
- **New Skool customer:** Aldo Turra ($19/month) — 2026-03-26

---

## 9. Quiz Data for Brain Core Learning

Brain Core can generate quizzes from this data to verify learning:

```json
{
  "quiz_categories": [
    {
      "category": "tone_matching",
      "question_type": "Given this context, which writing mode would Jesper use?",
      "examples": [
        {"context": "Email to Gymshark about partnership", "answer": "MODE_C"},
        {"context": "Email to Kronofogden about debt", "answer": "MODE_B"},
        {"context": "Quick update to Sanna about Canva cards", "answer": "MODE_A"},
        {"context": "Email to NOCCO about sponsoring", "answer": "MODE_D"}
      ]
    },
    {
      "category": "phrase_prediction",
      "question_type": "Complete this sentence in Jesper's voice",
      "examples": [
        {"start": "We're not asking for a sponsorship deal. We're asking if you want to be part of...", "answer": "a movement that's already proven it works"},
        {"start": "Inte influencer-marketing. Det är...", "answer": "en gemenskap"}
      ]
    },
    {
      "category": "email_classification",
      "question_type": "Classify this incoming email",
      "examples": [
        {"from": "noreply@skool.com", "subject": "New customer: X ($19/month)", "answer": "community_skool"},
        {"from": "no-reply@render.com", "subject": "build failed for cdp-hub-api", "answer": "dev_ops"},
        {"from": "mailer-daemon@googlemail.com", "subject": "Delivery Status Notification", "answer": "delivery_failures"}
      ]
    }
  ]
}
```
