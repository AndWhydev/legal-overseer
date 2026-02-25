// ============================================
// Agent Confidence Extraction
// ============================================
// Parses Claude's responses for confidence indicators and escalation triggers

/**
 * Confidence assessment extracted from agent response
 */
export interface ConfidenceAssessment {
  /** Confidence level category */
  level: 'high' | 'medium' | 'low';

  /** Numeric score 0-100 */
  score: number;

  /** Reasoning for the confidence level */
  reasoning: string;

  /** Whether this should be escalated to human */
  should_escalate: boolean;

  /** Reason for escalation if applicable */
  escalation_reason?: string;
}

/**
 * Escalation trigger patterns and their reasons
 */
const ESCALATION_TRIGGERS = [
  {
    pattern: /\b(legal|lawyer|sue|lawsuit|attorney|court)\b/i,
    reason: 'Legal threat detected',
  },
  {
    pattern: /\b(chargeback|dispute|bank\s+dispute|credit\s+card\s+dispute|paypal\s+dispute)\b/i,
    reason: 'Chargeback/payment dispute',
  },
  {
    pattern: /\b(unsafe|hurt|injured|injury|allergic|allergies|reaction|rash|burn|sick|ill|hospital|doctor|emergency)\b/i,
    reason: 'Safety complaint',
  },
  {
    pattern: /\b(influencer|creator|contract|collaboration|partnership|sponsorship)\b.*\b(dispute|issue|problem|cancel|breach)\b/i,
    reason: 'Influencer contract issue',
  },
  {
    pattern: /\b(dispute|issue|problem|cancel|breach)\b.*\b(influencer|creator|contract|collaboration|partnership|sponsorship)\b/i,
    reason: 'Influencer contract issue',
  },
  {
    pattern: /\b(accc|consumer\s+affairs|fair\s+trading|ombudsman|regulatory|report\s+you)\b/i,
    reason: 'Regulatory/consumer complaint threat',
  },
  {
    pattern: /\b(scam|fraud|fraudulent|rip\s*off|ripped\s+off|steal|stole|stolen\s+money)\b/i,
    reason: 'Fraud/scam accusation',
  },
];

/**
 * Confidence indicator patterns for explicit confidence statements
 */
const CONFIDENCE_PATTERNS = {
  explicit: [
    // Explicit percentage: "Confidence: HIGH (85%)" or "confidence: 85%"
    /confidence[:\s]+(?:high|medium|low)?\s*\(?(\d{1,3})%?\)?/i,
    // Just percentage: "85% confident"
    /(\d{1,3})%\s*confident/i,
  ],
  highIndicators: [
    /confidence[:\s]+high/i,
    /\b(certain|definitely|clearly|straightforward|standard|routine)\b/i,
    /clear\s+policy\s+match/i,
    /\bwismo\b.*valid/i,
  ],
  mediumIndicators: [
    /confidence[:\s]+medium/i,
    /\b(probably|likely|should\s+be|appears\s+to|seems\s+like)\b/i,
    /some\s+ambiguity/i,
    /need\s+clarification/i,
  ],
  lowIndicators: [
    /confidence[:\s]+low/i,
    /\b(uncertain|unsure|unclear|not\s+sure|don't\s+know|cannot\s+determine)\b/i,
    /\b(edge\s+case|unusual|exception|escalate)\b/i,
    /needs?\s+human\s+review/i,
  ],
};

/**
 * Extract confidence assessment from Claude's response text
 *
 * Looks for:
 * - Explicit confidence statements (e.g., "Confidence: HIGH (85%)")
 * - Implicit confidence indicators (e.g., "I'm certain", "unclear")
 * - Escalation triggers in the response
 */
export function extractConfidence(responseText: string): ConfidenceAssessment {
  // First, try to extract explicit percentage
  let score: number | null = null;

  for (const pattern of CONFIDENCE_PATTERNS.explicit) {
    const match = responseText.match(pattern);
    if (match && match[1]) {
      score = parseInt(match[1], 10);
      if (score > 100) score = 100;
      if (score < 0) score = 0;
      break;
    }
  }

  // If no explicit score, infer from indicators
  if (score === null) {
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    for (const pattern of CONFIDENCE_PATTERNS.highIndicators) {
      if (pattern.test(responseText)) highCount++;
    }
    for (const pattern of CONFIDENCE_PATTERNS.mediumIndicators) {
      if (pattern.test(responseText)) mediumCount++;
    }
    for (const pattern of CONFIDENCE_PATTERNS.lowIndicators) {
      if (pattern.test(responseText)) lowCount++;
    }

    // Determine score based on indicator balance
    if (lowCount > highCount && lowCount > mediumCount) {
      score = 35;
    } else if (highCount > mediumCount && highCount > lowCount) {
      score = 85;
    } else if (mediumCount > 0) {
      score = 65;
    } else {
      // Default to medium-high if no clear indicators
      score = 75;
    }
  }

  // Determine level from score
  let level: 'high' | 'medium' | 'low';
  if (score >= 80) {
    level = 'high';
  } else if (score >= 50) {
    level = 'medium';
  } else {
    level = 'low';
  }

  // Check for escalation triggers in the response
  let escalationReason: string | undefined;
  for (const trigger of ESCALATION_TRIGGERS) {
    if (trigger.pattern.test(responseText)) {
      escalationReason = trigger.reason;
      break;
    }
  }

  // Build reasoning
  let reasoning: string;
  if (score >= 80) {
    reasoning = 'High confidence - clear policy match or straightforward case';
  } else if (score >= 50) {
    reasoning = 'Medium confidence - some ambiguity but manageable';
  } else {
    reasoning = 'Low confidence - uncertainty or policy edge case';
  }

  // Determine if should escalate
  const shouldEscalate = score < 50 || !!escalationReason;

  return {
    level,
    score,
    reasoning,
    should_escalate: shouldEscalate,
    escalation_reason: escalationReason,
  };
}

/**
 * Check incoming message for automatic escalation triggers
 *
 * This runs BEFORE calling Claude to catch obvious escalation cases early.
 * Returns the escalation reason if a trigger is found, null otherwise.
 */
export function checkEscalationTriggers(message: string): string | null {
  for (const trigger of ESCALATION_TRIGGERS) {
    if (trigger.pattern.test(message)) {
      return trigger.reason;
    }
  }
  return null;
}

/**
 * Combine pre-check escalation with Claude's response assessment
 */
export function assessFullConfidence(
  message: string,
  responseText: string
): ConfidenceAssessment {
  // First check for pre-escalation triggers in the original message
  const preEscalation = checkEscalationTriggers(message);

  // Extract confidence from Claude's response
  const assessment = extractConfidence(responseText);

  // If pre-escalation trigger found, override
  if (preEscalation) {
    return {
      ...assessment,
      should_escalate: true,
      escalation_reason: preEscalation,
      // Lower score if not already low
      score: Math.min(assessment.score, 40),
      level: 'low',
      reasoning: `Escalation required: ${preEscalation}`,
    };
  }

  return assessment;
}
