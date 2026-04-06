import Anthropic from '@anthropic-ai/sdk'
import { generateImage } from 'ai'
import { logger } from '@/lib/core/logger'
import type { AgentToolHandler } from '../tools'

export const imageToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'generate_image',
    description:
      'Generate an image from a text prompt using AI. Returns a base64-encoded image. Use for: product photos, social media graphics, hero images, illustrations, brand assets, data visualization mockups, presentation visuals. Craft detailed prompts describing style, composition, lighting, and subject for best results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate. Include style, composition, lighting, colors, and subject. More detail = better results.',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          description: 'Image aspect ratio. 1:1 for social/profile, 16:9 for hero/banner, 9:16 for stories/mobile, 4:3 for presentations. Default: 1:1',
        },
        style: {
          type: 'string',
          enum: ['photorealistic', 'illustration', 'flat-design', 'watercolor', '3d-render', 'sketch', 'minimalist'],
          description: 'Visual style hint. Appended to prompt for consistency. Default: photorealistic',
        },
        model: {
          type: 'string',
          enum: ['google/imagen-4.0-generate-001', 'google/imagen-4.0-fast-generate-001', 'openai/gpt-image-1'],
          description: 'Image model to use. Default: google/imagen-4.0-fast-generate-001 (fast, high quality). Use imagen-4.0-generate-001 for highest quality, openai/gpt-image-1 for different aesthetic.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_images',
    description:
      'Generate multiple images from a text prompt. Returns an array of base64-encoded images. Use when the user needs variations or multiple options to choose from.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the images to generate.',
        },
        count: {
          type: 'number',
          description: 'Number of images to generate (2-4). Default: 2',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          description: 'Image aspect ratio. Default: 1:1',
        },
        model: {
          type: 'string',
          enum: ['google/imagen-4.0-generate-001', 'google/imagen-4.0-fast-generate-001', 'openai/gpt-image-1'],
          description: 'Image model. Default: google/imagen-4.0-fast-generate-001',
        },
      },
      required: ['prompt'],
    },
  },
]

const STYLE_SUFFIXES: Record<string, string> = {
  photorealistic: ', photorealistic, professional photography, high resolution',
  illustration: ', digital illustration, clean vector style',
  'flat-design': ', flat design, minimal, clean geometric shapes',
  watercolor: ', watercolor painting style, soft edges, artistic',
  '3d-render': ', 3D rendered, cinema 4D style, high detail',
  sketch: ', pencil sketch, hand-drawn style, detailed linework',
  minimalist: ', minimalist design, white space, simple clean composition',
}

export const imageToolHandlers: Record<string, AgentToolHandler> = {
  async generate_image(input) {
    const { prompt, aspect_ratio, style, model } = input as {
      prompt: string
      aspect_ratio?: string
      style?: string
      model?: string
    }

    const fullPrompt = style && STYLE_SUFFIXES[style]
      ? `${prompt}${STYLE_SUFFIXES[style]}`
      : prompt

    const modelId = model || 'google/imagen-4.0-fast-generate-001'

    try {
      const { image } = await generateImage({
        model: modelId,
        prompt: fullPrompt,
        aspectRatio: (aspect_ratio || '1:1') as `${number}:${number}`,
      })

      logger.info('[generate_image] Generated image', { model: modelId, aspectRatio: aspect_ratio || '1:1' })

      return {
        success: true,
        image_base64: image.base64,
        model_used: modelId,
        prompt_used: fullPrompt,
      }
    } catch (error) {
      logger.error('[generate_image] Failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image generation failed',
      }
    }
  },

  async generate_images(input) {
    const { prompt, count, aspect_ratio, model } = input as {
      prompt: string
      count?: number
      aspect_ratio?: string
      model?: string
    }

    const n = Math.min(Math.max(count || 2, 2), 4)
    const modelId = model || 'google/imagen-4.0-fast-generate-001'

    try {
      const { images } = await generateImage({
        model: modelId,
        prompt,
        aspectRatio: (aspect_ratio || '1:1') as `${number}:${number}`,
        n,
      })

      logger.info('[generate_images] Generated images', { model: modelId, count: images.length })

      return {
        success: true,
        images: images.map((img, i) => ({
          index: i,
          base64: img.base64,
        })),
        count: images.length,
        model_used: modelId,
      }
    } catch (error) {
      logger.error('[generate_images] Failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image generation failed',
      }
    }
  },
}
