// Prototype copy. The questions and the first patent answer come from the
// Figma sketch; every other answer and every source is placeholder text
// written for the demo and needs review by the AI team before anyone outside
// the firm reads it.

export type SourceKind = 'web' | 'document' | 'research'

export type Source = {
  kind: SourceKind
  title: string
  detail: string
}

export type Question = {
  id: string
  question: string
  /** One-line version shown by default; the gutter icon swaps to `answer`. */
  tldr: string
  answer: string
  sources: Source[]
  updated: string
}

export type Section = {
  id: string
  title: string
  questions: Question[]
}

const POLICY: Source = {
  kind: 'document',
  title: 'Wolf Greenfield AI Use Policy',
  detail: 'Internal policy document',
}
const ABA_512: Source = {
  kind: 'web',
  title: 'ABA Formal Opinion 512',
  detail: 'Generative artificial intelligence tools, July 2024',
}
const USPTO: Source = {
  kind: 'web',
  title: 'USPTO guidance on AI-based tools',
  detail: 'Practice before the USPTO, April 2024',
}
const REVIEW: Source = {
  kind: 'research',
  title: 'Tool evaluation notes',
  detail: 'AI working group, internal',
}
const TRAINING: Source = {
  kind: 'document',
  title: 'AI training curriculum',
  detail: 'Professional development, internal',
}

export const sections: Section[] = [
  {
    id: 'use',
    title: 'The firm’s use of AI',
    questions: [
      {
        id: 'use-ai',
        tldr: 'Yes, with a small set of approved tools. Attorneys stay responsible for the work.',
        question: 'Does Wolf Greenfield use AI in its legal work?',
        answer:
          'Yes. We use a small set of approved AI tools to support work our attorneys and staff already do, such as research, first drafts and document review. Attorneys stay responsible for the advice and the work product you receive.',
        sources: [POLICY, ABA_512],
        updated: '2026-11-12',
      },
      {
        id: 'use-for',
        tldr: 'Groundwork like research, first drafts and document review. Never legal decisions.',
        question: 'What does the firm use AI for?',
        answer:
          'Mostly for time-consuming groundwork: searching and summarizing prior art and case law, producing first drafts, comparing documents, and organizing large sets of material. We do not use AI to make legal decisions or to communicate with clients on an attorney’s behalf.',
        sources: [POLICY, REVIEW],
        updated: '2026-10-30',
      },
      {
        id: 'use-how-far',
        tldr: 'Past the pilot stage for a few tested uses, still evaluating others.',
        question: 'How far along is the firm in using AI?',
        answer:
          'We are past the pilot stage for a few well-tested uses and still evaluating others. Each new use goes through the same review before it reaches client work, so adoption is deliberate rather than fast.',
        sources: [REVIEW],
        updated: '2026-09-18',
      },
    ],
  },
  {
    id: 'patent',
    title: 'Patent work',
    questions: [
      {
        id: 'patent-use',
        tldr: 'Yes, selectively, and qualified attorneys review all of it.',
        question:
          'Does the firm use AI for patent work such as searching, drafting applications, and responding to office actions?',
        answer:
          'Yes. We use AI selectively to support patent searches, application drafting, and responses to office actions. These tools complement—not replace—our attorneys’ technical expertise and legal judgment. All AI-assisted work is reviewed by qualified attorneys, and our use is subject to client confidentiality obligations and applicable professional standards.',
        sources: [USPTO, POLICY, REVIEW],
        updated: '2026-11-20',
      },
      {
        id: 'patent-checks',
        tldr: 'The registered attorney or agent on your matter, before anything is filed.',
        question: 'Who checks AI-supported patent work?',
        answer:
          'The registered attorney or agent responsible for your matter. They review every AI-assisted search, draft and response before it is filed or sent, as the USPTO expects of anyone who signs a submission.',
        sources: [USPTO, POLICY],
        updated: '2026-11-02',
      },
      {
        id: 'patent-strategy',
        tldr: 'No. Your attorney decides strategy and writes your claims with you.',
        question: 'Does AI decide patent strategy or write my claims?',
        answer:
          'No. Strategy and claim scope are decided by your attorney with you. AI may help produce a starting draft or flag related art, but every claim is written and approved by a person who understands your invention and your goals.',
        sources: [POLICY],
        updated: '2026-10-14',
      },
    ],
  },
  {
    id: 'control',
    title: 'Client control',
    questions: [
      {
        id: 'control-consent',
        tldr: 'Not for routine, confidential uses. We ask before anything beyond that.',
        question: 'Does the firm need my consent before using AI on my matter?',
        answer:
          'For routine uses that keep your information inside approved, confidential tools, the professional rules generally do not require separate consent. Where a use would share your information more widely or affect fees, we ask first.',
        sources: [ABA_512, POLICY],
        updated: '2026-11-08',
      },
      {
        id: 'control-opt-out',
        tldr: 'Yes. Tell your relationship attorney and the team will follow it.',
        question: 'Can I opt out of AI, or limit how it is used on my matters?',
        answer:
          'Yes. Tell your relationship attorney what you would like, whether that is no AI at all or limits on specific tools or tasks. We record the instruction on your matters and the team follows it.',
        sources: [POLICY],
        updated: '2026-10-21',
      },
      {
        id: 'control-guidelines',
        tldr: 'Yes. Send them over and we’ll confirm how we line up.',
        question: 'Will the firm follow my company’s own AI guidelines?',
        answer:
          'Yes. Send us your guidelines and we will confirm how our tools and practices line up with them, and flag anything we would need to change on your matters.',
        sources: [POLICY],
        updated: '2026-09-29',
      },
      {
        id: 'control-ask',
        tldr: 'If you’ve asked us to, yes. Otherwise only for uses outside our policy.',
        question: 'Will the firm ask me before using AI on my work?',
        answer:
          'If you have asked us to, yes. Otherwise we use approved tools for routine tasks under our policy, and ask before any use that falls outside it.',
        sources: [POLICY, ABA_512],
        updated: '2026-09-29',
      },
      {
        id: 'control-info',
        tldr: 'Yes. Your attorney can tell you which tools were used and how.',
        question: 'Can I request information about the AI tools used on my matters?',
        answer:
          'Yes. Your attorney can tell you which tools were used, what they were used for, and how your information was protected.',
        sources: [POLICY],
        updated: '2026-08-15',
      },
    ],
  },
  {
    id: 'oversight',
    title: 'Oversight and review',
    questions: [
      {
        id: 'oversight-person',
        tldr: 'Always, before anything reaches you, a court or a patent office.',
        question: 'Does a person check the work AI helps produce?',
        answer:
          'Always. Nothing AI helps produce reaches a client, court or patent office until a qualified person has reviewed it and takes responsibility for it.',
        sources: [ABA_512, POLICY],
        updated: '2026-11-15',
      },
      {
        id: 'oversight-judgment',
        tldr: 'No. Judgment stays with your attorney.',
        question: 'Can AI replace my attorney’s judgment?',
        answer:
          'No. AI can speed up research and drafting, but judgment about your matter stays with your attorney, who is accountable to you and to the professional rules.',
        sources: [ABA_512],
        updated: '2026-10-05',
      },
      {
        id: 'oversight-ethics',
        tldr: 'Yes. Our policy is built on the professional rules, including ABA Opinion 512.',
        question: 'Does the firm follow legal ethics rules when it uses AI?',
        answer:
          'Yes. Our policy is built on the duties of competence, confidentiality, supervision and reasonable fees, and follows ABA Formal Opinion 512 and guidance from the courts and agencies we practice before.',
        sources: [ABA_512, USPTO, POLICY],
        updated: '2026-10-05',
      },
      {
        id: 'oversight-policy',
        tldr: 'Yes, reviewed at least once a year.',
        question: 'Does the firm have a written AI policy?',
        answer:
          'Yes. It sets out which tools are approved, what information may go into them, how work must be reviewed, and who to ask when something is unclear. It is reviewed at least once a year.',
        sources: [POLICY],
        updated: '2026-07-01',
      },
      {
        id: 'oversight-tools',
        tldr: 'Each tool is reviewed for data handling, accuracy and contract terms.',
        question: 'How does the firm decide which AI tools its people can use?',
        answer:
          'Each tool is reviewed by the AI working group with IT security and the general counsel’s office. We look at how the vendor handles data, whether it trains on our inputs, accuracy on real tasks, and contract terms.',
        sources: [REVIEW, POLICY],
        updated: '2026-09-10',
      },
      {
        id: 'oversight-after',
        tldr: 'Training first, monitoring after, and re-review when the tool changes.',
        question: 'What happens after the firm approves an AI tool?',
        answer:
          'People are trained before they get access, use is monitored, and the tool is re-reviewed when the vendor changes terms or features. Tools that stop meeting our standards are withdrawn.',
        sources: [REVIEW],
        updated: '2026-09-10',
      },
      {
        id: 'oversight-training',
        tldr: 'Yes. Training is required before anyone uses a tool on client work.',
        question: 'Are attorneys and staff trained to use AI?',
        answer:
          'Yes. Training covers what each tool is good and bad at, how to protect client information, and how to check the output. It is required before anyone uses a tool on client work.',
        sources: [TRAINING, POLICY],
        updated: '2026-08-22',
      },
    ],
  },
]

// Which sentences of an answer each source supports, for the detail panel's
// source highlighting. Prototype only: a keyword cue per source stands in for
// real, authored citations. A source with no cue match falls back to one
// sentence so every source highlights something.
const CUES: Record<string, RegExp> = {
  [ABA_512.title]: /rule|ethic|consent|confidential|fee|judgment|accountab|professional|supervis|ask first/i,
  [USPTO.title]: /USPTO|patent|filed|office action|signs|submission|claim/i,
  [POLICY.title]: /polic|approved|we use|we do not|instruction|record|team follows|guidelines|tools/i,
  [REVIEW.title]: /review|evaluat|vendor|pilot|security|accura|contract|withdrawn|monitor|stage/i,
  [TRAINING.title]: /train|check the output|good and bad/i,
}

export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:\s+|$)/g) ?? [text]
}

export function citations(q: Question): number[][] {
  const sentences = splitSentences(q.answer)
  return q.sources.map((src, i) => {
    const cue = CUES[src.title]
    const hits = sentences.flatMap((t, n) => (cue?.test(t) ? [n] : []))
    return hits.length ? hits : [i % sentences.length]
  })
}
