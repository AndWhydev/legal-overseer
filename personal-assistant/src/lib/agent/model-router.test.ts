import { describe, it, expect } from 'vitest'
import {
  selectModel,
  getModel,
  getAllModels,
  routeToModel,
  type ModelTier,
} from './model-router'

describe('getModel', () => {
  it('returns opus model config', () => {
    const model = getModel('opus')

    expect(model.id).toBe('claude-opus-4-20250514')
    expect(model.tier).toBe('opus')
    expect(model.maxTokens).toBe(8192)
    expect(model.description).toContain('Complex reasoning')
  })

  it('returns sonnet model config', () => {
    const model = getModel('sonnet')

    expect(model.id).toBe('claude-sonnet-4-5-20250929')
    expect(model.tier).toBe('sonnet')
    expect(model.maxTokens).toBe(4096)
    expect(model.description).toContain('Standard CRUD')
  })

  it('returns haiku model config', () => {
    const model = getModel('haiku')

    expect(model.id).toBe('claude-haiku-4-5-20251001')
    expect(model.tier).toBe('haiku')
    expect(model.maxTokens).toBe(2048)
    expect(model.description).toContain('Classification')
  })
})

describe('getAllModels', () => {
  it('returns all three models', () => {
    const models = getAllModels()

    expect(models).toHaveLength(3)
    expect(models.map((m) => m.tier)).toEqual(
      expect.arrayContaining(['opus', 'sonnet', 'haiku']),
    )
  })

  it('returns complete model config objects', () => {
    const models = getAllModels()

    for (const model of models) {
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('tier')
      expect(model).toHaveProperty('maxTokens')
      expect(model).toHaveProperty('description')
      expect(typeof model.id).toBe('string')
      expect(model.maxTokens).toBeGreaterThan(0)
    }
  })
})

describe('selectModel', () => {
  describe('opus selection', () => {
    it('selects opus for "plan" keyword', () => {
      const result = selectModel('Help me plan and design the next quarter')

      expect(result.tier).toBe('opus')
      expect(result.model).toBe('claude-opus-4-20250514')
      expect(result.reasoning).toContain('trigger')
    })

    it('selects opus for "strategy" keyword', () => {
      const result = selectModel('What strategy and plan should we follow?')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "analyze" keyword', () => {
      const result = selectModel('Analyze and compare the market trends')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "compare" keyword', () => {
      const result = selectModel('Compare and evaluate these two approaches')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "evaluate" keyword', () => {
      const result = selectModel('Evaluate and prioritize these options')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "design" keyword', () => {
      const result = selectModel('Design and architect a new system')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "architect" keyword', () => {
      const result = selectModel('How should we architect and design this solution?')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "optimize" keyword', () => {
      const result = selectModel('Optimize and architect the database queries')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "recommend" keyword', () => {
      const result = selectModel('Recommend and optimize the best approach')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "prioritize" keyword', () => {
      const result = selectModel('Prioritize and evaluate these features')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "what should" phrase', () => {
      const result = selectModel('What should we do and how should we plan?')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "how should" phrase', () => {
      const result = selectModel('How should we implement this and what should be considered?')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "why did" phrase', () => {
      const result = selectModel('Why did the system fail and how should we fix it?')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "help me think" phrase', () => {
      const result = selectModel('Help me think through this decision')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "trade-off" keyword', () => {
      const result = selectModel('What are the trade-offs and pros and cons?')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "pros and cons" phrase', () => {
      const result = selectModel('What are the pros and cons and trade-offs?')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "decision" keyword', () => {
      const result = selectModel('Help me think about this decision and strategy')

      expect(result.tier).toBe('opus')
    })

    it('selects opus for "explain why" phrase', () => {
      const result = selectModel('Explain why this approach is better and analyze the trade-offs')

      expect(result.tier).toBe('opus')
    })

    it('requires at least 2 opus triggers', () => {
      const result = selectModel('Plan and design the system architecture')

      expect(result.tier).toBe('opus')
    })

    it('requires 2+ triggers (plan + what should)', () => {
      const result = selectModel('What should I plan?')

      expect(result.tier).toBe('opus')
    })
  })

  describe('haiku selection', () => {
    it('selects haiku for "classify" keyword', () => {
      const result = selectModel('Classify this text')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "categorize" keyword', () => {
      const result = selectModel('Categorize these items')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "is this" phrase', () => {
      const result = selectModel('Is this a valid email?')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "yes or no" phrase', () => {
      const result = selectModel('Yes or no, is this correct?')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "which category" phrase', () => {
      const result = selectModel('Which category does this belong to?')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "sort these" phrase', () => {
      const result = selectModel('Sort these by priority')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "label" keyword', () => {
      const result = selectModel('Label each item')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "tag" keyword', () => {
      const result = selectModel('Tag these posts')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "triage" keyword', () => {
      const result = selectModel('Triage these support tickets')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "filter" keyword', () => {
      const result = selectModel('Filter the valid entries')

      expect(result.tier).toBe('haiku')
    })

    it('selects haiku for "which one" phrase', () => {
      const result = selectModel('Which one should I pick?')

      expect(result.tier).toBe('haiku')
    })

    it('requires at least 2 haiku triggers', () => {
      const result = selectModel('Classify and categorize')

      expect(result.tier).toBe('haiku')
    })
  })

  describe('sonnet selection (default)', () => {
    it('selects sonnet by default', () => {
      const result = selectModel('Hello world')

      expect(result.tier).toBe('sonnet')
      expect(result.reasoning).toContain('Default')
    })

    it('selects sonnet for standard queries', () => {
      const result = selectModel('Get the user data')

      expect(result.tier).toBe('sonnet')
    })
  })

  describe('complexity heuristics', () => {
    it('selects opus for long prompts (>500 words)', () => {
      const longPrompt = Array(600)
        .fill('word')
        .join(' ')

      const result = selectModel(longPrompt)

      expect(result.tier).toBe('opus')
      expect(result.reasoning).toContain('Long')
    })

    it('selects opus for multi-instruction prompts', () => {
      const multiLine = `First, do this.
      Second, do that.
      Third, consider this aspect.
      Fourth, analyze the result.
      This is a complex multi-instruction task with many steps and considerations that requires careful planning and analysis to ensure all aspects are properly addressed and integrated together.`

      const result = selectModel(multiLine)

      expect(result.tier).toBe('opus')
    })

    it('selects opus for prompts with 2+ questions (>100 words)', () => {
      const prompt = `What are the best practices for API design?
        And how should we handle versioning?
        This is a longer prompt to meet the word count requirement.`

      const result = selectModel(prompt)

      expect(result.tier).toBe('opus')
    })

    it('selects haiku for short simple query (< 15 words)', () => {
      const result = selectModel('Is this valid?')

      expect(result.tier).toBe('haiku')
      expect(result.reasoning).toContain('Short')
    })
  })

  describe('context parameter', () => {
    it('includes context in model selection', () => {
      const result = selectModel('analyze data', 'Compare quarterly revenue trends')

      expect(result.tier).toBe('opus')
    })

    it('combines prompt and context for keyword matching', () => {
      const result = selectModel('Check this', 'Please evaluate the strategy')

      expect(result.tier).toBe('opus')
    })
  })

  describe('reasoning field', () => {
    it('includes reasoning for opus selection', () => {
      const result = selectModel('Plan the strategy')

      expect(result.reasoning).toBeDefined()
      expect(result.reasoning.length).toBeGreaterThan(0)
      expect(result.reasoning).toContain('Matched')
    })

    it('includes word count in reasoning', () => {
      const longPrompt = Array(600)
        .fill('word')
        .join(' ')

      const result = selectModel(longPrompt)

      expect(result.reasoning).toContain('word')
    })
  })

  describe('edge cases', () => {
    it('handles case-insensitive keyword matching', () => {
      const result = selectModel('PLAN the strategy')

      expect(result.tier).toBe('opus')
    })

    it('handles mixed case context', () => {
      const result = selectModel('analyze', 'COMPARE these options')

      expect(result.tier).toBe('opus')
    })

    it('returns default for empty prompt', () => {
      const result = selectModel('')

      expect(result.tier).toBe('sonnet')
    })

    it('handles single opus trigger (needs 2)', () => {
      const result = selectModel('Plan something')

      // 'plan' is 1 trigger, needs 2
      expect(result.tier).not.toBe('opus')
    })

    it('handles single haiku trigger without complexity', () => {
      const result = selectModel('Is this right?')

      // 'is this' is 1 trigger, but word count < 15 and haikuScore >= 1
      // so it actually selects haiku based on line 81-82 of source
      expect(result.tier).toBe('haiku')
    })
  })
})

describe('routeToModel (deprecated)', () => {
  it('returns the tier from selectModel', () => {
    const selection = selectModel('Plan the strategy')
    const tier = routeToModel('Plan the strategy')

    expect(tier).toBe(selection.tier)
  })

  it('maintains backward compatibility', () => {
    const result = routeToModel('Classify this')

    expect(result).toBe('haiku')
  })
})

describe('model tier consistency', () => {
  it('all models have consistent tier and id relationship', () => {
    const models = getAllModels()

    for (const model of models) {
      const fetched = getModel(model.tier as ModelTier)
      expect(fetched.id).toBe(model.id)
      expect(fetched.maxTokens).toBe(model.maxTokens)
    }
  })

  it('selectModel returns valid model id', () => {
    const selection = selectModel('Plan something or analyze data')
    const modelConfig = getModel(selection.tier)

    expect(selection.model).toBe(modelConfig.id)
  })
})
